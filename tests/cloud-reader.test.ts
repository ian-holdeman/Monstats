import test from 'node:test';
import assert from 'node:assert/strict';
import { PinnedReader } from '../src/server/cloud/pinned-reader';

test('publication refresh never removes a path while a query worker still owns it', async () => {
  let version = 'a';
  let now = 0;
  const removed: string[] = [];
  const reader = new PinnedReader(
    async () => version,
    async (id) => `/immutable/${id}`,
    async (path) => {
      removed.push(path);
    },
    () => now,
    10,
  );
  const first = await reader.acquire();
  version = 'b';
  now = 11;
  const second = await reader.acquire();
  assert.equal(first.path, '/immutable/a');
  assert.equal(second.path, '/immutable/b');
  assert.deepEqual(removed, []);
  await first.release();
  assert.deepEqual(removed, ['/immutable/a']);
  await second.release();
  assert.deepEqual(removed, ['/immutable/a']);
});

test('failed refresh preserves verified prior state; cold failure stays unavailable and retries', async () => {
  let fail = true,
    now = 0,
    version = 'a',
    loads = 0;
  const reader = new PinnedReader(
    async () => version,
    async () => {
      loads++;
      if (fail) throw new Error('corrupt');
      return '/immutable/a';
    },
    async () => {},
    () => now,
    10,
  );
  await assert.rejects(reader.acquire(), /unavailable/i);
  fail = false;
  const first = await reader.acquire();
  await first.release();
  fail = true;
  version = 'b';
  now = 11;
  const warm = await reader.acquire();
  assert.equal(warm.path, '/immutable/a');
  assert.equal(loads, 3);
  await warm.release();
});

test('concurrent cold requests share one materialization and release is idempotent', async () => {
  let loads = 0;
  const reader = new PinnedReader(
    async () => 'a',
    async () => {
      loads++;
      return '/immutable/a';
    },
    async () => {},
  );
  const pins = await Promise.all([
    reader.acquire(),
    reader.acquire(),
    reader.acquire(),
  ]);
  assert.equal(loads, 1);
  for (const pin of pins) {
    await pin.release();
    await pin.release();
  }
});
