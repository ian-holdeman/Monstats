import test from 'node:test';
import assert from 'node:assert/strict';
import type { Bucket } from '@google-cloud/storage';
import { removeOldArtifacts } from '../src/server/cloud/retention';

test('retention preserves pinned history, new and unknown-age artifacts and conditionally deletes only old redundant generations', async () => {
  const deleted: unknown[] = [];
  const files = [
    ['objects/pinned', '2020-01-01'],
    ['objects/redundant', '2020-01-01'],
    ['objects/new', '2026-10-02'],
    ['objects/unknown', 'invalid'],
  ].map(([name, timeCreated], index) => ({
    name,
    metadata: { timeCreated, generation: String(index + 10) },
    async delete(options: unknown) {
      deleted.push({ name, options });
    },
  }));
  const bucket = {
    async getFiles(options: unknown) {
      assert.deepEqual(options, { prefix: 'objects/' });
      return [files];
    },
  } as unknown as Bucket;
  await removeOldArtifacts(
    bucket,
    new Set(['objects/pinned']),
    Date.parse('2026-10-01'),
  );
  assert.deepEqual(deleted, [
    {
      name: 'objects/redundant',
      options: { ifGenerationMatch: '11', ignoreNotFound: true },
    },
  ]);
});
