import test from 'node:test';
import assert from 'node:assert/strict';
import { Store } from '../src/server/store';
import { collect } from '../src/server/collector';
import { LadderClient } from '../src/server/ladder-refresh';

test('a failed durable claim/checkpoint prevents tournament provider access', async () => {
  const store = new Store(':memory:');
  let requests = 0;
  store.checkpoint = async () => {
    throw new Error('Cloud lease fenced');
  };
  try {
    await collect(store, '2026-09-30T18:00:00Z', {}, (async () => {
      requests++;
      return new Response('', { status: 403 });
    }) as typeof fetch).catch(() => {});
    assert.equal(requests, 0);
  } finally {
    store.close();
  }
});

test('Ladder rate-limit cooldown is checkpointed before surfacing the failure', async () => {
  const store = new Store(':memory:');
  const captured: unknown[] = [];
  store.checkpoint = async () => {
    captured.push(store.state('ladder-cooldown:www.smogon.com'));
  };
  const client = new LadderClient(
    store,
    undefined,
    (async () =>
      new Response('', {
        status: 429,
        headers: { 'retry-after': '60' },
      })) as typeof fetch,
  );
  try {
    await assert.rejects(client.read('https://www.smogon.com/stats/'), /429/);
    assert.equal(captured.length, 2);
    assert.equal(captured[1], store.state('ladder-cooldown:www.smogon.com'));
    assert.ok(Number(captured[1]) > Date.now());
  } finally {
    store.close();
  }
});
