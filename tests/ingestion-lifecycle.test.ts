import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  coverageInterval,
  eventInInterval,
  regulations,
} from '../src/domain/regulations';
import { Store, publish } from '../src/server/store';
import { fixture } from './fixtures';
import { lifecycle, runScheduled } from '../src/server/operations';

const config = {
  default: 'M-C',
  cohorts: {
    'M-C': {
      ...regulations.cohorts['M-C'],
      startsAt: '2026-08-01T00:00:00.000Z',
      endsAt: '2026-10-01T00:00:00.000Z',
      reviewed: true,
    },
    'M-D': {
      ...regulations.cohorts['M-C'],
      startsAt: '2026-10-01T00:00:00.000Z',
      endsAt: '2027-01-01T00:00:00.000Z',
      reviewed: true,
    },
  },
};
test('full regulation retains old facts and rejects boundary-crossing or incompatible events', () => {
  const interval = coverageInterval('M-C', '2026-10-01T00:00:00Z', config);
  const old = { ...fixture(), date: '2026-08-01T00:00:00.000Z' };
  assert.equal(eventInInterval(old, interval), true);
  assert.equal(
    eventInInterval({ ...old, date: interval.end }, interval),
    false,
  );
  assert.equal(
    eventInInterval({ ...old, endsAt: '2026-10-01T01:00:00Z' }, interval),
    false,
  );
  assert.equal(eventInInterval({ ...old, regulation: 'M-D' }, interval), false);
  const store = new Store(':memory:', false, config);
  const d = publish(store, [old], '2026-09-30T00:00:00Z', 'full');
  assert.equal(d.views['all:0'].coverage.events, 1);
  assert.equal(d.views['all:0'].options.interval?.start, interval.start);
  store.close();
});
test('transition exposes an empty incoming cohort and archives immediately; one final opportunity survives duplicate dispatch', async () => {
  const store = new Store(':memory:', false, config);
  const previous = publish(
    store,
    [fixture()],
    '2026-09-30T00:00:00Z',
    'outgoing',
  );
  lifecycle(store, Date.parse('2026-10-01T00:00:00Z'));
  assert.equal(store.current()?.regulation, 'M-D');
  assert.equal(store.current()?.views['all:0'].coverage.events, 0);
  assert.equal(store.archives()[0].id, previous.id);
  let polls = 0;
  const collect = async (
    _store: Store,
    _asOf: string,
    options: { regulation?: string },
  ) => {
    if (options.regulation === 'M-C') polls++;
    return previous;
  };
  await runScheduled(store, {
    now: Date.parse('2026-10-07T23:59:59Z'),
    execute: collect,
  });
  assert.equal(polls, 0);
  await runScheduled(store, {
    now: Date.parse('2026-10-08T00:00:00Z'),
    execute: collect,
  });
  await runScheduled(store, {
    now: Date.parse('2026-10-08T00:01:00Z'),
    execute: collect,
  });
  await runScheduled(store, {
    now: Date.parse('2026-10-09T00:00:00Z'),
    execute: collect,
  });
  assert.equal(polls, 1);
  store.close();
});
test('missed and failed final opportunities stop forever and preserve last archive', async () => {
  for (const fail of [true, false]) {
    const store = new Store(':memory:', false, config);
    const d = publish(store, [fixture()], '2026-09-30T00:00:00Z', 'saved');
    lifecycle(store, Date.parse('2026-10-01T00:00:00Z'));
    let polls = 0;
    const execute = async () => {
      polls++;
      throw new Error('provider outage');
    };
    await runScheduled(store, {
      now: Date.parse(fail ? '2026-10-08T00:00:00Z' : '2026-10-09T00:00:00Z'),
      execute,
    });
    await runScheduled(store, {
      now: Date.parse('2026-10-10T00:00:00Z'),
      execute,
    });
    assert.equal(store.archives()[0].id, d.id);
    assert.equal(
      store.state<{ state: string }>('final:M-C')?.state,
      fail ? 'failed' : 'missed',
    );
    assert.equal(polls, fail ? 3 : 2); // Active M-D checks are independent; no additional outgoing check.
    store.close();
  }
});
