import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store, publish } from '../src/server/store';
import { fixture } from './fixtures';
import { publicDataset } from '../src/server/reader';
import { createServingArtifact } from '../src/server/cloud/serving-artifact';

test('serving export excludes operational bodies but retains every immutable publication and cohort', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'monstats-export-'));
  const original = new Store(join(dir, 'source.sqlite'));
  try {
    original.snapshot(
      'https://example.test/private',
      'RAW-SNAPSHOT-BODY',
      '2026-09-30T00:00:00Z',
    );
    original.saveState('final:M-C', { state: 'complete' });
    original.saveState('ladder-status:showdown', {
      state: 'success',
      attemptedAt: '2026-09-30T00:00:00Z',
    });
    const first = publish(
      original,
      [fixture()],
      '2026-09-29T18:00:00Z',
      'first',
    );
    const second = publish(
      original,
      [fixture()],
      '2026-09-30T18:00:00Z',
      'second',
    );
    await createServingArtifact(original, join(dir, 'serving.sqlite'));
    const served = new Store(join(dir, 'serving.sqlite'), true);
    try {
      assert.equal(served.snapshotCount(), 0);
      assert.equal(served.state('final:M-C'), null);
      assert.deepEqual(
        served.state('ladder-status:showdown'),
        original.state('ladder-status:showdown'),
      );
      for (const id of [first.id, second.id]) {
        assert.deepEqual(served.version(id), original.version(id));
        for (const source of ['all', 'none', 'limitless'])
          for (const sheet of ['all', 'open', 'closed'])
            for (const min of [0, 100])
              assert.deepEqual(
                publicDataset(
                  served.version(id)!,
                  source,
                  sheet,
                  min,
                  false,
                  served.db,
                ),
                publicDataset(
                  original.version(id)!,
                  source,
                  sheet,
                  min,
                  false,
                  original.db,
                ),
              );
      }
    } finally {
      served.close();
    }
    assert.equal(original.snapshotCount(), 1);
    assert.deepEqual(original.state('final:M-C'), { state: 'complete' });
    await assert.rejects(
      createServingArtifact(original, join(dir, 'serving.sqlite')),
      /exist/i,
    );
  } finally {
    original.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
