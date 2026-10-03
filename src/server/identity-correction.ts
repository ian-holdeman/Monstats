import { createHash } from 'node:crypto';
import { gzipSync, gunzipSync } from 'node:zlib';
import assert from 'node:assert/strict';
import { aggregate } from '../domain/analytics';
import { NORMALIZATION_VERSION } from '../domain/normalize';
import {
  analyticalSpeciesId,
  SPECIES_EQUIVALENCE_VERSION,
} from '../domain/species-identity';
import {
  canonicalizeLadder,
  validateLadder,
  ladderKey,
  type LadderDataset,
} from '../domain/ladder';
import type { NormalizedEvent, PublishedDataset } from '../domain/types';
import { Store } from './store';
import { encodePublication } from './codec';
import { buildMatchupIndex, matchupSchema } from './matchup-index';
import { backfillEvidence } from './evidence-index';

export function correctEvent(event: NormalizedEvent): NormalizedEvent {
  return {
    ...event,
    identityCorrection: SPECIES_EQUIVALENCE_VERSION,
    registrations: event.registrations.map((r) => ({
      ...r,
      slots:
        r.slots?.map((s) =>
          analyticalSpeciesId(s.id) === 'sinistcha'
            ? { ...s, id: 'sinistcha', name: 'Sinistcha' }
            : s,
        ) ?? null,
    })),
  };
}
export function correctPublication(before: PublishedDataset): PublishedDataset {
  const events = before.events.map(correctEvent);
  const views: PublishedDataset['views'] = {};
  const shared = new Map<object, ReturnType<typeof aggregate>>();
  for (const key of Object.keys(before.views)) {
    const old = before.views[key];
    let view = shared.get(old.pokemon);
    if (!view) {
      view = aggregate(events, old.options);
      shared.set(old.pokemon, view);
    }
    views[key] = { ...view, options: old.options };
    assert.deepEqual(
      views[key].coverage,
      old.coverage,
      `Cohort totals changed: ${before.id}/${key}`,
    );
    for (const row of old.pokemon.filter(
      (r) => analyticalSpeciesId(r.id) !== 'sinistcha',
    )) {
      const after = views[key].pokemon.find((r) => r.id === row.id)!;
      // Legacy versions predate supplemental evidence, but rates/counts must
      // remain exact. Existing evidence is checked when present.
      const { evidence, ...metrics } = after;
      assert.deepEqual(
        row.evidence ? after : metrics,
        row,
        `Unrelated usage/outcome changed: ${row.id}`,
      );
      void evidence;
    }
  }
  const id = createHash('sha256')
    .update(SPECIES_EQUIVALENCE_VERSION)
    .update(before.id)
    .digest('hex')
    .slice(0, 16);
  return {
    ...before,
    id,
    events,
    views,
    normalizationVersion: NORMALIZATION_VERSION,
  };
}

// Explicit operational transformation. Never invoked by a route or collector.
// Caller supplies the fenced cloud lease when integrating a production migration.
export function correctSavedIdentities(store: Store) {
  if (store.db.prepare('SELECT 1 FROM leases WHERE expires>?').get(Date.now()))
    throw new Error(
      'Correction requires an idle isolated database / fenced maintenance owner',
    );
  const state = store.db
    .prepare('SELECT * FROM collector_state ORDER BY name')
    .all();
  const refresh = store.status();
  const report: {
    kind: string;
    before: string;
    after: string;
    counts?: unknown;
  }[] = [];
  store.db.exec(
    'CREATE TABLE IF NOT EXISTS identity_corrections (kind TEXT NOT NULL, original TEXT NOT NULL, corrected TEXT NOT NULL, version TEXT NOT NULL, PRIMARY KEY(kind,original,version))',
  );
  matchupSchema(store.db);
  const mapped = store.db.prepare(
    'SELECT corrected FROM identity_corrections WHERE kind=? AND original=? AND version=?',
  );
  // Prepare all immutable versions and indexes first. Selection changes only
  // after every result succeeds; a crash leaves unselected prepared artifacts.
  for (const row of store.db
    .prepare('SELECT DISTINCT version_id FROM pointers')
    .all()) {
    const old = store.version(String(row.version_id))!;
    if (
      !old.events.some((e) =>
        e.registrations.some((r) =>
          r.slots?.some((s) => s.id === 'sinistchamasterpiece'),
        ),
      )
    )
      continue;
    const already = mapped.get(
      'tournament',
      old.id,
      SPECIES_EQUIVALENCE_VERSION,
    );
    if (already) {
      if (!store.version(String(already.corrected)))
        throw new Error('Prepared correction missing');
      report.push({
        kind: 'tournament',
        before: old.id,
        after: String(already.corrected),
      });
      continue;
    }
    const corrected = correctPublication(old);
    store.db.exec('BEGIN IMMEDIATE');
    try {
      store.db
        .prepare('INSERT OR IGNORE INTO versions VALUES (?,?,?,?)')
        .run(
          corrected.id,
          corrected.regulation ?? store.activeRegulation(),
          corrected.publishedAt,
          encodePublication(corrected),
        );
      buildMatchupIndex(store.db, corrected);
      store.db.exec('COMMIT');
    } catch (error) {
      store.db.exec('ROLLBACK');
      throw error;
    }
    backfillEvidence(store.db, corrected);
    store.db
      .prepare('INSERT INTO identity_corrections VALUES (?,?,?,?)')
      .run('tournament', old.id, corrected.id, SPECIES_EQUIVALENCE_VERSION);
    report.push({
      kind: 'tournament',
      before: old.id,
      after: corrected.id,
      counts: {
        before: old.views['all:0'].pokemon.filter(
          (r) => analyticalSpeciesId(r.id) === 'sinistcha',
        ),
        after: corrected.views['all:0'].pokemon.find(
          (r) => r.id === 'sinistcha',
        ),
        coverage: corrected.views['all:0'].coverage,
      },
    });
  }
  const ladderExists = store.db
    .prepare("SELECT 1 FROM sqlite_master WHERE name='ladder_versions'")
    .get();
  if (ladderExists)
    for (const row of store.db
      .prepare(
        'SELECT v.id,v.payload FROM ladder_versions v JOIN ladder_pointers p ON p.version_id=v.id',
      )
      .all()) {
      const old = JSON.parse(
        gunzipSync(row.payload as Uint8Array).toString(),
      ) as LadderDataset;
      const prepared = mapped.get(
        'ladder',
        old.id,
        SPECIES_EQUIVALENCE_VERSION,
      );
      if (prepared) {
        report.push({
          kind: 'ladder',
          before: old.id,
          after: String(prepared.corrected),
        });
        continue;
      }
      const needs = old.rows.some(
        (r) =>
          r.id === 'sinistchamasterpiece' ||
          r.builds.teammates?.values.some(
            (v) => v.id === 'sinistchamasterpiece',
          ),
      );
      if (!needs) continue;
      const draft = validateLadder(canonicalizeLadder(old));
      const id = createHash('sha256')
        .update(SPECIES_EQUIVALENCE_VERSION)
        .update(old.id)
        .digest('hex')
        .slice(0, 16);
      const corrected = { ...draft, id, publishedAt: old.publishedAt };
      const { rows, snapshots, notes, excluded, ...metadata } = corrected;
      void snapshots;
      void notes;
      store.db.exec('BEGIN IMMEDIATE');
      try {
        store.db
          .prepare('INSERT OR IGNORE INTO ladder_versions VALUES (?,?)')
          .run(id, gzipSync(JSON.stringify(corrected)));
        store.db
          .prepare('INSERT OR IGNORE INTO ladder_summaries VALUES (?,?)')
          .run(
            id,
            JSON.stringify({
              ...metadata,
              pokemon: rows.length,
              excludedCount: excluded.length,
            }),
          );
        store.db
          .prepare('INSERT INTO identity_corrections VALUES (?,?,?,?)')
          .run('ladder', old.id, id, SPECIES_EQUIVALENCE_VERSION);
        store.db.exec('COMMIT');
      } catch (error) {
        store.db.exec('ROLLBACK');
        throw error;
      }
      assert.equal(ladderKey(old), ladderKey(corrected));
      report.push({
        kind: 'ladder',
        before: old.id,
        after: id,
        counts: {
          before: old.rows.filter(
            (r) => analyticalSpeciesId(r.id) === 'sinistcha',
          ),
          after: rows.find((r) => r.id === 'sinistcha'),
        },
      });
    }
  store.db.exec('BEGIN IMMEDIATE');
  try {
    for (const m of store.db
      .prepare(
        'SELECT kind,original,corrected FROM identity_corrections WHERE version=?',
      )
      .all(SPECIES_EQUIVALENCE_VERSION)) {
      store.db
        .prepare(
          `UPDATE ${m.kind === 'tournament' ? 'pointers' : 'ladder_pointers'} SET version_id=? WHERE version_id=?`,
        )
        .run(String(m.corrected), String(m.original));
    }
    // Carried-forward normalized cache facts must follow the new equivalence.
    for (const row of store.db
      .prepare('SELECT id,payload FROM event_cache')
      .all()) {
      const cache = JSON.parse(String(row.payload));
      if (cache.event)
        store.db
          .prepare('UPDATE event_cache SET payload=? WHERE id=?')
          .run(
            JSON.stringify({ ...cache, event: correctEvent(cache.event) }),
            String(row.id),
          );
    }
    assert.deepEqual(
      store.db.prepare('SELECT * FROM collector_state ORDER BY name').all(),
      state,
      'Operational/final ledger changed',
    );
    assert.deepEqual(
      store.status(),
      refresh,
      'Correction must not create fresh observation time',
    );
    store.db.exec('COMMIT');
  } catch (error) {
    store.db.exec('ROLLBACK');
    throw error;
  }
  return report;
}
