import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aggregate, rankMatchups } from '../src/domain/analytics';
import { fixture } from './fixtures';
const options = {
  regulation: 'M-C',
  asOf: '2026-09-30T18:00:00Z',
  days: 30,
  sheet: 'open' as const,
  minPlayers: 0,
};

test('performer ranking defaults to improvement over each Pokémon’s overall rate, with optional win-rate sorting', () => {
  const result = aggregate([fixture()], options);
  const template = result.matchups.incineroar[0];
  result.matchups.incineroar = [
    {
      ...template,
      id: 'high-rate',
      name: 'High rate',
      winRate: 80,
      baseline: 78,
      difference: 2,
    },
    {
      ...template,
      id: 'high-lift',
      name: 'High lift',
      winRate: 60,
      baseline: 40,
      difference: 20,
    },
    {
      ...template,
      id: 'low-lift',
      name: 'Low lift',
      winRate: 45,
      baseline: 70,
      difference: -25,
    },
    {
      ...template,
      id: 'zero',
      name: 'Zero',
      winRate: 0,
      baseline: 0,
      difference: 0,
    },
  ];
  const floor = { matches: 1, events: 1, players: 1 };
  assert.equal(
    rankMatchups(result, 'incineroar', 'best', floor)[0].id,
    'high-lift',
  );
  assert.equal(
    rankMatchups(result, 'incineroar', 'worst', floor)[0].id,
    'low-lift',
  );
  assert.equal(
    rankMatchups(result, 'incineroar', 'best', floor, 'winRate')[0].id,
    'high-rate',
  );
  assert.equal(
    rankMatchups(result, 'incineroar', 'worst', floor, 'winRate')[0].id,
    'low-lift',
  );
});
test('registration usage is unweighted; series outcomes and overlap perspectives have exact rates', () => {
  const result = aggregate([fixture()], options);
  const inc = result.pokemon.find((x) => x.id === 'incineroar')!;
  assert.equal(inc.registrations, 2);
  assert.ok(Math.abs(inc.usage - 200 / 3) < 1e-10);
  assert.equal(inc.winRate, 25);
  assert.equal(inc.matches, 3); // a-b is one physical match, two perspectives
  assert.equal(inc.outcomes, 4);
  const matchup = result.matchups.incineroar.find((x) => x.id === 'sneasler')!;
  assert.ok(Math.abs(matchup.winRate! - 200 / 3) < 1e-10);
  assert.equal(matchup.matches, 3);
  assert.equal(matchup.baseline, 50);
  assert.ok(Math.abs(matchup.difference! - 50 / 3) < 1e-10);
  assert.ok(
    Math.abs(
      result.pokemon.find((x) => x.id === 'rillaboom')!.usage - 100 / 3,
    ) < 1e-10,
  );
});
test('quarantines nondecisive, noncompetitive and ambiguous results, preserves rematches and zeros', () => {
  const e = fixture();
  e.matches.push(
    e.matches[0],
    { ...e.matches[0], id: 'rematch', round: 4 },
    ...[0, -1, null, 'stranger'].map((winner, i) => ({
      ...e.matches[0],
      id: `bad-${i}`,
      winner,
    })),
    { ...e.matches[0], id: 'bye', player2: null },
    { ...e.matches[0], id: 'admin', administrative: true },
  );
  const r = aggregate([e], options);
  assert.equal(r.coverage.matches, 4);
  assert.equal(r.coverage.excludedMatches, 6);
  assert.equal(r.pokemon.find((x) => x.id === 'garchomp')!.winRate, 100);
  const zero = r.matchups.garchomp.find((x) => x.id === 'rillaboom')!;
  assert.equal(zero.winRate, 0);
  assert.ok(Math.abs(zero.difference! + 200 / 3) < 1e-10);
});
test('missing team removes the physical match from both comparable perspectives', () => {
  const e = fixture();
  e.registrations[2].slots = null;
  const r = aggregate([e], options);
  assert.equal(r.coverage.registrations, 2);
  assert.equal(r.coverage.matches, 1);
  assert.equal(r.coverage.excludedMatches, 2);
  assert.equal(r.pokemon.find((x) => x.id === 'incineroar')!.winRate, 50);
});
test('isolates regulation, visibility, archives and exact rolling boundaries', () => {
  const e = fixture();
  const make = (id: string, date: string, regulation = 'M-C') => ({
    ...e,
    id,
    date,
    regulation,
  });
  const r = aggregate(
    [
      make('old', '2026-08-31T17:59:59Z'),
      make('start', '2026-08-31T18:00:00Z'),
      make('future', '2026-09-30T18:00:01Z'),
      make('other', e.date, 'M-B'),
      { ...e, id: 'archive', archived: true },
      {
        ...e,
        id: 'closed',
        sheet: { ...e.sheet, visibility: 'closed' as const },
      },
    ],
    options,
  );
  assert.equal(r.coverage.events, 1);
  assert.equal(r.coverage.registrations, 3);
});
test('rankings exclude self, respect evidence floor and return fewer than three if sparse', () => {
  const r = aggregate([fixture()], options);
  assert.equal(
    rankMatchups(r, 'incineroar', 'best', { matches: 3, events: 1, players: 1 })
      .length,
    1,
  );
  assert.equal(
    rankMatchups(r, 'incineroar', 'best', { matches: 4, events: 1, players: 1 })
      .length,
    0,
  );
});
