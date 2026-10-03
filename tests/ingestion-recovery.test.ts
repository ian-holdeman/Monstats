import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store, publish } from '../src/server/store';
import {
  createBackup,
  restoreBackup,
  checkDatabase,
} from '../src/server/backup';
import { fixture } from './fixtures';
import { collect } from '../src/server/collector';
import { regulations } from '../src/domain/regulations';
import { lifecycle, runScheduled } from '../src/server/operations';

test('consistent WAL backup restores publications/index/artwork and rejects corruption without overwriting a destination', async () => {
  const root = await mkdtemp(join(tmpdir(), 'monstats-recovery-'));
  const store = new Store(join(root, 'monstats.sqlite'));
  const d = publish(store, [fixture()], '2026-09-30T18:00:00Z', 'backup');
  store.snapshot(
    'https://example.test',
    'immutable evidence',
    '2026-09-30T18:00:00Z',
  );
  await mkdir(join(root, 'sprites'));
  await writeFile(join(root, 'sprites', 'fixture.png'), 'artwork bytes');
  await createBackup(store, root, join(root, 'backup'));
  store.saveState('after-backup', true);
  const restored = await restoreBackup(
    join(root, 'backup'),
    join(root, 'restored'),
  );
  assert.equal(restored.publication, d.id);
  assert.equal(
    await readFile(join(root, 'restored', 'sprites', 'fixture.png'), 'utf8'),
    'artwork bytes',
  );
  const reader = new Store(join(root, 'restored', 'monstats.sqlite'), true);
  assert.equal(reader.state('after-backup'), null);
  assert.equal(reader.snapshotCount(), 1);
  reader.close();
  assert.equal(
    checkDatabase(join(root, 'restored', 'monstats.sqlite')).integrity,
    'ok',
  );
  await assert.rejects(
    () => restoreBackup(join(root, 'backup'), join(root, 'restored')),
    /EEXIST/,
  );
  await writeFile(join(root, 'backup', 'sprites', 'fixture.png'), 'corrupt');
  await assert.rejects(
    () => restoreBackup(join(root, 'backup'), join(root, 'bad')),
    /checksum/,
  );
  store.close();
});

test('database verification rejects logical index corruption even when SQLite and declared foreign keys pass', async () => {
  const corruptions = [
    'DELETE FROM matchup_results WHERE physical=(SELECT physical FROM matchup_results LIMIT 1)',
    'DELETE FROM matchup_teams WHERE id=(SELECT id FROM matchup_teams LIMIT 1)',
    "UPDATE matchup_members SET member='garchomp' WHERE member='rillaboom'",
    'UPDATE matchup_results SET winner=CASE WHEN winner=left_team THEN right_team ELSE left_team END',
    "UPDATE matchup_events SET sheet='closed'",
    "UPDATE matchup_sources SET provider='pokedata'",
    "UPDATE matchup_indexes SET metadata=json_set(metadata,'$.physicalResults',999)",
  ];
  for (const sql of corruptions) {
    const root = await mkdtemp(join(tmpdir(), 'monstats-index-integrity-'));
    const path = join(root, 'monstats.sqlite');
    const store = new Store(path);
    try {
      publish(store, [fixture()], '2026-09-30T18:00:00Z', 'index integrity');
      assert.equal(checkDatabase(path).integrity, 'ok');
      store.db.exec(sql);
      assert.equal(
        store.db.prepare('PRAGMA integrity_check').get()?.integrity_check,
        'ok',
      );
      assert.deepEqual(store.db.prepare('PRAGMA foreign_key_check').all(), []);
      assert.throws(() => checkDatabase(path), /Matchups index/i, sql);
    } finally {
      store.close();
    }
  }
});
test('malformed event cannot starve valid new intake; partial event reads resume beyond 24 hours', async () => {
  const store = new Store(':memory:');
  const ids = ['a', 'b'].map((v) => v.repeat(24));
  const calls: string[] = [];
  const provider = (async (input: string | URL | Request) => {
    const url = new URL(String(input));
    calls.push(url.pathname);
    if (url.pathname === '/api/tournaments')
      return Response.json(
        url.searchParams.get('page') === '1'
          ? ids.map((id) => ({
              id,
              game: 'VGC',
              format: 'M-C',
              date: '2026-09-20T12:00:00Z',
              players: 20,
            }))
          : [],
      );
    if (url.pathname === '/tournaments/completed')
      return new Response(
        '<title>Completed Tournaments | Limitless</title>' +
          ids
            .map((id) => `<a href="/tournament/${id}/standings">done</a>`)
            .join(''),
      );
    if (url.pathname.includes(ids[0])) return new Response('invalid json');
    if (url.pathname.endsWith('/details'))
      return Response.json({
        id: ids[1],
        game: 'VGC',
        format: 'M-C',
        date: '2026-09-20T12:00:00Z',
        players: 20,
        name: 'valid',
        platform: 'SWITCH',
        isPublic: true,
        decklists: true,
        phases: [],
      });
    if (
      url.pathname.endsWith('/standings') ||
      url.pathname.endsWith('/pairings')
    )
      return Response.json([]);
    return new Response('<div class="description">OTS</div>');
  }) as typeof fetch;
  await assert.rejects(
    () => collect(store, '2026-09-30T18:00:00Z', { maxReads: 5 }, provider),
    /budget/,
  );
  const events = await collect(
    store,
    '2026-10-02T18:00:00Z',
    { maxReads: 3 },
    provider,
  );
  assert.equal(events.length, 1);
  assert.equal(events[0].id, ids[1]);
  assert.equal(
    calls.filter((path) => path.endsWith(ids[1] + '/details')).length,
    1,
  );
  assert.ok(store.cache(`limitless:${ids[0]}:M-C`)?.reason);
  store.close();
});
test('lost lease during ready-index build rolls back pointer and version atomically', () => {
  const store = new Store(':memory:');
  const d = publish(store, [fixture()], '2026-09-30T18:00:00Z', 'old');
  store.acquireLease('owner', Date.now());
  store.db.exec(
    "CREATE TRIGGER lose_lease AFTER INSERT ON versions BEGIN UPDATE leases SET owner='replacement'; END",
  );
  assert.throws(
    () =>
      publish(store, [fixture()], '2026-10-01T18:00:00Z', 'new', undefined, {
        owner: 'owner',
      }),
    /lease lost/,
  );
  assert.equal(store.current()?.id, d.id);
  assert.equal(store.db.prepare('SELECT count(*) n FROM versions').get()?.n, 1);
  store.close();
});
test('interrupted final execution resumes only inside its original window and commits archive/final state together', async () => {
  const now = Date.now(),
    end = new Date(now - 7 * 86400000).toISOString();
  const config = {
    default: 'M-C',
    cohorts: {
      'M-C': {
        ...regulations.cohorts['M-C'],
        startsAt: '2026-08-01T00:00:00.000Z',
        endsAt: end,
        reviewed: true,
      },
    },
  };
  const store = new Store(':memory:', false, config);
  const d = publish(
    store,
    [fixture()],
    new Date(now - 8 * 86400000).toISOString(),
    'old',
  );
  lifecycle(store, now);
  const final = store.state<Record<string, unknown>>('final:M-C')!;
  store.saveState('final:M-C', { ...final, state: 'running' });
  let calls = 0;
  const execute = async (
    s: Store,
    asOf: string,
    options: { finalJob?: string },
  ) => {
    calls++;
    return publish(s, [fixture()], asOf, 'final', undefined, {
      finalJob: options.finalJob,
    });
  };
  await runScheduled(store, { now, execute });
  assert.equal(calls, 1);
  assert.notEqual(store.archives()[0].id, d.id);
  assert.equal(store.state<{ state: string }>('final:M-C')?.state, 'complete');
  await runScheduled(store, { now: now + 1000, execute });
  assert.equal(calls, 1);
  assert.throws(
    () =>
      publish(
        store,
        [fixture()],
        new Date(now).toISOString(),
        'later',
        undefined,
        { finalJob: String(final.id) },
      ),
    /archived/,
  );
  store.close();
});
