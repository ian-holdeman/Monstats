import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Store, publish } from '../src/server/store';
import { fixture } from './fixtures';
import { refresh } from '../src/server/refresh';
test('provider failure after day 30 retains regulation facts, usage, and physical results', async () => {
  const store = new Store(':memory:');
  const d = publish(store, [fixture()], '2026-09-30T18:00:00Z', 'saved');
  await assert.rejects(() =>
    refresh(
      store,
      '2026-10-31T18:00:00Z',
      {},
      (async () => new Response('', { status: 403 })) as typeof fetch,
    ),
  );
  assert.equal(
    store.current()?.views['all:0'].coverage.matches,
    d.views['all:0'].coverage.matches,
  );
  assert.equal(store.current()?.id, d.id);
  store.close();
});
