import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  performanceEvidence,
  sampleReasons,
  performanceReasons,
  evidenceOrder,
} from '../src/domain/evidence';
import { aggregate } from '../src/domain/analytics';
import { fixture, slot } from './fixtures';
import { provenance } from '../src/domain/sources';
import { rankMatchups } from '../src/domain/rankings';
import { withEvidence } from '../src/server/evidence-reader';
import { deriveEvidence } from '../src/server/evidence-build';
import {
  evidenceSchema,
  backfillEvidence,
  readEvidence,
} from '../src/server/evidence-index';
import { Store, publish } from '../src/server/store';

test('notice thresholds use physical samples and ignore unverifiable player breadth', () => {
  assert.match(sampleReasons(99, 'usage')[0], /99 registrations/);
  assert.deepEqual(sampleReasons(100, 'usage'), []);
  assert.match(sampleReasons(null, 'usage')[0], /unavailable/i);
  assert.deepEqual(sampleReasons(100, 'matches'), []);
  assert.equal(performanceReasons({ matches: 99 }).length, 1);
  assert.equal(
    performanceReasons({ matches: 100, baselineMatches: 99 }).length,
    1,
  );
  assert.equal(
    performanceReasons({ matches: 100, baselineMatches: 100 }).length,
    0,
  );
  assert.equal(
    performanceReasons({ matches: 0, baselineMatches: 0 }).length,
    2,
  );
});
test('reconciled provider mirrors preserve physical volume; zero wins and ranking floor are unchanged', () => {
  const e = fixture();
  const mirror = {
    ...e,
    id: 'mirror',
    provenance: {
      ...provenance(e),
      sources: [
        {
          provider: 'victory-road',
          originalId: 'mirror',
          url: 'https://example.test/mirror',
        },
      ],
    },
  };
  const options = {
    regulation: 'M-C',
    asOf: '2026-09-30T18:00:00Z',
    days: 30,
    source: 'all',
    sheet: 'all' as const,
    minPlayers: 0,
  };
  const result = aggregate([e, mirror], options);
  assert.equal(result.coverage.matches, 3);
  assert.equal(result.coverage.registrations, 3);
  assert.deepEqual(
    result.pokemon.find((r) => r.id === 'incineroar')!.evidence!.sources,
    [
      { provider: 'limitless', matches: 3 },
      { provider: 'victory-road', matches: 3 },
    ],
  );
  assert.equal(result.pokemon.find((r) => r.id === 'garchomp')!.winRate, 100);
  const zero = result.matchups.garchomp.find((r) => r.id === 'rillaboom')!;
  assert.equal(zero.winRate, 0);
  assert.equal(zero.evidence!.matches, 1);
  assert.deepEqual(
    rankMatchups(
      result,
      'garchomp',
      'best',
      { matches: 20, events: 2, players: 5 },
      'evidence',
    ),
    [],
  );
});
test('legacy/frozen evidence supplements preserve raw values and fall back on incompatible facts', () => {
  const e = fixture();
  const result = aggregate([e], {
    regulation: 'M-C',
    asOf: '2026-09-30T18:00:00Z',
    days: 30,
    source: 'all',
    sheet: 'all',
    minPlayers: 0,
  });
  for (const r of result.pokemon) delete r.evidence;
  for (const rows of Object.values(result.matchups))
    for (const r of rows) {
      delete r.evidence;
      delete r.baselineEvidence;
    }
  const frozen = JSON.stringify(result);
  const supplemented = deriveEvidence(result, [e]);
  assert.equal(JSON.stringify(result), frozen);
  assert.equal(
    supplemented.pokemon[0].evidence!.matches,
    result.pokemon[0].matches,
  );
  const unsupported = deriveEvidence(result, []);
  assert.equal(unsupported.pokemon[0].evidence, undefined);
  assert.equal(unsupported.pokemon[0].winRate, result.pokemon[0].winRate);
});
test('explicit evidence backfill is atomic, idempotent and preserves immutable publications; browsing never fills missing artifacts', () => {
  const store = new Store(':memory:');
  try {
    const d = publish(
      store,
      [fixture()],
      '2026-09-30T18:00:00Z',
      'evidence storage fixture',
    );
    const view = structuredClone(d.views['all:0']);
    for (const r of view.pokemon) delete r.evidence;
    for (const rows of Object.values(view.matchups))
      for (const r of rows) {
        delete r.evidence;
        delete r.baselineEvidence;
      }
    assert.equal(withEvidence(d.id, view, store.db), view);
    assert.equal(readEvidence(store.db, d.id, view.options), null);
    const bytes = store.db
      .prepare('SELECT payload FROM versions WHERE id=?')
      .get(d.id)!.payload;
    evidenceSchema(store.db);
    store.db.exec(
      "CREATE TRIGGER stop_evidence BEFORE INSERT ON evidence_indexes BEGIN SELECT RAISE(ABORT,'interrupted evidence'); END",
    );
    assert.throws(() => backfillEvidence(store.db, d), /interrupted evidence/);
    assert.equal(
      store.db.prepare('SELECT count(*) n FROM evidence_views').get()!.n,
      0,
    );
    store.db.exec('DROP TRIGGER stop_evidence');
    backfillEvidence(store.db, d);
    const count = store.db
      .prepare('SELECT count(*) n FROM evidence_views')
      .get()!.n;
    backfillEvidence(store.db, d);
    assert.equal(
      store.db.prepare('SELECT count(*) n FROM evidence_views').get()!.n,
      count,
    );
    assert.ok(withEvidence(d.id, view, store.db).pokemon[0].evidence);
    assert.deepEqual(
      store.db.prepare('SELECT payload FROM versions WHERE id=?').get(d.id)!
        .payload,
      bytes,
    );
    assert.equal(store.current()!.id, d.id);
  } finally {
    store.close();
  }
});
test('usage population, mirrors, independent baseline, and event concentration use actual records', () => {
  const e = fixture();
  e.registrations.push(
    ...Array.from({ length: 997 }, (_, i) => ({
      player: `extra-${i}`,
      slots: [slot('pelipper')],
      drop: null,
    })),
  );
  const result = aggregate([e], {
    regulation: 'M-C',
    asOf: '2026-09-30T18:00:00Z',
    days: 30,
    source: 'all',
    sheet: 'all',
    minPlayers: 0,
  });
  assert.equal(result.coverage.registrations, 1000);
  assert.deepEqual(sampleReasons(result.coverage.registrations, 'usage'), []);
  const row = result.matchups.incineroar.find((r) => r.id === 'incineroar')!;
  assert.equal(row.outcomes, 2);
  assert.equal(row.evidence?.matches, 1);
  assert.equal(row.baselineEvidence?.matches, 3);
  assert.equal(row.evidence?.largestEventShare, 100);
});
test('event concentration and ordering do not use legacy player metrics', () => {
  const evidence = performanceEvidence(
    new Map([
      ['m1', 'e1'],
      ['m2', 'e1'],
      ['m3', 'e2'],
    ]),
  );
  assert.equal(evidence.largestEventShare, 200 / 3);
  assert.equal('playerBreadth' in evidence, false);
  assert.equal('largestPlayerShare' in evidence, false);
  const rows = [
    {
      id: 'z',
      evidence: { ...evidence, playerBreadth: 10, identity: 'reliable' },
    },
    {
      id: 'a',
      evidence: { ...evidence, playerBreadth: 2, identity: 'reliable' },
    },
  ];
  assert.equal(
    evidenceOrder(
      rows,
      (r) => r.evidence,
      (r) => r.id,
    )[0].id,
    'a',
  );
});
