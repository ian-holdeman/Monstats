import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Store, publish } from '../src/server/store';
import { fixture } from './fixtures';
test('idempotent snapshots, corrected events and atomic failure retention', () => {
  const store = new Store(':memory:');
  store.snapshot('url', '{"a":1}', '2026-09-30T18:00:00Z');
  store.snapshot('url', '{"a":1}', '2026-09-30T18:01:00Z');
  assert.equal(store.snapshotCount(), 1);
  const first = publish(store, [fixture()], '2026-09-30T18:00:00Z', 'test');
  assert.equal(store.current()?.id, first.id);
  assert.throws(() => publish(store, [fixture()], 'not-a-date', 'test'));
  assert.equal(store.current()?.id, first.id);
  store.refreshFailure('2026-09-30T18:02:00Z', 'upstream unavailable');
  assert.equal(store.status()?.state, 'failure');
  assert.equal(store.current()?.id, first.id);
  const corrected = fixture();
  corrected.matches[0].winner = 'b';
  const next = publish(store, [corrected], '2026-09-30T18:03:00Z', 'test');
  assert.notEqual(next.id, first.id);
  assert.equal(store.status()?.state, 'success');
  assert.equal(store.current()?.events.length, 1);
  store.close();
});
test('retiring a regulation preserves its frozen published coverage and removes the active pointer', () => {
  const store = new Store(':memory:');
  const d = publish(store, [fixture()], '2026-09-30T18:00:00Z', 'test');
  store.archiveCurrent('M-C');
  assert.equal(store.current(), null);
  assert.equal(store.archives()[0].id, d.id);
  assert.equal(store.archives()[0].views['open:0'].coverage.registrations, 3);
  store.close();
});
test('a failure during pointer replacement rolls back the entire publication transaction', () => {
  const store = new Store(':memory:');
  const first = publish(store, [fixture()], '2026-09-30T18:00:00Z', 'test');
  store.db.exec(
    "CREATE TRIGGER reject_pointer BEFORE INSERT ON pointers BEGIN SELECT RAISE(ABORT, 'injected pointer failure'); END",
  );
  assert.throws(
    () => publish(store, [fixture()], '2026-09-30T19:00:00Z', 'test'),
    /injected pointer failure/,
  );
  assert.equal(store.current()?.id, first.id);
  assert.equal(store.db.prepare('SELECT count(*) n FROM versions').get()?.n, 1);
  assert.equal(store.status()?.state, 'success');
  store.close();
});

test('All publishes unknown sheet data and excludes events below the shared entrant floor', () => {
  const store = new Store(':memory:');
  const open = { ...fixture(), players: 20 };
  const unknown = {
    ...fixture(),
    id: 'unknown',
    players: 100,
    sheet: {
      visibility: 'unknown' as const,
      basis: 'unknown' as const,
      evidence: '',
    },
  };
  const small = { ...fixture(), id: 'small', players: 19 };
  const d = publish(
    store,
    [open, unknown, small],
    '2026-09-30T18:00:00Z',
    'test',
  );
  assert.equal(d.views['all:0']?.coverage.events, 2);
  assert.equal(d.views['all:100']?.coverage.events, 1);
  assert.equal(d.views['open:0'].coverage.events, 1);
  store.close();
});

test('durable versions compress cohort data and remain compatible with prior JSON publications', () => {
  const store = new Store(':memory:');
  const d = publish(store, [fixture()], '2026-09-30T18:00:00Z', 'test');
  const row = store.db
    .prepare('SELECT payload FROM versions WHERE id=?')
    .get(d.id)!;
  assert.ok(row.payload instanceof Uint8Array);
  assert.deepEqual(store.current()?.views['all:0'], d.views['all:0']);
  store.db
    .prepare('UPDATE versions SET payload=? WHERE id=?')
    .run(JSON.stringify(d), d.id);
  assert.deepEqual(store.current()?.views['all:0'], d.views['all:0']);
  store.close();
});
