import type { DatabaseSync } from 'node:sqlite';
import { gzipSync, gunzipSync } from 'node:zlib';
import { EVIDENCE_VERSION, type PerformanceEvidence } from '../domain/evidence';
import type { Options, PublishedDataset } from '../domain/types';
import { deriveEvidence } from './evidence-build';
import { sourceSelection } from '../domain/filters';

type Supplement = {
  pokemon: Record<string, PerformanceEvidence | undefined>;
  matchups: Record<
    string,
    Record<
      string,
      { evidence?: PerformanceEvidence; baselineEvidence?: PerformanceEvidence }
    >
  >;
};
const cohort = (o: Options) =>
  JSON.stringify([
    o.regulation,
    o.asOf,
    o.days,
    sourceSelection(o.source ?? 'all'),
    o.sheet,
    o.minPlayers,
    o.official ?? false,
  ]);
export function evidenceSchema(db: DatabaseSync) {
  db.exec(
    'CREATE TABLE IF NOT EXISTS evidence_views (publication TEXT NOT NULL, version TEXT NOT NULL, cohort TEXT NOT NULL, payload BLOB NOT NULL, PRIMARY KEY(publication,version,cohort)); CREATE TABLE IF NOT EXISTS evidence_indexes (publication TEXT NOT NULL, version TEXT NOT NULL, PRIMARY KEY(publication,version));',
  );
}
export function readEvidence(
  db: DatabaseSync,
  publication: string,
  options: Options,
): Supplement | null {
  if (
    !db
      .prepare(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name='evidence_indexes'",
      )
      .get()
  )
    return null;
  if (
    !db
      .prepare(
        'SELECT 1 FROM evidence_indexes WHERE publication=? AND version=?',
      )
      .get(publication, EVIDENCE_VERSION)
  )
    return null;
  const row = db
    .prepare(
      'SELECT payload FROM evidence_views WHERE publication=? AND version=? AND cohort=?',
    )
    .get(publication, EVIDENCE_VERSION, cohort(options));
  return row
    ? JSON.parse(gunzipSync(row.payload as Uint8Array).toString('utf8'))
    : null;
}
// Explicit CLI only. The supplemental artifact and ready marker publish atomically;
// immutable source bytes, asOf and active/archive pointers never change.
export function backfillEvidence(db: DatabaseSync, d: PublishedDataset) {
  evidenceSchema(db);
  if (
    db
      .prepare(
        'SELECT 1 FROM evidence_indexes WHERE publication=? AND version=?',
      )
      .get(d.id, EVIDENCE_VERSION)
  )
    return;
  db.exec('BEGIN IMMEDIATE');
  try {
    const seen = new Set<string>();
    const insert = db.prepare('INSERT INTO evidence_views VALUES (?,?,?,?)');
    for (const key of Object.keys(d.views)) {
      const view = d.views[key],
        k = cohort(view.options);
      if (seen.has(k)) continue;
      seen.add(k);
      const derived = deriveEvidence(view, d.events);
      const supplement: Supplement = {
        pokemon: Object.fromEntries(
          derived.pokemon.map((r) => [r.id, r.evidence]),
        ),
        matchups: Object.fromEntries(
          Object.entries(derived.matchups).map(([id, rows]) => [
            id,
            Object.fromEntries(
              rows.map((r) => [
                r.id,
                { evidence: r.evidence, baselineEvidence: r.baselineEvidence },
              ]),
            ),
          ]),
        ),
      };
      insert.run(
        d.id,
        EVIDENCE_VERSION,
        k,
        gzipSync(JSON.stringify(supplement)),
      );
    }
    db.prepare('INSERT INTO evidence_indexes VALUES (?,?)').run(
      d.id,
      EVIDENCE_VERSION,
    );
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}
