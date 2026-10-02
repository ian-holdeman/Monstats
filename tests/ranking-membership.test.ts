import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rankMatchups } from '../src/domain/rankings';
import {
  rankCombinations,
  type CombinationRow,
  type MatchupRequest,
} from '../src/domain/dynamic-matchups';
import { aggregate } from '../src/domain/analytics';
import { fixture } from './fixtures';

test('best/worst use finite unrounded change independently of every ordering', () => {
  const view = aggregate([fixture()], {
    regulation: 'M-C',
    asOf: '2026-09-30T18:00:00Z',
    days: 30,
    source: 'all',
    sheet: 'all',
    minPlayers: 0,
  });
  const base = view.matchups.incineroar[0];
  const changes = [
    25,
    -25,
    0,
    0.00001,
    -0.00001,
    null,
    NaN,
    Infinity,
    -Infinity,
  ];
  view.matchups.target = changes.map((difference, i) => ({
    ...base,
    id: `p${i}`,
    name: `p${i}`,
    difference,
    winRate: 90 - i,
    matches: 100 + i,
    events: 2,
    players: 5,
  }));
  const combinations: CombinationRow[] = view.matchups.target.map((r) => ({
    key: r.id,
    members: [r.id],
    difference: r.difference,
    sufficient: true,
    sample: {
      wins: 1,
      losses: 1,
      outcomes: 2,
      winRate: r.winRate,
      matches: r.matches,
      events: r.events,
      players: r.players,
    },
    overall: {
      wins: 1,
      losses: 1,
      outcomes: 2,
      winRate: 50,
      matches: 200,
      events: 2,
      players: 5,
    },
  }));
  const q: MatchupRequest = {
    mode: 'discover',
    a: [],
    b: ['target'],
    candidateSize: 1,
    sort: 'difference',
    direction: 'best',
    offset: 0,
    limit: 50,
    source: 'all',
    sheet: 'all',
    minPlayers: 0,
    official: false,
  };
  for (const sort of ['difference', 'winRate', 'evidence'] as const)
    for (const direction of ['best', 'worst'] as const) {
      const expected = direction === 'best' ? ['p0', 'p2', 'p3'] : ['p1', 'p4'];
      assert.deepEqual(
        rankMatchups(
          view,
          'target',
          direction,
          { matches: 20, events: 2, players: 5 },
          sort,
        )
          .map((r) => r.id)
          .sort(),
        expected,
      );
      assert.deepEqual(
        rankCombinations(combinations, { ...q, sort, direction })
          .map((r) => r.key)
          .sort(),
        expected,
      );
      if (sort === 'evidence')
        assert.deepEqual(
          rankCombinations(combinations, { ...q, sort, direction }).map(
            (r) => r.key,
          ),
          [...expected].reverse(),
        );
    }
  assert.equal(
    rankCombinations(combinations, {
      ...q,
      b: [],
      sort: 'winRate',
      direction: 'worst',
    }).length,
    9,
  );
  combinations[0].sample.winRate = NaN;
  assert.equal(
    rankCombinations(combinations, q).some((r) => r.key === 'p0'),
    false,
  );
});
