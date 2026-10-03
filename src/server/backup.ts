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
import { isDeepStrictEqual } from 'node:util';
import { Store } from './store';
import { indexKey, indexMetadata } from './matchup-index';
import { LadderStore } from './ladder-store';
import { ladderKey } from '../domain/ladder';
import { eligibleResult, selectEvents } from '../domain/analytics';
import {
  provenance,
  reconcileSources,
  recordProviders,
} from '../domain/sources';
import { MATCHUP_CALCULATION, MATCHUP_INDEX } from '../domain/dynamic-matchups';
import type { PublishedDataset } from '../domain/types';

// SQLite page integrity and a ready marker do not establish statistical integrity.
// Verify the serving index against its immutable publication before accepting a
// backup/restore. This is an explicit operational check, never a browsing side effect.
function checkMatchupIndex(db: DatabaseSync, d: PublishedDataset) {
  const assertIndex = (ok: boolean, detail: string) => {
    if (!ok) throw new Error(`Matchups index inconsistent: ${detail}`);
  };
  const meta = indexMetadata(db, d.id);
  if (!meta) throw new Error('Publication or ready Matchups index missing');
  const view = d.views['all:0'] ?? Object.values(d.views)[0];
  const options = view.options;
  assertIndex(
    meta.publication === d.id &&
      meta.calculation === MATCHUP_CALCULATION &&
      meta.index === MATCHUP_INDEX &&
      meta.asOf === d.asOf &&
      meta.regulation === options.regulation &&
      isDeepStrictEqual(meta.options, options) &&
      isDeepStrictEqual(meta.floor, d.floor),
    'metadata',
  );
  const version = indexKey(d.id);
  const events = selectEvents(reconcileSources(d.events).events, {
    ...options,
    source: 'all',
    sheet: 'all',
    minPlayers: 0,
    official: false,
  });
  const eventRead = db.prepare(
    'SELECT canonical,regulation,date,players,sheet,official FROM matchup_events WHERE version=? AND event=?',
  );
  const sourcesRead = db.prepare(
    'SELECT provider FROM matchup_sources WHERE version=? AND event=? ORDER BY provider',
  );
  const teamsRead = db.prepare(
    'SELECT id,player,participant,composition FROM matchup_teams WHERE version=? AND event=?',
  );
  const savedMembers = new Map<number, string[]>();
  for (const row of db
    .prepare(
      'SELECT team,member FROM matchup_members WHERE version=? ORDER BY member',
    )
    .all(version)) {
    const id = Number(row.team);
    const members = savedMembers.get(id) ?? [];
    members.push(String(row.member));
    savedMembers.set(id, members);
  }
  const catalog = new Map<string, string>();
  const results = new Map<string, (string | number)[]>();
  let teamCount = 0,
    memberCount = 0,
    sourceCount = 0;
  for (const event of events) {
    const p = provenance(event);
    const saved = eventRead.get(version, event.id);
    assertIndex(
      !!saved &&
        isDeepStrictEqual(Object.values(saved), [
          p.canonicalEvent,
          event.regulation,
          new Date(event.date).toISOString(),
          event.players,
          event.sheet.visibility,
          Number(p.official === 'verified'),
        ]),
      'event facts',
    );
    const providers = [...new Set(recordProviders(event))].sort();
    assertIndex(
      isDeepStrictEqual(
        sourcesRead.all(version, event.id).map((r) => r.provider),
        providers,
      ),
      'event providers',
    );
    sourceCount += providers.length;
    const teams = teamsRead.all(version, event.id);
    const byPlayer = new Map(teams.map((t) => [String(t.player), t]));
    const registrations = event.registrations.filter((r) => r.slots?.length);
    assertIndex(teams.length === registrations.length, 'event team count');
    const teamIds = new Map<string, number>();
    for (const registration of registrations) {
      const team = byPlayer.get(registration.player);
      const members = [...new Set(registration.slots!.map((s) => s.id))].sort();
      assertIndex(
        !!team &&
          team.participant ===
            `${p.participantNamespace}:${registration.player}` &&
          team.composition === JSON.stringify(members),
        'registered composition',
      );
      const id = Number(team!.id);
      assertIndex(
        isDeepStrictEqual(savedMembers.get(id), members),
        'registered members',
      );
      teamIds.set(registration.player, id);
      teamCount++;
      memberCount += members.length;
      for (const slot of registration.slots!) catalog.set(slot.id, slot.name);
    }
    const seen = new Set<string>();
    for (const match of event.matches) {
      if (seen.has(match.id)) continue;
      seen.add(match.id);
      const left = teamIds.get(match.player1),
        right = teamIds.get(match.player2 ?? '');
      if (
        !eligibleResult(match, event, left !== undefined, right !== undefined)
      )
        continue;
      const physical = `${p.canonicalEvent}:${match.id}`;
      assertIndex(!results.has(physical), 'duplicate physical identity');
      results.set(physical, [
        event.id,
        left!,
        right!,
        match.winner === match.player1 ? left! : right!,
      ]);
    }
  }
  const actualResults = db
    .prepare(
      'SELECT physical,event,left_team,right_team,winner FROM matchup_results WHERE version=?',
    )
    .all(version);
  assertIndex(actualResults.length === results.size, 'physical result count');
  for (const row of actualResults)
    assertIndex(
      isDeepStrictEqual(results.get(String(row.physical)), [
        row.event,
        row.left_team,
        row.right_team,
        row.winner,
      ]),
      'physical result facts',
    );
  for (const [table, expected] of [
    ['matchup_events', events.length],
    ['matchup_sources', sourceCount],
    ['matchup_teams', teamCount],
    ['matchup_members', memberCount],
  ] as const)
    assertIndex(
      db.prepare(`SELECT count(*) n FROM ${table} WHERE version=?`).get(version)
        ?.n === expected,
      `${table} count or orphan records`,
    );
  assertIndex(
    meta.physicalResults === results.size &&
      meta.teams === teamCount &&
      view.coverage.matches === results.size &&
      view.coverage.registrations === teamCount &&
      view.coverage.events === events.length,
    'publication coverage',
  );
  assertIndex(
    meta.catalog.length === catalog.size &&
      new Set(meta.catalog.map((p) => p.id)).size === catalog.size &&
      meta.catalog.every((p) => catalog.get(p.id) === p.name),
    'catalog',
  );
}

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
      .prepare('SELECT DISTINCT version_id FROM pointers')
      .all()) {
      const d = store.version(String(row.version_id));
      if (!d || d.id !== row.version_id)
        throw new Error('Publication identity missing or inconsistent');
      checkMatchupIndex(store.db, d);
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
