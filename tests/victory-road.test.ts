import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeVictoryRoad,
  victoryMetadata,
  collectVictoryRoad,
} from '../src/server/victory-road';
import { Store } from '../src/server/store';
import type { CollectionReport } from '../src/domain/types';
import { reconcileRecords } from '../src/domain/reconciliation';
const article =
  'Videogame Pokémon Champions Season 2027 Season – VGC Regulation Set M-C Open team lists <tr><td>Date</td><td>19–20 September 2026</td></tr><tr><td>Attendance</td><td>20 players</td></tr>';
const names = [
  'Incineroar',
  'Rillaboom',
  'Sneasler',
  'Garchomp',
  'Pelipper',
  'Farigiraf',
];
const payload = () => ({
  ids: Array.from({ length: 20 }, (_, i) => `p${i}`),
  j: Array.from({ length: 20 }, (_, i) => [
    `p${i}`,
    '',
    '',
    i + 1,
    '',
    names.map((n) => ['', n, '', '']),
    null,
  ]),
  h: Array.from({ length: 20 }, (_, i) =>
    i === 0
      ? [['Final', 1, 'V', '2–0', 0, 0, 0]]
      : i === 1
        ? [['Final', 0, 'D', '0–2', 0, 0, 0]]
        : ([] as (string | number)[][]),
  ),
});
const page = (data: ReturnType<typeof payload>) =>
  `<h1>Fixture only</h1><p class="tp-fecha">19 September · 07:00 UTC</p><div class="n">20</div><div class="l">Players</div><a href="https://battlefy.com/victoryroad/event/aaaaaaaaaaaaaaaaaaaaaaaa/info">Battlefy</a><script id="partidas-json" type="application/json">${JSON.stringify(data)}</script>`;
test('Victory Road uses evidenced UTC start, full roster, original Battlefy IDs and reciprocal series', () => {
  const d = payload();
  const e = normalizeVictoryRoad('fixture', article, page(d), []);
  assert.equal(e.date, '2026-09-19T07:00:00.000Z');
  assert.equal(e.endsAt, '2026-09-20T23:59:59.999Z');
  assert.equal(
    e.provenance?.canonicalEvent,
    'battlefy:aaaaaaaaaaaaaaaaaaaaaaaa',
  );
  assert.equal(e.matches.length, 1);
  assert.equal(e.matches[0].winner, 'p0');
  assert.equal(reconcileRecords(e).representedMatchRecords, 2);
  assert.equal(e.accounting?.duplicateMatchRecords, 1);
});
test('Victory Road resumes partial event bodies after a budget interruption beyond 24 hours', async () => {
  const store = new Store(':memory:');
  const calls: string[] = [];
  const fetcher = (async (input: string | URL | Request) => {
    const url = String(input);
    calls.push(url);
    return new Response(
      url === 'https://circuit.victoryroad.pro/'
        ? 'VR Circuit 2027 Pokémon Champions <a href="/tournament/vr-fixture">event</a>'
        : url.startsWith('https://victoryroad.pro/')
          ? article
          : page(payload()),
    );
  }) as typeof fetch;
  const report = (): CollectionReport => ({
    asOf: '2026-09-30T18:00:00Z',
    discovery: 'complete',
    apiPages: 0,
    completedPages: 0,
    listed: 0,
    completed: 0,
    refreshed: 0,
    cached: 0,
    excluded: [],
    carriedForward: [],
    snapshots: [],
  });
  const first = report();
  assert.equal(
    (
      await collectVictoryRoad(
        store,
        first.asOf,
        first,
        { maxReads: 2 },
        fetcher,
      )
    ).length,
    0,
  );
  assert.equal(first.discovery, 'partial');
  const second = report();
  assert.equal(
    (
      await collectVictoryRoad(
        store,
        '2026-10-02T18:00:00Z',
        second,
        { maxReads: 2 },
        fetcher,
      )
    ).length,
    1,
  );
  assert.equal(
    calls.filter((v) => v === 'https://victoryroad.pro/vr-fixture/').length,
    1,
  );
  store.close();
});
test('inconsistent reciprocal results and unrevealed teams retain evidence without creating losses', () => {
  const d = payload();
  d.j[2][5] = [];
  d.h[2] = [[1, 3, 'V', '2–0', 0, 0, 0]];
  d.h[3] = [[1, 2, 'V', '2–0', 0, 0, 0]];
  d.h[4] = [[1, -1, 'B', '', 0, 0, 0]];
  const e = normalizeVictoryRoad('fixture', article, page(d), []);
  assert.equal(e.registrations[2].slots, null);
  assert.ok(
    e.quarantine.some((q) => q.reason === 'unresolved-reciprocal-result'),
  );
  assert.equal(e.matches.length, 2);
  const report = reconcileRecords(e);
  assert.equal(report.eligible, 1);
  assert.equal(report.excluded, 1);
  assert.equal(report.representedMatchRecords, 5);
});
test('Victory Road refuses partial rosters, inconsistent dates, entrant counts and unfinished events', () => {
  const d = payload();
  d.ids.pop();
  assert.throws(
    () => normalizeVictoryRoad('fixture', article, page(d), []),
    /roster coverage/,
  );
  assert.throws(
    () =>
      victoryMetadata(
        article,
        page(payload()).replace('19 September', '18 September'),
      ),
    /start date/,
  );
  assert.throws(
    () =>
      victoryMetadata(
        article.replace('20 players', '19 players'),
        page(payload()),
      ),
    /entrant-count/,
  );
  const unfinished = payload();
  unfinished.h[0] = [];
  unfinished.h[1] = [];
  assert.throws(
    () => normalizeVictoryRoad('fixture', article, page(unfinished), []),
    /not-confirmed-completed/,
  );
});

test('Victory Road invalidates a whole duplicate-species team and its comparable series', () => {
  const d = payload();
  (d.j[0][5] as string[][])[1][1] = 'Incineroar';
  const e = normalizeVictoryRoad('fixture', article, page(d), []);
  assert.equal(e.registrations[0].slots, null);
  assert.ok(e.quarantine.some((q) => q.reason === 'Duplicate team species'));
  assert.equal(reconcileRecords(e).eligible, 0);
  assert.equal(reconcileRecords(e).excluded, 1);
});
