import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Store, publish } from '../src/server/store';
import { fixture } from './fixtures';
import { refresh, nextRefresh } from '../src/server/refresh';
test('expired leases recover and another owner cannot renew or release a live lease', () => {
  const store = new Store(':memory:');
  assert.equal(store.acquireLease('a', 1000, 100), true);
  assert.equal(store.acquireLease('b', 1050, 100), false);
  store.releaseLease('b');
  assert.equal(store.acquireLease('b', 1051, 100), false);
  assert.equal(store.acquireLease('b', 1100, 100), true);
  assert.equal(store.acquireLease('a', 1101, 100), false);
  store.releaseLease('b');
  assert.equal(store.acquireLease('a', 1102, 100), true);
  store.close();
});
test('worker catches up after downtime and persists daily, hourly and failure schedules', () => {
  const store = new Store(':memory:');
  const now = Date.parse('2026-09-30T18:00:00Z');
  assert.equal(nextRefresh(store, 24, now), now);
  store.saveState('last-success', '2026-09-29T18:00:00Z');
  assert.equal(nextRefresh(store, 24, now), now);
  assert.ok(nextRefresh(store, 1, now) < now);
  store.saveState('worker-retry-at', now + 300000);
  assert.equal(nextRefresh(store, 24, now), now + 300000);
  assert.throws(() => nextRefresh(store, 0));
  store.close();
});
test('collection failure preserves valid cached results and independently expires the rolling window', async () => {
  const store = new Store(':memory:');
  const asOf = '2026-09-30T18:00:00Z';
  const d = publish(store, [fixture()], asOf, 'test');
  const provider = (async () =>
    new Response('', { status: 403 })) as typeof fetch;
  await assert.rejects(() => refresh(store, asOf, {}, provider), /403/);
  assert.equal(store.current()?.id, d.id);
  assert.equal(store.status()?.state, 'failure');
  await assert.rejects(
    () => refresh(store, '2026-10-31T18:00:00Z', {}, provider),
    /403/,
  );
  assert.equal(store.current()?.views['all:0'].coverage.events, 0);
  assert.equal(store.current()?.collection?.discovery, 'partial');
  assert.equal(store.status()?.state, 'failure');
  store.close();
});
test('overlapping ingestion exits before any provider request', async () => {
  const store = new Store(':memory:');
  store.acquireLease('existing', Date.now());
  let requests = 0;
  const provider = (async () => {
    requests++;
    return Response.json([]);
  }) as typeof fetch;
  await assert.rejects(
    () => refresh(store, undefined, {}, provider),
    /Another ingestion/,
  );
  assert.equal(requests, 0);
  store.close();
});

test('the worker cannot reactivate an explicitly archived regulation', async () => {
  const store = new Store(':memory:');
  const saved = publish(store, [fixture()], '2026-09-30T18:00:00Z', 'test');
  store.archiveCurrent('M-C');
  let calls = 0;
  const provider = (async () => {
    calls++;
    return new Response('', { status: 403 });
  }) as typeof fetch;
  await assert.rejects(
    () => refresh(store, undefined, {}, provider),
    /archived/,
  );
  assert.equal(calls, 0);
  assert.equal(store.current(), null);
  assert.equal(store.archives()[0].id, saved.id);
  store.close();
});

test('All integrates audited Victory Road registrations and reciprocal series instead of top-team standings', async () => {
  const store = new Store(':memory:');
  const names = [
    'Incineroar',
    'Rillaboom',
    'Sneasler',
    'Garchomp',
    'Pelipper',
    'Farigiraf',
  ];
  const ids = Array.from({ length: 20 }, (_, i) => `player-${i}`);
  const j = ids.map((id, i) => [
    id,
    '',
    '',
    i + 1,
    '',
    names.map((name) => ['', name, '', '']),
    null,
  ]);
  const h = ids.map((_, i) =>
    i === 0
      ? [['Final', 1, 'V', '2–0', 0, 0, 0]]
      : i === 1
        ? [['Final', 0, 'D', '0–2', 0, 0, 0]]
        : [],
  );
  const provider = (async (input: string | URL | Request) => {
    const url = String(input);
    if (url.includes('/api/tournaments?')) return Response.json([]);
    if (url.includes('/tournaments/completed?'))
      return new Response('<title>Completed Tournaments | Limitless</title>');
    if (url === 'https://circuit.victoryroad.pro/')
      return new Response(
        'VR Circuit 2027 Pokémon Champions <a href="/tournament/vr-sep26">Results</a>',
      );
    if (url === 'https://victoryroad.pro/vr-sep26/')
      return new Response(
        'Videogame Pokémon Champions Season 2027 Season – VGC Regulation Set M-C Open team lists <tr><td>Date</td><td>19–20 September 2026</td></tr><tr><td>Attendance</td><td>20 players</td></tr>',
      );
    return new Response(
      `<h1>Test Victory event</h1><p class="tp-fecha">19 September · 07:00 UTC</p><div class="n">20</div><div class="l">Players</div><a href="https://battlefy.com/victoryroad/event/aaaaaaaaaaaaaaaaaaaaaaaa/info">Battlefy</a><script id="partidas-json" type="application/json">${JSON.stringify({ ids, j, h })}</script>`,
    );
  }) as typeof fetch;
  const d = await refresh(store, '2026-09-30T18:00:00Z', {}, provider);
  assert.equal(d.events.length, 1);
  assert.equal(d.views['all:0'].coverage.registrations, 20);
  assert.equal(d.views['all:0'].coverage.matches, 1);
  assert.equal(d.events[0].provenance?.sources[0].provider, 'victory-road');
  assert.equal(d.views['victory-road:all:0'].coverage.events, 1);
  store.close();
});
