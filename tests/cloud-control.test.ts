import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CloudControl,
  ControlConflict,
  type ControlState,
  type ControlStorage,
} from '../src/server/cloud/control';

class MemoryStorage implements ControlStorage {
  generation = 1;
  state: ControlState = {
    protocol: 1,
    epoch: 0,
    mutation: 'initial',
    checkpoints: [],
    nextDispatchAt: 0,
  };
  loseAcknowledgement = false;
  async read() {
    return {
      generation: String(this.generation),
      state: structuredClone(this.state),
    };
  }
  async compareAndSwap(generation: string, state: ControlState) {
    if (generation !== String(this.generation)) throw new ControlConflict();
    this.state = structuredClone(state);
    this.generation++;
    if (this.loseAcknowledgement) {
      this.loseAcknowledgement = false;
      throw new Error('Connection lost after commit');
    }
    return String(this.generation);
  }
}
const artifact = {
  key: 'objects/abc',
  generation: '9',
  sha256: 'a'.repeat(64),
  bytes: 50,
};

test('two independent writers cannot claim concurrently; expired owner cannot publish after takeover', async () => {
  const storage = new MemoryStorage();
  let now = 1000;
  const a = new CloudControl(storage, () => now);
  const b = new CloudControl(storage, () => now);
  const claims = await Promise.allSettled([
    a.claim('a', 1000),
    b.claim('b', 1000),
  ]);
  assert.equal(claims.filter((r) => r.status === 'fulfilled').length, 1);
  now = 2001;
  await b.claim('b', 1000);
  await assert.rejects(
    a.publish(artifact, artifact, 9000),
    /lease|fenced|conflict/i,
  );
  await b.publish(artifact, artifact, 9000);
  assert.deepEqual(storage.state.serving, artifact);
  assert.equal(storage.state.epoch, 2);
});

test('lost commit acknowledgement reconciles same mutation without overwriting a newer state', async () => {
  const storage = new MemoryStorage();
  const writer = new CloudControl(storage, () => 1000);
  storage.loseAcknowledgement = true;
  await writer.claim('a', 1000);
  storage.loseAcknowledgement = true;
  await writer.checkpoint(artifact);
  assert.equal(storage.generation, 3);
  assert.deepEqual(storage.state.checkpoints, [artifact]);
});

test('checkpoint survives process loss and takeover inherits it; publication is complete-or-old', async () => {
  const storage = new MemoryStorage();
  let now = 1000;
  const first = new CloudControl(storage, () => now);
  await first.claim('first', 1000);
  await first.checkpoint(artifact);
  now = 2001;
  const replacement = new CloudControl(storage, () => now);
  const recovered = await replacement.claim('replacement', 1000);
  assert.deepEqual(recovered.checkpoints, [artifact]);
  assert.equal(recovered.serving, undefined);
  await replacement.publish(artifact, artifact, 5000);
  assert.deepEqual(storage.state.base, artifact);
  assert.deepEqual(storage.state.checkpoints, []);
  assert.equal(storage.state.lease, undefined);
  assert.equal(storage.state.nextDispatchAt, 5000);
});

test('lease expiry fences checkpoint even without another claimant', async () => {
  const storage = new MemoryStorage();
  let now = 1000;
  const writer = new CloudControl(storage, () => now);
  await writer.claim('first', 1000);
  now = 2000;
  await assert.rejects(writer.checkpoint(artifact), /lease/i);
  assert.deepEqual(storage.state.checkpoints, []);
});

test('CAS conflict poisons owner rather than retrying against fresh generation', async () => {
  const storage = new MemoryStorage();
  const writer = new CloudControl(storage, () => 1000);
  await writer.claim('first', 1000);
  storage.generation++;
  storage.state.mutation = 'another-write';
  await assert.rejects(writer.checkpoint(artifact), /conflict|fenced/i);
  await assert.rejects(writer.checkpoint(artifact), /lease|fenced/i);
  assert.deepEqual(storage.state.checkpoints, []);
});
