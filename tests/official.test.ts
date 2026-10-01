import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fixture, slot } from './fixtures';
import { aggregate } from '../src/domain/analytics';
import { provenance, reconcileSources } from '../src/domain/sources';
import { Store, publish } from '../src/server/store';
import type { NormalizedEvent, Options } from '../src/domain/types';

const options = {
  regulation: 'M-C',
  asOf: '2026-09-30T18:00:00Z',
  days: 30,
  sheet: 'all',
  minPlayers: 0,
} as Options;
function official(): NormalizedEvent {
  const e = fixture();
  e.id = 'rk9:original:masters';
  e.provenance = {
    ...provenance(e),
    canonicalEvent: 'rk9:original:masters',
    participantNamespace: 'rk9:original:masters',
    official: 'verified',
    sources: [
      {
        provider: 'pokedata',
        originalId: 'original',
        url: 'https://example.test/masters',
      },
    ],
    ...{
      division: 'masters',
      eventType: 'regional',
      season: '2027',
      roster: 'complete',
      regulationEvidence: 'Explicit event format',
      divisionEvidence: 'Masters roster',
      entrantEvidence: [20],
    },
  };
  return e;
}
test('official eligibility requires Masters evidence and division attendance, never combined counts', () => {
  const good = official();
  assert.equal(aggregate([good], options).coverage.events, 1);
  for (const change of [
    { division: 'senior' },
    { division: 'unknown' },
    { entrantEvidence: [20, 21] },
    { entrantEvidence: [1173] },
    { regulationEvidence: '' },
  ]) {
    const bad = {
      ...good,
      provenance: { ...good.provenance!, ...change },
    } as NormalizedEvent;
    assert.equal(
      aggregate([bad], options).coverage.events,
      0,
      JSON.stringify(change),
    );
  }
});
test('Official filter pools exactly its selected cohort and matching baselines', () => {
  const good = official();
  const community = fixture();
  community.name = 'Community';
  const all = aggregate([good, community], options);
  const selected = aggregate([good, community], {
    ...options,
    ...{ official: true },
  });
  assert.equal(all.coverage.matches, 6);
  assert.equal(selected.coverage.matches, 3);
  assert.equal(selected.coverage.registrations, 3);
  assert.deepEqual(selected.pokemon, aggregate([good], options).pokemon);
});
test('evidenced supplemental mirror fills teams by stable identity without duplicating physical results', () => {
  const base = official();
  base.registrations[0].slots = null;
  const supplemental = official();
  supplemental.id = 'mirror';
  supplemental.provenance!.sources = [
    {
      provider: 'rk9-export',
      originalId: 'original',
      url: 'https://example.test/export',
    },
  ];
  const joined = reconcileSources([base, supplemental]);
  assert.equal(joined.events.length, 1);
  assert.equal(joined.events[0].registrations[0].slots?.length, 2);
  assert.equal(aggregate(joined.events, options).coverage.matches, 3);
  supplemental.registrations[0].slots = [slot('garchomp')];
  base.registrations[0].slots = [slot('incineroar')];
  assert.equal(reconcileSources([base, supplemental]).events.length, 0);
});
test('unknown incoming regulations cannot replace an active publication even when collection is empty', () => {
  const store = new Store(':memory:');
  const previous = publish(store, [fixture()], options.asOf, 'test');
  const incoming = { ...fixture(), id: 'incoming', regulation: 'M-D' };
  assert.throws(() =>
    publish(store, [incoming], options.asOf, 'unsupported', {
      asOf: options.asOf,
      discovery: 'complete',
      apiPages: 1,
      completedPages: 1,
      listed: 1,
      completed: 1,
      refreshed: 1,
      cached: 0,
      excluded: [],
      carriedForward: [],
      snapshots: [],
    }),
  );
  assert.equal(store.current()?.id, previous.id);
  store.close();
});
