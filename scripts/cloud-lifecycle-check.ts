import assert from 'node:assert/strict';
import { backup } from 'node:sqlite';
import { mkdtemp, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Store, publish } from '../src/server/store';
import { regulations } from '../src/domain/regulations';
import { lifecycle, runScheduled, type Run } from '../src/server/operations';
import { CloudControl } from '../src/server/cloud/control';
import {
  CheckpointJournal,
  replayCheckpoint,
} from '../src/server/cloud/journal';
import {
  cloudStorage,
  GcsControlStorage,
  uploadFile,
  uploadBytes,
  downloadFile,
} from '../src/server/cloud/storage';
import { createServingArtifact } from '../src/server/cloud/serving-artifact';

// Two separate, provider-free job executions prove ephemeral-process recovery.
// Only a unique checks/ control is accepted; production control is unreachable.
const key = process.env.MONSTATS_CHECK_KEY;
const name = process.env.MONSTATS_CONTROL_BUCKET;
const phase = process.argv[2];
if (
  !key?.match(/^checks\/[a-z0-9-]+\/control.json$/) ||
  !name ||
  !['claim', 'recover'].includes(phase)
)
  throw new Error('Isolated lifecycle verification configuration required');
const bucket = cloudStorage().bucket(name);
const directory = await mkdtemp(join(tmpdir(), 'lifecycle-'));
const config = {
  default: 'M-C',
  cohorts: {
    'M-C': {
      ...regulations.cohorts['M-C'],
      startsAt: '2026-08-01T00:00:00.000Z',
      endsAt: '2026-10-01T00:00:00.000Z',
      reviewed: true,
    },
  },
};
const finalAt = Date.parse('2026-10-08T00:00:00.000Z');
const controlStorage = new GcsControlStorage(bucket, key);
if (phase === 'claim') {
  const store = new Store(join(directory, 'fixture.sqlite'), false, config);
  publish(
    store,
    [],
    '2026-09-30T00:00:00.000Z',
    'Isolated fixture',
    undefined,
    { allowEmpty: true },
  );
  lifecycle(store, Date.parse('2026-10-01T00:00:00.000Z'));
  const basePath = join(directory, 'base.sqlite');
  await backup(store.db, basePath);
  const base = await uploadFile(bucket, basePath);
  await bucket.file(key).save(
    JSON.stringify({
      protocol: 1,
      epoch: 0,
      mutation: 'fixture',
      checkpoints: [],
      base,
      serving: base,
      nextDispatchAt: 0,
    }),
    { resumable: false, preconditionOpts: { ifGenerationMatch: 0 } },
  );
  const owner = new CloudControl(controlStorage, () => 1000);
  await owner.claim('interrupted-fixture', 1000);
  const journal = new CheckpointJournal(store.db);
  store.checkpoint = () =>
    journal.checkpoint(async (bytes) => {
      await owner.checkpoint(await uploadBytes(bucket, bytes));
    });
  await runScheduled(store, {
    now: finalAt,
    execute: async () => {
      assert.equal((await controlStorage.read()).state.checkpoints.length, 1);
      console.log(
        JSON.stringify({
          state: 'checkpointed-before-hard-exit',
          isolatedControl: key,
        }),
      );
      process.exit(17);
    },
  });
  throw new Error('Expected hard exit');
}
const owner = new CloudControl(controlStorage, () => 3000);
const claimed = await owner.claim('recovered-fixture', 1000);
assert.equal(claimed.epoch, 2);
const path = join(directory, 'restored.sqlite');
await downloadFile(bucket, claimed.base!, path);
const store = new Store(path, false, config);
for (let i = 0; i < claimed.checkpoints.length; i++) {
  const delta = join(directory, `delta-${i}`);
  await downloadFile(bucket, claimed.checkpoints[i], delta);
  replayCheckpoint(store.db, await readFile(delta));
}
const interrupted = store.state<Run>('final:M-C')!;
assert.equal(interrupted.state, 'running');
assert.equal(interrupted.deadline, finalAt + 45 * 60000);
store.db.exec('DELETE FROM leases');
const journal = new CheckpointJournal(store.db);
store.checkpoint = () =>
  journal.checkpoint(async (bytes) => {
    await owner.checkpoint(await uploadBytes(bucket, bytes));
  });
let polls = 0;
await runScheduled(store, {
  now: finalAt + 60000,
  execute: async () => {
    polls++;
    return store.archives()[0];
  },
});
assert.equal(polls, 1);
assert.equal(store.state<Run>('final:M-C')?.deadline, interrupted.deadline);
assert.equal(store.state<Run>('final:M-C')?.state, 'complete');
const basePath = join(directory, 'committed.sqlite');
await backup(store.db, basePath);
const servingPath = join(directory, 'serving.sqlite');
await createServingArtifact(store, servingPath);
await owner.publish(
  await uploadFile(bucket, basePath),
  await uploadFile(bucket, servingPath),
  Number.MAX_SAFE_INTEGER,
);
const durable = await controlStorage.read();
assert.deepEqual(durable.state.checkpoints, []);
const verifyPath = join(directory, 'verify.sqlite');
await downloadFile(bucket, durable.state.base!, verifyPath);
const restored = new Store(verifyPath, false, config);
for (const now of [finalAt + 120000, finalAt + 86400000])
  await runScheduled(restored, {
    now,
    execute: async () => {
      throw new Error('Completed final must never poll again');
    },
  });
assert.equal(restored.state<Run>('final:M-C')?.state, 'complete');
assert.equal(restored.state<Run>('final:M-C')?.id, interrupted.id);
restored.close();
journal.close();
store.close();
console.log(
  JSON.stringify({
    state: 'passed',
    hardProcessRecovery: true,
    originalDeadlinePreserved: true,
    duplicateFinalizationPrevented: true,
    isolatedControl: key,
  }),
);
