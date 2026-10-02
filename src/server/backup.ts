import { backup, DatabaseSync } from 'node:sqlite';
import {
  mkdir,
  cp,
  readFile,
  writeFile,
  readdir,
  stat,
} from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, join } from 'node:path';
import { Store } from './store';
import { indexMetadata } from './matchup-index';
import { LadderStore } from './ladder-store';
import { ladderKey } from '../domain/ladder';

async function hashes(dir: string): Promise<Record<string, string>> {
  const result: Record<string, string> = {};
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.isFile())
      result[entry.name] = createHash('sha256')
        .update(await readFile(join(dir, entry.name)))
        .digest('hex');
    else if (entry.isDirectory())
      for (const [name, value] of Object.entries(
        await hashes(join(dir, entry.name)),
      ))
        result[`${entry.name}/${name}`] = value;
  }
  return result;
}
export function checkDatabase(path: string) {
  const store = new Store(path, true);
  try {
    const check = store.db.prepare('PRAGMA integrity_check').all();
    if (check.length !== 1 || check[0].integrity_check !== 'ok')
      throw new Error('SQLite integrity check failed');
    if (store.db.prepare('PRAGMA foreign_key_check').all().length)
      throw new Error('Foreign key integrity failed');
    for (const row of store.db
      .prepare('SELECT version_id FROM pointers')
      .all()) {
      const d = store.version(String(row.version_id));
      if (!d || !indexMetadata(store.db, d.id))
        throw new Error('Publication or ready Matchups index missing');
    }
    const ladder = new LadderStore(store);
    for (const summary of ladder.catalog()) {
      const d = ladder.version(summary.id);
      const pointer = store.db
        .prepare('SELECT cohort FROM ladder_pointers WHERE version_id=?')
        .get(summary.id);
      if (
        !d ||
        d.rows.length !== summary.pokemon ||
        !pointer ||
        ladderKey(d) !== pointer.cohort
      )
        throw new Error('Ladder publication or cohort metadata inconsistent');
    }
    return {
      integrity: 'ok',
      publication: store.current()?.id,
      schema: store.db.prepare('PRAGMA user_version').get()?.user_version,
    };
  } finally {
    store.close();
  }
}
export async function createBackup(
  store: Store,
  dataDir: string,
  destination: string,
) {
  await mkdir(destination);
  const path = join(destination, 'monstats.sqlite');
  await backup(store.db, path);
  try {
    await cp(join(dataDir, 'sprites'), join(destination, 'sprites'), {
      recursive: true,
      errorOnExist: true,
    });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  const integrity = checkDatabase(path);
  const files = await hashes(destination);
  await writeFile(
    join(destination, 'manifest.json'),
    JSON.stringify(
      { version: 1, createdAt: new Date().toISOString(), ...integrity, files },
      null,
      2,
    ),
  );
  return integrity;
}
export async function restoreBackup(source: string, destination: string) {
  const manifest = JSON.parse(
    await readFile(join(source, 'manifest.json'), 'utf8'),
  ) as { version: number; files: Record<string, string> };
  if (manifest.version !== 1) throw new Error('Unsupported backup manifest');
  const actual = await hashes(source);
  for (const [name, hash] of Object.entries(manifest.files))
    if (actual[name] !== hash) throw new Error('Backup checksum mismatch');
  checkDatabase(join(source, 'monstats.sqlite'));
  await mkdir(destination);
  await cp(
    join(source, 'monstats.sqlite'),
    join(destination, 'monstats.sqlite'),
    { errorOnExist: true },
  );
  try {
    await stat(join(source, 'sprites'));
    await cp(join(source, 'sprites'), join(destination, 'sprites'), {
      recursive: true,
      errorOnExist: true,
    });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  const restored = new DatabaseSync(resolve(destination, 'monstats.sqlite'));
  try {
    restored.exec('DELETE FROM leases');
  } finally {
    restored.close();
  }
  return checkDatabase(join(destination, 'monstats.sqlite'));
}
