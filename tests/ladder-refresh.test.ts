import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  collectChampions,
  refreshLadder,
  nextLadderRefresh,
} from '../src/server/ladder-refresh';
import { parseShowdown } from '../src/domain/ladder';
import { LadderStore } from '../src/server/ladder-store';
import { Store } from '../src/server/store';
import {
  championsResponse,
  showdownChaos,
  showdownUsage,
} from './ladder-fixtures';
const snapshot = {
  url: 'https://example.test/ladder',
  checksum: 'a'.repeat(64),
  retrievedAt: '2026-10-01T19:00:00.000Z',
};
test('a later source failure retains the whole previously published Showdown batch and scopes its status', async () => {
  const store = new Store(':memory:'),
    ladder = new LadderStore(store);
  const first = ladder.publish(
    parseShowdown(showdownUsage, showdownChaos(), {
      month: '2026-09',
      formatId: 'gen9championsvgc2026regmc',
      rating: 1630,
      snapshots: [snapshot],
    }),
  );
  await assert.rejects(
    () =>
      refreshLadder(store, 'showdown', {
        months: ['2026-09'],
        read: async (url) => {
          if (url.endsWith('/stats/'))
            return { body: '<a href="2026-09/">September</a>', snapshot };
          if (url.endsWith('/2026-09/'))
            return {
              body: '<a href="gen9championsvgc2026regmc-1630.txt">x</a><a href="gen9championsvgc2026regmcbo3-1630.txt">x</a>',
              snapshot,
            };
          if (url.includes('bo3')) throw new Error('injected source failure');
          return {
            body: url.endsWith('.json')
              ? JSON.stringify(showdownChaos())
              : showdownUsage,
            snapshot,
          };
        },
      }),
    /injected source failure/,
  );
  assert.equal(ladder.catalog().length, 1);
  assert.equal(ladder.catalog()[0].id, first.id);
  assert.equal(ladder.status('showdown')?.state, 'failure');
  assert.equal(ladder.status('champions'), null);
  store.close();
});
test('Champions capture changes invalidate cached detail and an end-of-sweep ranking change prevents publication', async () => {
  const initial = championsResponse();
  const second = {
    ...initial,
    selected_pokemon: 'Incineroar',
    current_pokemon: ['Incineroar', '', '2', []],
  };
  let reread = false;
  const read = async (url: string, cache?: boolean) => {
    if (url.includes('822.html'))
      return {
        body: 'Ranked Battles Season M-6 will follow Regulation Set M-C September 9, 2026, at 02:00 UTC to Wednesday, October 7, 2026, at 01:59 UTC',
        snapshot,
      };
    if (url.endsWith('/Incineroar')) {
      if (cache)
        return {
          body: JSON.stringify({
            ...second,
            champions_updated: 'September 29, 2026 at 12:00 UTC',
          }),
          snapshot,
        };
      reread = true;
      return { body: JSON.stringify(second), snapshot };
    }
    return { body: JSON.stringify(initial), snapshot };
  };
  assert.equal((await collectChampions(read)).detailCoverage, 2);
  assert.equal(reread, true);
  let roots = 0;
  await assert.rejects(
    () =>
      collectChampions(async (url, cache) => {
        if (url.endsWith('/Rillaboom') && ++roots === 2)
          return {
            body: JSON.stringify({
              ...initial,
              pokemon_names: initial.pokemon_names.slice(0, 1),
            }),
            snapshot,
          };
        return read(url, cache);
      }),
    /capture changed/,
  );
});
test('ladder scheduling catches up once, checks daily, and retries failures after five minutes', () => {
  const store = new Store(':memory:'),
    ladder = new LadderStore(store),
    now = Date.parse(snapshot.retrievedAt);
  assert.equal(nextLadderRefresh(store, 'champions', now), now);
  store.saveState('ladder-status:champions', {
    state: 'success',
    attemptedAt: snapshot.retrievedAt,
    message: 'test',
  });
  assert.equal(nextLadderRefresh(store, 'champions', now), now + 24 * 3600000);
  ladder.failure('champions', snapshot.retrievedAt, 'test');
  assert.equal(nextLadderRefresh(store, 'champions', now), now + 5 * 60000);
  store.close();
});
