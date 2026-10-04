import test from 'node:test';
import assert from 'node:assert/strict';
import { ServingCohortCache, selectDetail } from '../src/server/serving-cache';
import { publicDataset } from '../src/server/reader';
import { Store, publish } from '../src/server/store';
import { fixture } from './fixtures';

test('different details reuse one decoded cohort without losing data or crossing generations', () => {
  const store = new Store(':memory:');
  try {
    const d = publish(store, [fixture()], '2026-09-30T18:00:00Z', 'cache');
    const cache = new ServingCohortCache();
    let loads = 0;
    const load = () => {
      loads++;
      return publicDataset(d, 'all', 'all', 0, false, store.db);
    };
    for (const detail of ['table', 'incineroar', 'rillaboom', undefined])
      assert.deepEqual(
        selectDetail(cache.read('first', load)!, detail),
        publicDataset(d, 'all', 'all', 0, false, store.db, detail),
      );
    assert.equal(loads, 1);
    cache.read('replacement', load);
    assert.equal(loads, 2);
    assert.equal(
      cache.read('missing', () => null),
      null,
    );
    cache.read('missing', load);
    assert.equal(loads, 3);
  } finally {
    store.close();
  }
});
