import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  fetchBounded,
  completedPagination,
  retryDelay,
} from '../src/server/collector';
import { collect } from '../src/server/collector';
import { Store } from '../src/server/store';

test('discovery follows API and completed-list pages, accounts for small events, and publishes beyond page one', async () => {
  const store = new Store(':memory:');
  const ids = ['a', 'b', 'c'].map((s) => s.repeat(24));
  const calls: string[] = [];
  const provider = (async (input: string | URL | Request) => {
    const url = new URL(String(input));
    calls.push(url.href);
    const page = Number(url.searchParams.get('page') ?? 1);
    if (url.pathname === '/api/tournaments')
      return Response.json(
        page <= 2
          ? [
              {
                id: ids[page - 1],
                game: 'VGC',
                format: 'M-C',
                date: '2026-09-20T12:00:00Z',
                players: page === 1 ? 19 : 20,
              },
            ]
          : [],
      );
    if (url.pathname === '/tournaments/completed')
      return new Response(
        '<title>Completed Tournaments | Limitless</title>' +
          `<a href="/tournament/${ids[page === 1 ? 2 : 1]}/standings">event</a>` +
          (page === 1
            ? '<a href="?game=VGC&format=M-C&show=100&page=2">2</a>'
            : ''),
      );
    if (url.pathname.endsWith('/details'))
      return Response.json({
        id: ids[1],
        game: 'VGC',
        format: 'M-C',
        date: '2026-09-20T12:00:00Z',
        name: 'Second page',
        players: 20,
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
  const events = await collect(
    store,
    '2026-09-30T18:00:00Z',
    undefined,
    provider,
  );
  assert.equal(events.length, 1);
  assert.equal(events[0].id, ids[1]);
  assert.ok(
    calls.some(
      (url) => url.includes('/api/tournaments?') && url.includes('page=3'),
    ),
  );
  assert.ok(
    calls.some(
      (url) =>
        url.includes('/tournaments/completed?') && url.includes('page=2'),
    ),
  );
  assert.equal(
    store
      .state<{ excluded: { id: string; reason: string }[] }>(
        'collection-report',
      )
      ?.excluded.find((e) => e.id === ids[0])?.reason,
    'below-entrant-floor',
  );
  store.close();
});

test('verified completed pagination and HTTP date cooldowns reject changed source contracts', () => {
  assert.equal(
    completedPagination(
      '<ul class="pagination" data-current="1" data-max="4">',
      1,
    ),
    true,
  );
  assert.equal(
    completedPagination(
      '<ul class="pagination" data-current="4" data-max="4">',
      4,
    ),
    false,
  );
  assert.throws(() =>
    completedPagination(
      '<ul class="pagination" data-current="1" data-max="4">',
      2,
    ),
  );
  assert.equal(
    retryDelay(
      'Wed, 30 Sep 2026 18:00:03 GMT',
      Date.parse('2026-09-30T18:00:00Z'),
    ),
    3000,
  );
  assert.throws(() => retryDelay('not-a-date'));
});

test('bounded discovery checkpoints resume without re-fetching completed API pages', async () => {
  const store = new Store(':memory:');
  const calls: string[] = [];
  const provider = (async (input: string | URL | Request) => {
    const url = new URL(String(input));
    calls.push(url.href);
    if (url.pathname === '/api/tournaments')
      return Response.json(
        url.searchParams.get('page') === '1'
          ? [
              {
                id: 'a'.repeat(24),
                game: 'VGC',
                format: 'M-C',
                date: '2026-09-20T12:00:00Z',
                players: 19,
              },
            ]
          : [],
      );
    return new Response('<title>Completed Tournaments | Limitless</title>');
  }) as typeof fetch;
  await assert.rejects(
    () => collect(store, '2026-09-30T18:00:00Z', { maxReads: 1 }, provider),
    /Request budget/,
  );
  assert.equal(
    store.state<{ apiPage: number }>('limitless:M-C:progress')?.apiPage,
    2,
  );
  const events = await collect(store, '2026-09-30T18:01:00Z', {}, provider);
  assert.equal(events.length, 0);
  assert.equal(
    calls.filter((s) => s.includes('/api/tournaments?') && s.includes('page=1'))
      .length,
    1,
  );
  assert.equal(
    store.state<{ discovery: string }>('collection-report')?.discovery,
    'complete',
  );
  store.close();
});

test('repeated API pages never produce complete coverage or an empty replacement publication', async () => {
  const store = new Store(':memory:');
  const provider = (async () =>
    Response.json([
      {
        id: 'a'.repeat(24),
        game: 'VGC',
        format: 'M-C',
        date: '2026-09-20T12:00:00Z',
        players: 20,
      },
    ])) as typeof fetch;
  await assert.rejects(
    () => collect(store, '2026-09-30T18:00:00Z', {}, provider),
    /repeated a page/,
  );
  assert.equal(
    store.state<{ discovery: string }>('collection-report')?.discovery,
    'partial',
  );
  store.close();
});
test('provider boundaries reject nonretryable errors and respect long cooldown', async () => {
  let calls = 0;
  const provider = (async () => {
    calls++;
    return new Response('private', { status: 403 });
  }) as typeof fetch;
  await assert.rejects(
    () => fetchBounded('https://example.test', provider),
    /HTTP 403/,
  );
  assert.equal(calls, 1);
  await assert.rejects(
    () =>
      fetchBounded(
        'https://example.test',
        (async () =>
          new Response('', {
            status: 429,
            headers: { 'retry-after': '3600' },
          })) as typeof fetch,
      ),
    /cooldown/,
  );
});
