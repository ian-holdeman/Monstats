import test from 'node:test';
import assert from 'node:assert/strict';
import { dispatchDue } from '../src/server/cloud/dispatch';
import {
  ControlConflict,
  type ControlState,
} from '../src/server/cloud/control';

test('duplicate dispatch is fenced; failed launch is bounded and active writer suppresses launch', async () => {
  let generation = 1;
  let state: ControlState = {
    protocol: 1,
    epoch: 0,
    mutation: 'initial',
    checkpoints: [],
    nextDispatchAt: 0,
  };
  const storage = {
    async read() {
      return { generation: String(generation), state: structuredClone(state) };
    },
    async compareAndSwap(expected: string, next: ControlState) {
      if (expected !== String(generation)) throw new ControlConflict();
      state = structuredClone(next);
      return String(++generation);
    },
  };
  let launches = 0;
  const launch = async () => {
    launches++;
  };
  await Promise.allSettled([
    dispatchDue(storage, launch, 1000),
    dispatchDue(storage, launch, 1000),
  ]);
  assert.equal(launches, 1);
  assert.equal(await dispatchDue(storage, launch, 120999), false);
  await assert.rejects(
    dispatchDue(
      storage,
      async () => {
        throw new Error('launch unavailable');
      },
      121000,
    ),
  );
  assert.equal(await dispatchDue(storage, launch, 240999), false);
  state.lease = { owner: 'writer', expiresAt: 400000 };
  assert.equal(await dispatchDue(storage, launch, 300000), false);
  assert.equal(await dispatchDue(storage, launch, 400000), true);
  assert.equal(launches, 2);
});
