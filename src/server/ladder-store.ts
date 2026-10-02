import { createHash } from 'node:crypto';
import { gzipSync, gunzipSync } from 'node:zlib';
import {
  ladderKey,
  validateLadder,
  validateLadderSummary,
  type LadderDraft,
  type LadderDataset,
  type LadderSummary,
  type LadderEnvironment,
} from '../domain/ladder';
import type { RefreshState } from '../domain/types';
import type { Store } from './store';
export class LadderStore {
  constructor(readonly store: Store) {}
  initialize() {
    this.store.db
      .exec(`CREATE TABLE IF NOT EXISTS ladder_versions (id TEXT PRIMARY KEY, payload BLOB NOT NULL);
      CREATE TABLE IF NOT EXISTS ladder_pointers (cohort TEXT PRIMARY KEY, version_id TEXT NOT NULL REFERENCES ladder_versions(id));
      CREATE TABLE IF NOT EXISTS ladder_summaries (version_id TEXT PRIMARY KEY REFERENCES ladder_versions(id), payload TEXT NOT NULL);`);
  }
  catalog(): LadderSummary[] {
    const exists = this.store.db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='ladder_pointers'",
      )
      .get();
    if (!exists) return [];
    const summaries = this.store.db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='ladder_summaries'",
      )
      .get();
    if (summaries) {
      const rows = this.store.db
        .prepare(
          'SELECT p.version_id, s.payload FROM ladder_pointers p LEFT JOIN ladder_summaries s ON s.version_id=p.version_id',
        )
        .all();
      return rows.map((r) => {
        if (r.payload === null)
          throw new Error('Ladder metadata needs reindexing');
        const summary = validateLadderSummary(JSON.parse(String(r.payload)));
        if (summary.id !== r.version_id)
          throw new Error('Mismatched ladder metadata');
        return summary;
      });
    }
    return this.store.db
      .prepare(
        'SELECT v.id, v.payload FROM ladder_versions v JOIN ladder_pointers p ON p.version_id=v.id',
      )
      .all()
      .map((r) => {
        const d = this.decode(r.payload);
        const { rows, snapshots, notes, excluded, ...metadata } = d;
        void snapshots;
        void notes;
        return {
          ...metadata,
          pokemon: rows.length,
          excludedCount: excluded.length,
        };
      });
  }
  private summary(d: LadderDataset): LadderSummary {
    const { rows, snapshots, notes, excluded, ...metadata } = d;
    void snapshots;
    void notes;
    return validateLadderSummary({
      ...metadata,
      pokemon: rows.length,
      excludedCount: excluded.length,
    });
  }
  reindex() {
    this.initialize();
    for (const row of this.store.db
      .prepare('SELECT id,payload FROM ladder_versions')
      .all()) {
      const d = this.decode(row.payload);
      this.store.db
        .prepare('INSERT OR REPLACE INTO ladder_summaries VALUES (?,?)')
        .run(d.id, JSON.stringify(this.summary(d)));
    }
  }
  private decode(payload: unknown): LadderDataset {
    if (!(payload instanceof Uint8Array))
      throw new Error('Invalid saved ladder data');
    const parsed = JSON.parse(gunzipSync(payload).toString('utf8'));
    if (
      !/^[a-f0-9]{16}$/.test(parsed.id) ||
      !Number.isFinite(Date.parse(parsed.publishedAt))
    )
      throw new Error('Invalid saved ladder metadata');
    return {
      ...validateLadder(parsed),
      id: parsed.id,
      publishedAt: parsed.publishedAt,
    };
  }
  version(id: string) {
    const exists = this.store.db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='ladder_versions'",
      )
      .get();
    if (!exists) return null;
    const row = this.store.db
      .prepare('SELECT payload FROM ladder_versions WHERE id=?')
      .get(id);
    return row ? this.decode(row.payload) : null;
  }
  publish(input: LadderDraft) {
    return this.publishBatch([input])[0];
  }
  publishBatch(inputs: LadderDraft[], owner?: string) {
    const drafts = inputs.map(validateLadder);
    if (!drafts.length || new Set(drafts.map(ladderKey)).size !== drafts.length)
      throw new Error('Empty or duplicate ladder batch');
    this.initialize();
    const datasets = drafts.map((d) => ({
      ...d,
      id: createHash('sha256')
        .update(JSON.stringify(d))
        .digest('hex')
        .slice(0, 16),
      publishedAt: new Date().toISOString(),
    }));
    this.store.db.exec('BEGIN IMMEDIATE');
    try {
      this.store.assertLease(owner);
      for (const dataset of datasets) {
        this.store.db
          .prepare('INSERT OR IGNORE INTO ladder_versions VALUES (?,?)')
          .run(dataset.id, gzipSync(JSON.stringify(dataset)));
        this.store.db
          .prepare('INSERT OR IGNORE INTO ladder_summaries VALUES (?,?)')
          .run(dataset.id, JSON.stringify(this.summary(dataset)));
        this.store.db
          .prepare('INSERT OR REPLACE INTO ladder_pointers VALUES (?,?)')
          .run(ladderKey(dataset), dataset.id);
        this.store.saveState(`ladder-status:${dataset.environment}`, {
          state: 'success',
          attemptedAt: dataset.publishedAt,
          message: 'Validated ladder data published',
        });
      }
      this.store.assertLease(owner);
      this.store.db.exec('COMMIT');
    } catch (error) {
      this.store.db.exec('ROLLBACK');
      throw error;
    }
    return datasets.map((d) => this.version(d.id)!);
  }
  status(environment: LadderEnvironment) {
    return this.store.state<RefreshState>(`ladder-status:${environment}`);
  }
  failure(environment: LadderEnvironment, time: string, message: string) {
    this.store.saveState(`ladder-status:${environment}`, {
      state: 'failure',
      attemptedAt: time,
      message,
    });
  }
}
