import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './fixtures';
import { Store, publish } from '../src/server/store';
import { aggregate } from '../src/domain/analytics';
import { regulations } from '../src/domain/regulations';
// An explicitly fake verified source contract exercises transition mechanics offline.
// Runtime configuration contains no M-D contract or enabled M-D data source.
const config = {
  ...regulations,
  cohorts: {
    ...regulations.cohorts,
    'M-D': {
      enabled: true,
      environment: 'champions-cartridge',
      season: '2027',
      evidence: 'Test-only audited fixture contract',
    },
  },
};
const asOf = '2026-09-30T18:00:00Z';
test('overlapping regulations never share usage, builds, baselines or matches', () => {
  const outgoing = fixture(),
    incoming = { ...fixture(), id: 'incoming', regulation: 'M-D' };
  incoming.registrations = incoming.registrations.map((r) => ({
    ...r,
    slots: null,
  }));
  const options = { asOf, days: 30, sheet: 'all' as const, minPlayers: 0 };
  const mc = aggregate([outgoing, incoming], { ...options, regulation: 'M-C' });
  const md = aggregate([outgoing, incoming], { ...options, regulation: 'M-D' });
  assert.equal(mc.coverage.registrations, 3);
  assert.equal(mc.coverage.matches, 3);
  assert.equal(md.coverage.registrations, 0);
  assert.deepEqual(md.builds, {});
  assert.deepEqual(md.matchups, {});
});
test('incoming collection stages independently; deliberate activation freezes outgoing publication atomically', () => {
  const store = new Store(':memory:', false, config);
  const outgoing = publish(store, [fixture()], asOf, 'outgoing');
  const incoming = { ...fixture(), id: 'incoming', regulation: 'M-D' };
  assert.throws(
    () =>
      publish(store, [incoming], asOf, 'implicit', undefined, {
        regulation: 'M-D',
      }),
    /staging/,
  );
  const staged = publish(store, [incoming], asOf, 'staged', undefined, {
    regulation: 'M-D',
    stage: true,
  });
  assert.equal(store.current()?.id, outgoing.id);
  assert.equal(store.archives().length, 0);
  assert.throws(() => store.activate('M-D', 'wrong-id'));
  store.activate('M-D', staged.id);
  assert.equal(store.current()?.id, staged.id);
  assert.equal(store.activeRegulation(), 'M-D');
  assert.equal(store.archives()[0].id, outgoing.id);
  assert.equal(store.archives()[0].views['all:0'].coverage.matches, 3);
  publish(store, [incoming], '2026-10-01T18:00:00Z', 'refresh');
  assert.equal(store.archives()[0].id, outgoing.id);
  assert.throws(
    () =>
      publish(store, [fixture()], asOf, 'historical correction', undefined, {
        regulation: 'M-C',
        stage: true,
      }),
    /archived/,
  );
  store.close();
});
test('failed, empty and transaction-rejected transitions preserve the outgoing pointer and archive', () => {
  const store = new Store(':memory:', false, config);
  const outgoing = publish(store, [fixture()], asOf, 'outgoing');
  const collection = {
    asOf,
    discovery: 'complete' as const,
    apiPages: 0,
    completedPages: 0,
    listed: 0,
    completed: 0,
    refreshed: 0,
    cached: 0,
    excluded: [],
    carriedForward: [],
    snapshots: [],
  };
  assert.throws(
    () =>
      publish(store, [], asOf, 'empty', collection, {
        regulation: 'M-D',
        stage: true,
      }),
    /No resolved/,
  );
  const staged = publish(
    store,
    [{ ...fixture(), id: 'incoming', regulation: 'M-D' }],
    asOf,
    'stage',
    undefined,
    { regulation: 'M-D', stage: true },
  );
  store.db.exec(
    "CREATE TRIGGER reject_activation BEFORE INSERT ON pointers WHEN NEW.name='active' BEGIN SELECT RAISE(ABORT, 'injected activation failure'); END",
  );
  assert.throws(() => store.activate('M-D', staged.id), /injected/);
  assert.equal(store.current()?.id, outgoing.id);
  assert.equal(store.archives().length, 0);
  assert.equal(store.state('retired:M-C'), null);
  assert.equal(
    store.db
      .prepare('SELECT regulation FROM versions WHERE id=?')
      .get(staged.id)?.regulation,
    'M-D',
  );
  store.close();
});
