import { backup, DatabaseSync } from 'node:sqlite';
import { open, stat } from 'node:fs/promises';
import type { Store } from '../store';
import { checkDatabase } from '../backup';
import { indexKey } from '../matchup-index';

export async function createServingArtifact(store: Store, destination: string) {
  // Reserve a new path; never overwrite an owner database or an adopted reader.
  const reservation = await open(destination, 'wx');
  await reservation.close();
  await backup(store.db, destination);
  const copy = new DatabaseSync(destination);
  try {
    copy.exec(`
      PRAGMA journal_mode = DELETE;
      PRAGMA secure_delete = ON;
      DELETE FROM observations;
      DELETE FROM snapshots;
      DELETE FROM event_cache;
      DELETE FROM leases;
      DELETE FROM collector_state WHERE name NOT IN ('ladder-status:showdown','ladder-status:champions');
      VACUUM;
    `);
  } finally {
    copy.close();
  }
  const integrity = checkDatabase(destination);
  return { ...integrity, bytes: (await stat(destination)).size };
}

// A disposable reader copy, never the operational database or full historical
// artifact. Old immutable URLs remain available through the history artifact.
export async function createWorkingSet(store: Store, destination: string) {
  const reservation = await open(destination, 'wx');
  await reservation.close();
  await backup(store.db, destination);
  const copy = new DatabaseSync(destination);
  try {
    copy.exec(`
      PRAGMA journal_mode = DELETE;
      CREATE TABLE serving_history (kind TEXT NOT NULL, id TEXT NOT NULL, PRIMARY KEY(kind,id));
      DELETE FROM pointers WHERE name != 'active' AND name NOT LIKE 'archive:%';
      INSERT INTO serving_history SELECT 'tournament',id FROM versions WHERE id NOT IN (SELECT version_id FROM pointers);
      DELETE FROM observations;
      DELETE FROM snapshots;
      DELETE FROM event_cache;
      DELETE FROM leases;
      DELETE FROM collector_state WHERE name NOT IN ('ladder-status:showdown','ladder-status:champions');
      CREATE TEMP TABLE retained_indexes (version TEXT PRIMARY KEY);
    `);
    for (const row of copy
      .prepare('SELECT DISTINCT version_id FROM pointers')
      .all())
      copy
        .prepare('INSERT INTO retained_indexes VALUES (?)')
        .run(indexKey(String(row.version_id)));
    for (const table of [
      'matchup_indexes',
      'matchup_events',
      'matchup_sources',
      'matchup_teams',
      'matchup_members',
      'matchup_results',
    ])
      copy.exec(
        `DELETE FROM ${table} WHERE version NOT IN (SELECT version FROM retained_indexes)`,
      );
    for (const table of ['evidence_views', 'evidence_indexes'])
      if (copy.prepare('SELECT 1 FROM sqlite_master WHERE name=?').get(table))
        copy.exec(
          `DELETE FROM ${table} WHERE publication NOT IN (SELECT version_id FROM pointers)`,
        );
    if (
      copy
        .prepare("SELECT 1 FROM sqlite_master WHERE name='ladder_versions'")
        .get()
    ) {
      copy.exec(`
        INSERT INTO serving_history SELECT 'ladder',id FROM ladder_versions WHERE id NOT IN (SELECT version_id FROM ladder_pointers);
        DELETE FROM ladder_summaries WHERE version_id NOT IN (SELECT version_id FROM ladder_pointers);
        DELETE FROM ladder_versions WHERE id NOT IN (SELECT version_id FROM ladder_pointers);
      `);
    }
    copy.exec(
      `DELETE FROM versions WHERE id NOT IN (SELECT version_id FROM pointers); VACUUM;`,
    );
  } finally {
    copy.close();
  }
  const integrity = checkDatabase(destination);
  return { ...integrity, bytes: (await stat(destination)).size };
}
