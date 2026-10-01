import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fixture, slot } from './fixtures';
import {
  eligibility,
  provenance,
  reconcileSources,
} from '../src/domain/sources';
import { aggregate } from '../src/domain/analytics';
import { buildSummaries } from '../src/domain/builds';
import { publicDataset } from '../src/server/reader';
import { Store, publish } from '../src/server/store';
const options = {
  regulation: 'M-C',
  asOf: '2026-09-30T18:00:00Z',
  days: 30,
  sheet: 'all' as const,
  minPlayers: 0,
};
test('entrant boundaries and incompatible environments cannot enter All', () => {
  assert.equal(eligibility(19), 'below-entrant-floor');
  for (const n of [20, 99, 100]) assert.equal(eligibility(n), null);
  for (const n of [undefined, null, '100', -1, 20.5])
    assert.equal(eligibility(n), 'unresolved-entrant-count');
  const e = fixture();
  const incompatible = {
    ...e,
    provenance: { ...provenance(e), environment: 'showdown' as const },
  };
  const partial = {
    ...e,
    provenance: {
      ...provenance(e),
      population: 'published-top-teams' as const,
    },
  };
  assert.equal(aggregate([incompatible, partial], options).coverage.events, 0);
});
test('All pools underlying counts and uses the identical filtered baseline', () => {
  const a = fixture();
  a.registrations = [
    { player: 'a', slots: [slot('incineroar')], drop: null },
    { player: 'b', slots: [slot('rillaboom')], drop: null },
  ];
  a.matches = [a.matches[0]];
  const b = { ...fixture(), id: 'other', name: 'Other event', players: 100 };
  b.provenance = {
    ...provenance(b),
    sources: [
      {
        provider: 'official-feed',
        originalId: 'other',
        url: 'https://example.test/event',
      },
    ],
  };
  b.registrations = Array.from({ length: 10 }, (_, i) => ({
    player: `p${i}`,
    drop: null,
    slots: [slot(i === 9 ? 'rillaboom' : 'incineroar')],
  }));
  b.matches = Array.from({ length: 9 }, (_, i) => ({
    id: String(i),
    phase: 1,
    round: i + 1,
    player1: `p${i}`,
    player2: 'p9',
    winner: 'p9',
  }));
  const all = aggregate([a, b], options);
  const inc = all.pokemon.find((r) => r.id === 'incineroar')!;
  assert.equal(inc.winRate, 10); // 1/10, not the mean of 100% and 0%.
  assert.ok(Math.abs(inc.usage - (10 / 12) * 100) < 1e-10);
  const matchup = all.matchups.rillaboom.find((r) => r.id === 'incineroar')!;
  assert.equal(matchup.baseline, 10);
  assert.equal(matchup.difference, 0);
  assert.equal(
    aggregate([a, b], { ...options, source: 'official-feed' }).pokemon.find(
      (r) => r.id === 'incineroar',
    )!.winRate,
    0,
  );
  assert.equal(
    aggregate([a, b], { ...options, minPlayers: 100 }).coverage.events,
    1,
  );
});
test('verified cross-source mirrors count once; conflicting and unresolved mirrors are quarantined', () => {
  const a = fixture();
  const mirror = {
    ...fixture(),
    id: 'mirror',
    provenance: {
      ...provenance(a),
      sources: [
        {
          provider: 'mirror-feed',
          originalId: 'mirror',
          url: 'https://example.test/mirror',
        },
      ],
    },
  };
  const result = reconcileSources([a, mirror]);
  assert.equal(result.events.length, 1);
  assert.equal(result.events[0].provenance?.sources.length, 2);
  assert.equal(aggregate([a, mirror], options).coverage.matches, 3);
  mirror.matches = mirror.matches.map((m, i) =>
    i === 0 ? { ...m, winner: 'b' } : m,
  );
  assert.equal(
    reconcileSources([a, mirror]).quarantine[0].reason,
    'conflicting-source-event',
  );
  assert.equal(aggregate([a, mirror], options).coverage.events, 0);
  mirror.provenance.canonicalEvent = 'unverified-other-key';
  assert.equal(
    reconcileSources([a, mirror]).quarantine[0].reason,
    'unresolved-cross-source-identity',
  );
});
test('registered builds retain missing coverage and count a move once per slot', () => {
  const e = fixture();
  e.registrations[0].slots![0] = {
    ...slot('incineroar'),
    item: 'Safety Goggles',
    moves: ['Fake Out', 'Fake Out', 'Flare Blitz'],
    stats: { hp: 252, atk: 4 },
  };
  const builds = buildSummaries([e]).incineroar;
  assert.equal(builds.items.total, 2);
  assert.equal(builds.items.known, 1);
  assert.equal(builds.items.values[0].percent, 100);
  assert.equal(
    builds.moves.values.find((v) => v.name === 'Fake Out')?.count,
    1,
  );
  assert.equal(builds.abilities.known, 0);
});

test('legacy cached duplicate species cannot enter usage, outcomes or build denominators', () => {
  const e = fixture();
  e.registrations[0].slots!.push(slot('incineroar'));
  const r = aggregate([e], options);
  assert.equal(r.coverage.registrations, 2);
  assert.equal(r.coverage.matches, 1);
  assert.equal(r.builds?.incineroar.items.total, 1);
  assert.ok(
    reconcileSources([e]).events[0].quarantine.some(
      (q) => q.reason === 'duplicate-team-species',
    ),
  );
});
test('browser publications omit raw facts, quarantined evidence, and collection snapshots', () => {
  const store = new Store(':memory:');
  const d = publish(
    store,
    [fixture(), { ...fixture(), id: 'small', players: 19 }],
    options.asOf,
    'test',
  );
  const output = publicDataset(d);
  assert.equal('events' in output, false);
  assert.equal('quarantine' in output, false);
  assert.equal('collection' in output, false);
  assert.deepEqual(output.providers, [{ id: 'limitless', name: 'Limitless' }]);
  assert.equal(
    Object.keys(output.views).length,
    1,
    'Only the selected cached cohort should enter browser props',
  );
  store.close();
});

test('multiple record providers pool raw counts once and exclude unselected providers in immutable reads', () => {
  const a = fixture();
  const mirror = {
    ...fixture(),
    id: 'mirror',
    provenance: {
      ...provenance(a),
      sources: [
        {
          provider: 'pokedata',
          originalId: 'mirror',
          url: 'https://example.test/mirror',
        },
      ],
    },
  };
  const separate = {
    ...fixture(),
    id: 'separate',
    name: 'Separate event',
    provenance: {
      ...provenance(a),
      canonicalEvent: 'separate',
      sources: [
        {
          provider: 'victory-road',
          originalId: 'separate',
          url: 'https://example.test/separate',
        },
      ],
    },
  };
  const store = new Store(':memory:');
  const d = publish(store, [a, mirror, separate], options.asOf, 'test');
  const output = publicDataset(d, 'limitless,pokedata');
  const selected = Object.values(output.views)[0];
  assert.equal(selected.coverage.events, 1);
  assert.equal(selected.coverage.matches, 3);
  assert.equal(selected.coverage.registrations, 3);
  assert.equal(
    selected.pokemon.find((p) => p.id === 'incineroar')!.winRate,
    25,
  );
  assert.equal(
    Object.values(publicDataset(d, 'none').views)[0].coverage.events,
    0,
  );
  assert.equal(store.current()!.id, d.id, 'Browsing must not republish');
  store.close();
});

test('build labels share canonical identities across case and spacing without losing raw evidence or double-counting moves', () => {
  const e = fixture();
  e.registrations[0].slots![0] = {
    ...slot('incineroar'),
    item: 'life orb',
    ability: 'blaze',
    nature: 'adamant',
    moves: ['fake out', 'Fake Out', 'FLARE BLITZ'],
  };
  e.registrations[1].slots![0] = {
    ...slot('incineroar'),
    item: '  Life   Orb ',
    ability: 'Blaze',
    nature: 'Adamant',
    moves: ['Fake Out'],
  };
  const builds = buildSummaries([e]).incineroar;
  assert.deepEqual(builds.items.values, [
    { name: 'Life Orb', count: 2, percent: 100 },
  ]);
  assert.deepEqual(builds.abilities.values, [
    { name: 'Blaze', count: 2, percent: 100 },
  ]);
  assert.deepEqual(builds.natures.values, [
    { name: 'Adamant', count: 2, percent: 100 },
  ]);
  assert.equal(
    builds.moves.values.find((v) => v.name === 'Fake Out')?.count,
    2,
  );
  assert.equal(e.registrations[0].slots![0].item, 'life orb');
  assert.equal(e.registrations[0].slots![0].ability, 'blaze');
});

test('teammates use resolved registration denominators, exclude self and retain canonical identities within each provider cohort', () => {
  const e = fixture();
  e.registrations.push({ player: 'unresolved', slots: null, drop: null });
  const result = aggregate([e], options);
  const teammates = result.builds!.incineroar.teammates;
  assert.equal(teammates.total, 2);
  assert.equal(teammates.known, 2);
  assert.deepEqual(
    teammates.values.map((v) => ({
      id: v.id,
      count: v.count,
      percent: v.percent,
    })),
    [
      { id: 'rillaboom', count: 1, percent: 50 },
      { id: 'sneasler', count: 1, percent: 50 },
    ],
  );
  assert.ok(!teammates.values.some((v) => v.id === 'incineroar'));
  const second = {
    ...fixture(),
    id: 'other',
    name: 'Other event',
    provenance: {
      ...provenance(e),
      canonicalEvent: 'other',
      sources: [
        {
          provider: 'victory-road',
          originalId: 'other',
          url: 'https://example.test/other',
        },
      ],
    },
  };
  second.registrations[0].slots![1] = slot('sneasler');
  const pooled = aggregate([e, second], options).builds!.incineroar.teammates;
  assert.equal(pooled.total, 4);
  assert.deepEqual(
    pooled.values.map((v) => [v.id, v.percent]),
    [
      ['sneasler', 75],
      ['rillaboom', 25],
    ],
  );
  const limited = aggregate([e, second], { ...options, source: 'limitless' })
    .builds!.incineroar.teammates;
  assert.deepEqual(limited, teammates);
});
