import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeOfficial,
  officialMetadata,
  discoverOfficial,
  collectOfficial,
} from '../src/server/official';
import { Store, publish } from '../src/server/store';
import { aggregate } from '../src/domain/analytics';
import { reconcileRecords } from '../src/domain/reconciliation';
import { refresh } from '../src/server/refresh';
import { fixture } from './fixtures';
import type { CollectionReport } from '../src/domain/types';
const listing = {
  id: '1000070',
  name: '2027 Frankfurt Pokémon VGC Regional Championships',
  type: 'regional' as const,
  article: 'https://victoryroad.pro/2027-frankfurt/',
};
const index = `<div class="tournament vg" id="hidden-form"><div class="title">${listing.name}</div><input type="hidden" name="id" value="${listing.id}"></div>`;
const article = (count = 20, regulation = 'M-C') =>
  `<table>${Object.entries({
    Event: '2027 Frankfurt Regional Championships',
    Videogame: 'Pokémon Champions',
    Season: `2027 Season – VGC Regulation Set ${regulation}`,
    Attendance: `${count} MA + 100 SR + 50 JR`,
    Date: '26–27 September 2026',
    Format: '1 Swiss rounds + asymmetrical top cut Open team lists',
  })
    .map(([a, b]) => `<tr><td>${a}</td><td>${b}</td></tr>`)
    .join('')}</table>`;
const names = [
  'Garchomp',
  'Raichu',
  'Rillaboom',
  'Incineroar',
  'Sneasler',
  'Milotic',
];
function payload() {
  return Object.fromEntries(
    Array.from({ length: 20 }, (_, i) => [
      String(i + 1),
      {
        i: i + 1,
        n: `Player ${i + 1}`,
        c: 'DE',
        d: null,
        q: false,
        r:
          i === 0
            ? [
                [2, 3, 1],
                [2, 3, 1],
              ]
            : i === 1
              ? [
                  [1, 0, 1],
                  [1, 0, 1],
                ]
              : [],
        o: {
          'Team List': `FR002-fiunEHp9wx4mh4/stable${i + 1}`,
          n: `Player ${i + 1}`,
          c: 'DE',
          d: 'M',
          tl: names.map((name, j) => [
            String(j + 1),
            '000',
            'Adamant',
            null,
            'Unknown',
            name,
            j === 0 ? 'Garchompite Z' : j === 1 ? 'Raichunite Y' : '',
            ['Protect'],
          ]),
        },
      },
    ]),
  );
}
const page = (
  data = payload(),
  count = 20,
  division = 'Masters',
) => `<title>${listing.name}</title><script>window.EXPECTED_COMPETITORS = ${count};</script><script>
const divisionName = "${division}";
const tournamentId = "${listing.id}";
window.playersDataMap = ${JSON.stringify(data)};
const rawPlayers = [{"i":1,"r":1},{"i":2,"r":2}];
</script><a href="https://rk9.gg/pairings/FR002-fiunEHp9wx4mh4">Original</a><div class="column-header-title">Finals</div>`;
const options = {
  regulation: 'M-C',
  asOf: '2026-09-30T18:00:00Z',
  days: 30,
  sheet: 'all' as const,
  minPlayers: 0,
};
const report = (): CollectionReport => ({
  asOf: options.asOf,
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
test('Masters roster, team-list keys and reciprocal rounds establish full coverage without standings inference', () => {
  const event = normalizeOfficial(listing, article(), page(), []);
  assert.equal(event.players, 20);
  assert.equal(event.registrations.length, 20);
  assert.equal(event.registrations[0].player, 'FR002-fiunEHp9wx4mh4/stable1');
  assert.equal(event.registrations[0].slots![0].id, 'garchompmegaz');
  assert.equal(event.registrations[0].slots![0].originalName, 'Garchomp');
  assert.equal(event.registrations[0].slots![0].originalId, '1_000');
  assert.equal(event.registrations[0].slots![0].originalForm, '000');
  assert.equal(
    event.matches.length,
    2,
    'A Swiss rematch in top cut is another physical series',
  );
  assert.notEqual(event.matches[0].id, event.matches[1].id);
  assert.equal(reconcileRecords(event).eligible, 2);
  assert.equal(event.provenance?.sources.length, 3);
});
test('combined attendance, wrong divisions, contradictory counts and selectively published teams are excluded', () => {
  assert.throws(
    () => normalizeOfficial(listing, article(), page(payload(), 170), []),
    /entrant/,
  );
  assert.throws(
    () =>
      normalizeOfficial(listing, article(), page(payload(), 20, 'Senior'), []),
    /division/,
  );
  const senior = payload();
  senior['1'].o.d = 'S';
  assert.throws(
    () => normalizeOfficial(listing, article(), page(senior), []),
    /division/,
  );
  assert.throws(
    () =>
      normalizeOfficial(listing, article(), page({ '1': payload()['1'] }), []),
    /roster/,
  );
  for (const n of [19, 0])
    assert.throws(() => officialMetadata(listing, article(n)), /floor/);
  assert.equal(officialMetadata(listing, article(100)).players, 100);
  assert.throws(
    () =>
      officialMetadata(
        listing,
        article().replace('20 MA + 100 SR + 50 JR', '170 players'),
      ),
    /entrant/,
  );
});
test('a full roster with unavailable teams supports only known registration usage and both-team outcomes', () => {
  const data = payload();
  data['2'].o.tl = [];
  const event = normalizeOfficial(listing, article(), page(data), []);
  const view = aggregate([event], options);
  assert.equal(view.coverage.events, 1);
  assert.equal(view.coverage.registrations, 19);
  assert.equal(view.coverage.matches, 0);
  assert.equal(view.coverage.excludedMatches, 2);
  assert.ok(event.quarantine.some((q) => q.reason === 'missing-complete-team'));
  data['2'].o['Team List'] = data['1'].o['Team List'];
  const ambiguous = normalizeOfficial(listing, article(), page(data), []);
  assert.equal(ambiguous.registrations[0].slots, null);
  assert.equal(ambiguous.registrations[1].slots, null);
});
test('ties, double losses, byes, administrative and conflicting histories retain original evidence', () => {
  const cases = [
    [[2, 1, 1], [1, 1, 1], 'tie'],
    [[2, 0, 1], [1, 0, 1], 'double-loss'],
    [[-1, 3, null], [1, 0, 1], 'bye-or-automatic-loss'],
    [[2, 3, 0], [1, 0, 0], 'administrative-or-unknown-table'],
    [[2, 3, 1], [1, 3, 1], 'ambiguous-outcome'],
    [[2, 3, 1], [1, 0, 2], 'unresolved-reciprocal-result'],
    [[2, 3, 1, 99], [1, 0, 1], 'malformed-history'],
  ] as const;
  for (const [a, b, reason] of cases) {
    const data = payload();
    data['1'].r[0] = [...a] as number[];
    data['2'].r[0] = [...b] as number[];
    const e = normalizeOfficial(listing, article(), page(data), []);
    assert.ok(
      e.quarantine.some((q) => q.reason === reason && q.evidence),
      reason,
    );
    assert.equal(reconcileRecords(e).eligible, 1, reason);
  }
});
test('round results require an independently corroborated completed final', () => {
  const data = payload();
  data['1'].r.pop();
  data['2'].r.pop();
  assert.throws(
    () => normalizeOfficial(listing, article(), page(data), []),
    /completed/,
  );
  assert.throws(
    () =>
      normalizeOfficial(
        listing,
        article(),
        page().replace('"i":1,"r":1', '"i":2,"r":1'),
        [],
      ),
    /completed/,
  );
});
test('discovery keeps current-season types and refuses unaudited pagination', () => {
  assert.equal(discoverOfficial(index)[0].article, listing.article);
  assert.equal(discoverOfficial(index.replaceAll('2027', '2026')).length, 0);
  assert.throws(
    () => discoverOfficial(index + '<a href="?page=2">More</a>'),
    /pagination/,
  );
});
test('official correction revisits, durable cache recovery, disappearing listings and provider failures retain facts', async () => {
  const store = new Store(':memory:');
  let reads = 0;
  let correction = false;
  const provider = (async (
    input: string | URL | Request,
    init?: RequestInit,
  ) => {
    reads++;
    const url = String(input);
    if (url === listing.article) return new Response(article());
    if (init?.method === 'POST') {
      assert.equal(init.body, `id=${listing.id}&division=Masters`);
      const data = payload();
      if (correction) data['3'].o.tl = [];
      return new Response(page(data));
    }
    return new Response(index);
  }) as typeof fetch;
  const events = await collectOfficial(
    store,
    options.asOf,
    report(),
    {},
    provider,
  );
  assert.equal(events.length, 1);
  assert.equal(reads, 3);
  publish(store, events, options.asOf, 'test');
  await collectOfficial(store, options.asOf, report(), {}, provider);
  assert.equal(reads, 4);
  correction = true;
  const corrected = await collectOfficial(
    store,
    '2026-10-01T18:00:00Z',
    report(),
    {},
    provider,
  );
  assert.equal(corrected[0].registrations.filter((r) => r.slots).length, 19);
  assert.equal(reads, 7);
  publish(store, corrected, '2026-10-01T18:00:00Z', 'corrected');
  const failure = report();
  const saved = await collectOfficial(
    store,
    '2026-10-01T18:01:00Z',
    failure,
    {},
    (async () => new Response('', { status: 403 })) as typeof fetch,
  );
  assert.equal(saved[0].registrations.filter((r) => r.slots).length, 19);
  assert.equal(failure.discovery, 'partial');
  const disappeared = await collectOfficial(
    store,
    '2026-10-01T18:02:00Z',
    report(),
    {},
    (async () =>
      new Response(
        '<div class="tournament"><form id="hidden-form"></form></div>',
      )) as typeof fetch,
  );
  assert.equal(disappeared.length, 1);
  assert.equal(
    (
      await collectOfficial(
        store,
        '2026-11-01T18:00:00Z',
        report(),
        {},
        (async () => new Response('', { status: 403 })) as typeof fetch,
      )
    ).length,
    0,
  );
  store.close();
});
test('unsupported future regulation evidence is snapshotted and never relabeled M-C', async () => {
  const store = new Store(':memory:');
  const r = report();
  const provider = (async (input: string | URL | Request) =>
    new Response(
      String(input) === listing.article ? article(20, 'M-D') : index,
    )) as typeof fetch;
  const events = await collectOfficial(store, options.asOf, r, {}, provider);
  assert.equal(events.length, 0);
  assert.ok(
    r.excluded.some((e) => e.reason === 'unsupported-or-inactive-regulation'),
  );
  assert.equal(store.snapshotCount(), 2);
  store.close();
});
test('forced bounded collections restart after durable event completion instead of refreshing the same event forever', async () => {
  const store = new Store(':memory:');
  let teamReads = 0;
  const brIndex = index
    .replaceAll('Frankfurt', 'Brisbane')
    .replaceAll('1000070', '1000068');
  const brPage = page()
    .replaceAll('Frankfurt', 'Brisbane')
    .replaceAll('1000070', '1000068')
    .replaceAll('FR002-fiunEHp9wx4mh4', 'BR002-IU5yO1W76UpdyA');
  const provider = (async (
    input: string | URL | Request,
    init?: RequestInit,
  ) => {
    if (init?.method === 'POST') {
      teamReads++;
      return new Response(
        String(init.body).includes('1000068') ? brPage : page(),
      );
    }
    if (String(input).includes('victoryroad.pro'))
      return new Response(
        String(input).includes('brisbane')
          ? article().replaceAll('Frankfurt', 'Brisbane')
          : article(),
      );
    return new Response(index + brIndex);
  }) as typeof fetch;
  const firstReport = report();
  const first = await collectOfficial(
    store,
    options.asOf,
    firstReport,
    { force: true, maxReads: 3 },
    provider,
  );
  assert.equal(first.length, 1);
  assert.equal(firstReport.discovery, 'partial');
  const resumed = await collectOfficial(
    store,
    '2026-09-30T18:01:00Z',
    report(),
    { force: true, maxReads: 3 },
    provider,
  );
  assert.equal(resumed.length, 2);
  assert.equal(teamReads, 2);
  store.close();
});

test('provider failure does not block independently verified official updates and keeps saved community coverage', async () => {
  const store = new Store(':memory:');
  publish(store, [fixture()], options.asOf, 'saved community');
  const provider = (async (
    input: string | URL | Request,
    init?: RequestInit,
  ) => {
    const url = String(input);
    if (url === listing.article) return new Response(article());
    if (url.startsWith('https://pokedata.ovh/'))
      return new Response(init?.method === 'POST' ? page() : index);
    return new Response('', { status: 403 });
  }) as typeof fetch;
  const d = await refresh(store, options.asOf, {}, provider);
  assert.equal(d.views['all:0'].coverage.events, 2);
  assert.equal(d.views['all:all:0:official'].coverage.matches, 2);
  assert.equal(d.views['all:0'].coverage.registrations, 23);
  assert.equal(store.status()?.state, 'failure');
  assert.equal(d.collection?.discovery, 'partial');
  assert.ok(d.collection?.carriedForward.includes('event-a'));
  assert.ok(store.state<number>('worker-retry-at')! > Date.now());
  store.close();
});

test('malformed registration histories remain fully accounted and cannot be joined through names', () => {
  const data = payload();
  const raw = data as unknown as Record<string, Record<string, unknown>>;
  raw['3'].q = 'unknown';
  raw['3'].r = [[1, 3, 2]];
  const e = normalizeOfficial(listing, article(), page(data), []),
    ledger = reconcileRecords(e);
  assert.equal(ledger.accounting?.malformedRegistrations, 1);
  assert.equal(ledger.accounting?.malformedMatchRecords, 1);
  assert.equal(ledger.representedMatchRecords, 5);
  assert.ok(e.quarantine.some((q) => q.reason === 'malformed-registration'));
});
