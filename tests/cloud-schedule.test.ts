import test from 'node:test';
import assert from 'node:assert/strict';
import { Store, publish } from '../src/server/store';
import { fixture } from './fixtures';
import { lifecycle, dailySlot } from '../src/server/operations';
import { nextTournamentWork } from '../src/server/cloud/schedule';

test('cloud due-work covers regulation end and exact final window independently of daily UTC slot', () => {
  const store = new Store(':memory:');
  try {
    publish(store, [fixture()], '2026-09-30T18:00:00Z', 'schedule');
    const now = Date.parse('2026-12-01T22:00:00Z');
    const id = `daily:M-C:${new Date(dailySlot(now)).toISOString()}`;
    store.saveState(`run:${id}`, { state: 'complete' });
    assert.equal(
      nextTournamentWork(store, now),
      Date.parse('2026-12-02T02:00:00Z'),
    );
    lifecycle(store, Date.parse('2026-12-02T02:00:00Z'));
    assert.equal(
      nextTournamentWork(store, Date.parse('2026-12-08T12:00:00Z')),
      Date.parse('2026-12-09T02:00:00Z'),
    );
    assert.equal(
      nextTournamentWork(store, Date.parse('2026-12-09T03:01:00Z')),
      Date.parse('2026-12-09T03:01:00Z'),
    );
    store.saveState('final:M-C', { state: 'missed' });
    assert.equal(
      nextTournamentWork(store, Date.parse('2026-12-10T12:00:00Z')),
      Number.MAX_SAFE_INTEGER,
    );
  } finally {
    store.close();
  }
});

test('cloud dispatch respects persisted retry and maximum daily attempts', () => {
  const store = new Store(':memory:');
  try {
    publish(store, [fixture()], '2026-09-30T18:00:00Z', 'schedule');
    const now = Date.parse('2026-10-02T12:00:00Z'),
      slot = dailySlot(now);
    const key = `run:daily:M-C:${new Date(slot).toISOString()}`;
    store.saveState(key, {
      state: 'failed',
      attempts: 2,
      retryAt: now + 300000,
    });
    assert.equal(nextTournamentWork(store, now), now + 300000);
    store.saveState(key, {
      state: 'failed',
      attempts: 3,
      retryAt: now + 300000,
    });
    assert.equal(nextTournamentWork(store, now), slot + 86400000);
  } finally {
    store.close();
  }
});
