import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { aggregate, CALCULATION_VERSION } from '../domain/analytics';
import { NORMALIZATION_VERSION } from '../domain/normalize';
import configuredFloor from '../../config/evidence-floor.json' with { type: 'json' };
import type {
  NormalizedEvent,
  PublishedDataset,
  RefreshState,
  Snapshot,
  Visibility,
} from '../domain/types';
export class Store {
  db: DatabaseSync;
  constructor(path: string, readOnly = false) {
    this.db = new DatabaseSync(path, { readOnly });
    this.db.exec('PRAGMA busy_timeout = 5000');
    if (!readOnly)
      this.db.exec(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS snapshots (checksum TEXT PRIMARY KEY, body TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS observations (url TEXT NOT NULL, retrieved_at TEXT NOT NULL, checksum TEXT NOT NULL REFERENCES snapshots(checksum), PRIMARY KEY(url,retrieved_at,checksum));
      CREATE TABLE IF NOT EXISTS versions (id TEXT PRIMARY KEY, regulation TEXT NOT NULL, published_at TEXT NOT NULL, payload TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS pointers (name TEXT PRIMARY KEY, version_id TEXT NOT NULL REFERENCES versions(id));
      CREATE TABLE IF NOT EXISTS refresh (id INTEGER PRIMARY KEY CHECK(id=1), payload TEXT NOT NULL);
    `);
  }
  snapshot(url: string, body: string, retrievedAt: string): Snapshot {
    const checksum = createHash('sha256').update(body).digest('hex');
    this.db
      .prepare('INSERT OR IGNORE INTO snapshots VALUES (?,?)')
      .run(checksum, body);
    this.db
      .prepare('INSERT OR IGNORE INTO observations VALUES (?,?,?)')
      .run(url, retrievedAt, checksum);
    return { url, checksum, retrievedAt };
  }
  snapshotCount(): number {
    return Number(this.db.prepare('SELECT count(*) n FROM snapshots').get()!.n);
  }
  current(): PublishedDataset | null {
    const row = this.db
      .prepare(
        "SELECT v.payload FROM versions v JOIN pointers p ON p.version_id=v.id WHERE p.name='active'",
      )
      .get();
    return row ? JSON.parse(String(row.payload)) : null;
  }
  archives(): PublishedDataset[] {
    return this.db
      .prepare(
        "SELECT v.payload FROM versions v JOIN pointers p ON p.version_id=v.id WHERE p.name LIKE 'archive:%'",
      )
      .all()
      .map((r) => JSON.parse(String(r.payload)));
  }
  archiveCurrent(regulation: string) {
    const current = this.current();
    if (!current || current.views['open:0'].options.regulation !== regulation)
      throw new Error('Active regulation mismatch');
    this.db.exec('BEGIN IMMEDIATE');
    try {
      this.db
        .prepare('INSERT OR REPLACE INTO pointers VALUES (?,?)')
        .run(`archive:${regulation}`, current.id);
      this.db.prepare("DELETE FROM pointers WHERE name='active'").run();
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }
  status(): RefreshState | null {
    const r = this.db.prepare('SELECT payload FROM refresh WHERE id=1').get();
    return r ? JSON.parse(String(r.payload)) : null;
  }
  refreshFailure(time: string, message: string) {
    this.setStatus({ state: 'failure', attemptedAt: time, message });
  }
  setStatus(status: RefreshState) {
    this.db
      .prepare('INSERT OR REPLACE INTO refresh VALUES (1,?)')
      .run(JSON.stringify(status));
  }
  commit(dataset: PublishedDataset) {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      this.db
        .prepare('INSERT OR IGNORE INTO versions VALUES (?,?,?,?)')
        .run(dataset.id, 'M-C', dataset.publishedAt, JSON.stringify(dataset));
      this.db
        .prepare("INSERT OR REPLACE INTO pointers VALUES ('active',?)")
        .run(dataset.id);
      this.setStatus({
        state: 'success',
        attemptedAt: dataset.publishedAt,
        message: 'Complete dataset published',
      });
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }
  close() {
    this.db.close();
  }
}
export function publish(
  store: Store,
  events: NormalizedEvent[],
  asOf: string,
  scope: string,
): PublishedDataset {
  if (
    !Number.isFinite(Date.parse(asOf)) ||
    new Set(events.map((e) => e.id)).size !== events.length
  )
    throw new Error('Invalid publication');
  const views: PublishedDataset['views'] = {};
  for (const sheet of ['open', 'closed', 'unknown'] as Visibility[])
    for (const minPlayers of [0, 50, 100]) {
      views[`${sheet}:${minPlayers}`] = aggregate(events, {
        regulation: 'M-C',
        asOf,
        days: 30,
        sheet,
        minPlayers,
      });
    }
  if (!Object.values(views).some((v) => v.coverage.registrations > 0))
    throw new Error('No resolved registrations; retaining previous dataset');
  for (const view of Object.values(views))
    for (const row of view.pokemon) {
      if (
        row.wins > row.outcomes ||
        row.wins < 0 ||
        !Number.isFinite(row.usage) ||
        row.usage < 0 ||
        row.usage > 100
      )
        throw new Error('Invalid aggregate');
    }
  if (Object.values(configuredFloor).some((n) => !Number.isInteger(n) || n < 1))
    throw new Error('Invalid evidence floor');
  const payload = {
    asOf,
    normalizationVersion: NORMALIZATION_VERSION,
    calculationVersion: CALCULATION_VERSION,
    scope,
    events,
    views,
    floor: { ...configuredFloor },
  };
  const id = createHash('sha256')
    .update(JSON.stringify(payload))
    .digest('hex')
    .slice(0, 16);
  const dataset = { ...payload, id, publishedAt: new Date().toISOString() };
  store.commit(dataset);
  return dataset;
}
