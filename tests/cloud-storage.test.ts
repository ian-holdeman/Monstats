import test from 'node:test';
import assert from 'node:assert/strict';
import type { Bucket } from '@google-cloud/storage';
import { GcsControlStorage } from '../src/server/cloud/storage';

test('object rate-limit retry preserves the exact generation precondition', async () => {
  let attempts = 0;
  let state = {
    protocol: 1,
    epoch: 0,
    mutation: 'initial',
    checkpoints: [],
    nextDispatchAt: 0,
  };
  const expected: string[] = [];
  const file = {
    async save(
      body: string,
      options: { preconditionOpts: { ifGenerationMatch: string } },
    ) {
      expected.push(options.preconditionOpts.ifGenerationMatch);
      if (++attempts === 1)
        throw Object.assign(new Error('Object write rate'), { code: 429 });
      state = JSON.parse(body);
    },
    async getMetadata() {
      return [{ generation: '2', size: 100 }];
    },
    async download() {
      return [Buffer.from(JSON.stringify(state))];
    },
  };
  const bucket = { file: () => file } as unknown as Bucket;
  const storage = new GcsControlStorage(bucket);
  assert.equal(
    await storage.compareAndSwap('1', {
      ...state,
      protocol: 1,
      mutation: 'next',
    }),
    '2',
  );
  assert.deepEqual(expected, ['1', '1']);
});

test('a conflicting owner after throttling is fenced rather than retried with a fresh generation', async () => {
  let attempts = 0;
  const expected: string[] = [];
  const bucket = {
    file: () => ({
      async save(
        _body: string,
        options: { preconditionOpts: { ifGenerationMatch: string } },
      ) {
        expected.push(options.preconditionOpts.ifGenerationMatch);
        throw Object.assign(new Error('remote'), {
          code: ++attempts === 1 ? 429 : 412,
        });
      },
    }),
  } as unknown as Bucket;
  await assert.rejects(
    new GcsControlStorage(bucket).compareAndSwap('1', {
      protocol: 1,
      epoch: 0,
      mutation: 'next',
      checkpoints: [],
      nextDispatchAt: 0,
    }),
    /fenced/,
  );
  assert.deepEqual(expected, ['1', '1']);
});
