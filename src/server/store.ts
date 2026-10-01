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
  CollectionReport,
} from '../domain/types';
import { reconcileSources, recordProviders } from '../domain/sources';
import { reconcileRecords } from '../domain/reconciliation';
import { encodePublication, decodePublication } from './codec';
import {
  regulations,
  requireRegulation,
  datasetRegulation,
  cohortKey,
  type RegulationConfig,
} from '../domain/regulations';
export class Store {
  db: DatabaseSync;
  constructor(
    path: string,
    readOnly = false,
    readonly config: RegulationConfig = regulations,
  ) {
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
      CREATE TABLE IF NOT EXISTS collector_state (name TEXT PRIMARY KEY, payload TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS event_cache (id TEXT PRIMARY KEY, retrieved_at TEXT NOT NULL, payload TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS leases (name TEXT PRIMARY KEY, owner TEXT NOT NULL, expires INTEGER NOT NULL);
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
    return row ? decodePublication(row.payload) : null;
  }
  archives(): PublishedDataset[] {
    return this.db
      .prepare(
        "SELECT v.payload FROM versions v JOIN pointers p ON p.version_id=v.id WHERE p.name LIKE 'archive:%'",
      )
      .all()
      .map((r) => decodePublication(r.payload));
  }
  version(id: string): PublishedDataset | null {
    const row = this.db
      .prepare('SELECT payload FROM versions WHERE id=?')
      .get(id);
    return row ? decodePublication(row.payload) : null;
  }
  activeRegulation() {
    const current = this.current();
    return current
      ? datasetRegulation(current)
      : (this.state<string>('active-regulation') ?? this.config.default);
  }
  staged(regulation: string) {
    const row = this.db
      .prepare('SELECT version_id FROM pointers WHERE name=?')
      .get(`staged:${regulation}`);
    return row ? this.version(String(row.version_id)) : null;
  }
  activate(regulation: string, expectedId: string) {
    requireRegulation(regulation, this.config);
    if (this.state<boolean>(`retired:${regulation}`))
      throw new Error('Archived regulation cannot be reactivated');
    const incoming = this.staged(regulation);
    if (
      !incoming ||
      incoming.id !== expectedId ||
      datasetRegulation(incoming) !== regulation ||
      !incoming.views['all:0']?.coverage.registrations
    )
      throw new Error('No valid nonempty staged publication');
    const outgoing = this.current();
    this.db.exec('BEGIN IMMEDIATE');
    try {
      if (outgoing && datasetRegulation(outgoing) !== regulation) {
        const old = datasetRegulation(outgoing);
        this.db
          .prepare('INSERT OR IGNORE INTO pointers VALUES (?,?)')
          .run(`archive:${old}`, outgoing.id);
        this.saveState(`retired:${old}`, true);
      }
      this.db
        .prepare("INSERT OR REPLACE INTO pointers VALUES ('active',?)")
        .run(incoming.id);
      this.saveState('active-regulation', regulation);
      this.setStatus({
        state: 'success',
        attemptedAt: new Date().toISOString(),
        message: 'Regulation activated',
      });
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }
  archiveCurrent(regulation: string) {
    const current = this.current();
    if (!current || datasetRegulation(current) !== regulation)
      throw new Error('Active regulation mismatch');
    this.db.exec('BEGIN IMMEDIATE');
    try {
      this.db
        .prepare('INSERT OR IGNORE INTO pointers VALUES (?,?)')
        .run(`archive:${regulation}`, current.id);
      this.db.prepare("DELETE FROM pointers WHERE name='active'").run();
      this.saveState(`retired:${regulation}`, true);
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
  state<T>(name: string): T | null {
    const row = this.db
      .prepare('SELECT payload FROM collector_state WHERE name=?')
      .get(name);
    return row ? (JSON.parse(String(row.payload)) as T) : null;
  }
  saveState(name: string, payload: unknown) {
    this.db
      .prepare('INSERT OR REPLACE INTO collector_state VALUES (?,?)')
      .run(name, JSON.stringify(payload));
  }
  clearState(name: string) {
    this.db.prepare('DELETE FROM collector_state WHERE name=?').run(name);
  }
  cache(id: string): {
    retrievedAt: string;
    event: NormalizedEvent | null;
    reason?: string;
  } | null {
    const row = this.db
      .prepare('SELECT retrieved_at, payload FROM event_cache WHERE id=?')
      .get(id);
    return row
      ? {
          retrievedAt: String(row.retrieved_at),
          ...JSON.parse(String(row.payload)),
        }
      : null;
  }
  saveCache(
    id: string,
    retrievedAt: string,
    event: NormalizedEvent | null,
    reason?: string,
  ) {
    this.db
      .prepare('INSERT OR REPLACE INTO event_cache VALUES (?,?,?)')
      .run(id, retrievedAt, JSON.stringify({ event, reason }));
  }
  acquireLease(owner: string, now: number, ttl = 120000) {
    const row = this.db
      .prepare(
        `INSERT INTO leases VALUES ('ingestion',?,?)
      ON CONFLICT(name) DO UPDATE SET owner=excluded.owner, expires=excluded.expires
      WHERE leases.expires <= ? OR leases.owner = excluded.owner RETURNING owner`,
      )
      .get(owner, now + ttl, now);
    return !!row;
  }
  releaseLease(owner: string) {
    this.db
      .prepare("DELETE FROM leases WHERE name='ingestion' AND owner=?")
      .run(owner);
  }
  commit(dataset: PublishedDataset, stage = false) {
    const regulation = datasetRegulation(dataset);
    requireRegulation(regulation, this.config);
    if (this.state<boolean>(`retired:${regulation}`))
      throw new Error('Archived regulation cannot be republished');
    if (
      Object.values(dataset.views).some(
        (v) => v.options.regulation !== regulation,
      )
    )
      throw new Error('Mixed publication regulations');
    if (!stage && regulation !== this.activeRegulation())
      throw new Error(
        'Incoming regulation requires staging and deliberate activation',
      );
    const payload = encodePublication(dataset);
    this.db.exec('BEGIN IMMEDIATE');
    try {
      this.db
        .prepare('INSERT OR IGNORE INTO versions VALUES (?,?,?,?)')
        .run(dataset.id, regulation, dataset.publishedAt, payload);
      this.db
        .prepare('INSERT OR REPLACE INTO pointers VALUES (?,?)')
        .run(stage ? `staged:${regulation}` : 'active', dataset.id);
      if (!stage)
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
  collection?: CollectionReport,
  options: { regulation?: string; stage?: boolean } = {},
): PublishedDataset {
  const regulation = options.regulation ?? store.activeRegulation();
  requireRegulation(regulation, store.config);
  if (store.state<boolean>(`retired:${regulation}`))
    throw new Error(`Regulation ${regulation} is archived`);
  if (events.some((e) => e.regulation !== regulation))
    throw new Error('Mixed or unsupported publication regulation');
  if (
    !Number.isFinite(Date.parse(asOf)) ||
    events.some((e) => !Number.isFinite(Date.parse(e.date)))
  )
    throw new Error('Invalid publication');
  for (const event of events) reconcileRecords(event);
  const reconciled = reconcileSources(events);
  events = reconciled.events;
  for (const event of events) reconcileRecords(event);
  const views: PublishedDataset['views'] = {};
  const providers = [...new Set(events.flatMap(recordProviders))];
  for (const source of ['all', ...providers])
    for (const official of [false, true])
      for (const sheet of ['all', 'open', 'closed', 'unknown'] as (
        Visibility | 'all'
      )[])
        for (const minPlayers of [0, 50, 100]) {
          const view = aggregate(events, {
            regulation,
            asOf,
            days: 30,
            sheet,
            minPlayers,
            source,
            official,
          });
          views[cohortKey(source, sheet, minPlayers, official)] = view;
          if (source === 'all' && !official)
            views[`${sheet}:${minPlayers}`] = view;
        }
  if (
    (!collection || options.stage) &&
    !Object.values(views).some((v) => v.coverage.registrations > 0)
  )
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
    regulation,
    asOf,
    normalizationVersion: NORMALIZATION_VERSION,
    calculationVersion: CALCULATION_VERSION,
    scope,
    events,
    views,
    floor: { ...configuredFloor },
    collection,
    quarantine: reconciled.quarantine,
  };
  const id = createHash('sha256')
    .update(JSON.stringify(payload))
    .digest('hex')
    .slice(0, 16);
  const dataset = { ...payload, id, publishedAt: new Date().toISOString() };
  store.commit(dataset, options.stage);
  return dataset;
}
