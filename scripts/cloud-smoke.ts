import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CloudControl, type ControlStorage } from '../src/server/cloud/control';
import {
  cloudStorage,
  GcsControlStorage,
  uploadBytes,
  downloadFile,
} from '../src/server/cloud/storage';

// Authenticated deployment verification only. Never addresses control.json,
// owner SQLite, providers, or production lifecycle deadlines.
const name = process.env.MONSTATS_CONTROL_BUCKET;
if (!name) throw new Error('Verification bucket required');
const bucket = cloudStorage().bucket(name);
const key = `checks/${randomUUID()}/control.json`;
await bucket.file(key).save(
  JSON.stringify({
    protocol: 1,
    epoch: 0,
    mutation: 'initial',
    checkpoints: [],
    nextDispatchAt: 0,
  }),
  { preconditionOpts: { ifGenerationMatch: 0 }, resumable: false },
);
const actual = new GcsControlStorage(bucket, key);
let now = 1000;
const first = new CloudControl(actual, () => now),
  second = new CloudControl(actual, () => now);
const claims = await Promise.allSettled([
  first.claim('first', 1000),
  second.claim('second', 1000),
]);
assert.equal(claims.filter((r) => r.status === 'fulfilled').length, 1);
const artifact = await uploadBytes(
  bucket,
  Buffer.from('isolated-cloud-protocol-fixture'),
);
const winner = claims[0].status === 'fulfilled' ? first : second;
await winner.checkpoint(artifact);
now = 2001;
const successor = new CloudControl(actual, () => now);
const state = await successor.claim('successor', 1000);
assert.deepEqual(state.checkpoints, [artifact]);
await assert.rejects(winner.checkpoint(artifact));
await successor.publish(artifact, artifact, 5000);
const committed = await actual.read();
assert.deepEqual(committed.state.base, artifact);
assert.deepEqual(committed.state.serving, artifact);
assert.deepEqual(committed.state.checkpoints, []);
const directory = await mkdtemp(join(tmpdir(), 'monstats-cloud-check-'));
try {
  await downloadFile(bucket, artifact, join(directory, 'verified'));
  assert.equal(
    (await readFile(join(directory, 'verified'))).toString(),
    'isolated-cloud-protocol-fixture',
  );
  await assert.rejects(
    downloadFile(
      bucket,
      { ...artifact, sha256: '0'.repeat(64) },
      join(directory, 'bad'),
    ),
    /checksum/,
  );
} finally {
  await rm(directory, { recursive: true, force: true });
}
const lostReply: ControlStorage = {
  read: () => actual.read(),
  compareAndSwap: async (generation, next) => {
    await actual.compareAndSwap(generation, next);
    throw new Error('Injected acknowledgement loss');
  },
};
const reconciled = new CloudControl(lostReply, () => now);
await reconciled.claim('lost-reply', 1000);
assert.equal((await actual.read()).state.lease?.owner, 'lost-reply');
console.log(
  JSON.stringify({ state: 'passed', checks: 7, isolatedControl: key }),
);
