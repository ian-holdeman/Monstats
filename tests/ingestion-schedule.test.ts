import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Store, publish } from '../src/server/store';
import { dailySlot, runScheduled } from '../src/server/operations';
import { fixture } from './fixtures';
import { championsContract } from '../src/domain/ladder-contracts';
import { collectShowdown, LadderClient } from '../src/server/ladder-refresh';
import { parseShowdown } from '../src/domain/ladder';
import { showdownUsage, showdownChaos } from './ladder-fixtures';

test('Ladder persists provider Retry-After across restart without re-requesting during cooldown', async () => {
  const store = new Store(':memory:');
  let calls = 0;
  const fetcher = (async () => {
    calls++;
    return new Response('', {
      status: 429,
      headers: { 'Retry-After': '7200' },
    });
  }) as typeof fetch;
  await assert.rejects(
    () =>
      new LadderClient(store, undefined, fetcher).read(
        'https://www.smogon.com/stats/',
      ),
    /429/,
  );
  await assert.rejects(
    () =>
      new LadderClient(store, undefined, fetcher).read(
        'https://www.smogon.com/stats/',
      ),
    /cooldown/,
  );
  assert.equal(calls, 1);
  assert.ok(
    store.state<number>('ladder-cooldown:www.smogon.com')! >
      Date.now() + 7100000,
  );
  store.close();
});

test('UTC daily slots catch up once after restart; overlap preserves the run opportunity', async () => {
  const store = new Store(':memory:');
  const d = publish(store, [fixture()], '2026-09-30T18:00:00Z', 'saved');
  const now = Date.parse('2026-10-02T18:00:00Z');
  assert.equal(
    new Date(dailySlot(now, '06:00')).toISOString(),
    '2026-10-02T06:00:00.000Z',
  );
  assert.equal(
    new Date(
      dailySlot(Date.parse('2026-10-02T05:59:59Z'), '06:00'),
    ).toISOString(),
    '2026-10-01T06:00:00.000Z',
  );
  assert.throws(() => dailySlot(now, '24:00'));
  let calls = 0;
  const execute = async () => {
    calls++;
    return d;
  };
  store.acquireLease('ladder', Date.now());
  assert.equal(
    (await runScheduled(store, { now, execute })).state,
    'contention',
  );
  assert.equal(calls, 0);
  store.releaseLease('ladder');
  const key = 'run:daily:M-C:2026-10-02T06:00:00.000Z';
  store.saveState(key, {
    id: key.slice(4),
    regulation: 'M-C',
    kind: 'daily',
    state: 'running',
  });
  await runScheduled(store, { now, execute });
  await runScheduled(store, { now: now + 1000, execute });
  assert.equal(calls, 1);
  assert.equal(store.state<{ state: string }>(key)?.state, 'complete');
  store.close();
});
test('Ladder catches every missing supported month and refuses to relabel a capture after its season', async () => {
  assert.equal(
    championsContract(undefined, Date.parse('2026-10-02T18:00:00Z')).season,
    'M-6',
  );
  assert.throws(
    () => championsContract(undefined, Date.parse('2026-10-08T18:00:00Z')),
    /new source audit/,
  );
  const snapshot = {
    url: 'https://example.test',
    checksum: 'a'.repeat(64),
    retrievedAt: '2026-10-02T18:00:00.000Z',
  };
  const calls: string[] = [];
  const drafts = await collectShowdown(
    async (url) => {
      calls.push(url);
      if (url.endsWith('/stats/'))
        return {
          body: ['2026-08', '2026-09', '2026-10', '2026-11']
            .map((m) => `<a href="${m}/">month</a>`)
            .join(''),
          snapshot,
        };
      if (/20\d\d-\d\d\/$/.test(url))
        return {
          body: '<a href="gen9championsvgc2026regmc-1630.txt">usage</a>',
          snapshot,
        };
      return {
        body: url.endsWith('.json')
          ? JSON.stringify(showdownChaos())
          : showdownUsage,
        snapshot,
      };
    },
    undefined,
    [
      {
        ...parseShowdown(showdownUsage, showdownChaos(), {
          month: '2026-08',
          formatId: 'gen9championsvgc2026regmc',
          rating: 1630,
          snapshots: [snapshot],
        }),
        id: 'a'.repeat(16),
        publishedAt: snapshot.retrievedAt,
        pokemon: 1,
        excludedCount: 0,
      },
    ],
  );
  assert.deepEqual(
    drafts.map((d) => d.month),
    ['2026-09', '2026-10', '2026-11'],
  );
  assert.equal(
    calls.some((url) => url.includes('2026-08/chaos')),
    false,
  );
});
