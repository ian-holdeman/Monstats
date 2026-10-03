import { backup, DatabaseSync } from 'node:sqlite';
import { open, stat } from 'node:fs/promises';
import type { Store } from '../store';
import { checkDatabase } from '../backup';

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
