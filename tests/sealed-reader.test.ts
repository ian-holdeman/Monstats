import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store, publish } from '../src/server/store';
import { fixture } from './fixtures';
import { checkDatabase } from '../src/server/backup';

test('verified sealed materialization does not decode every historical publication again', () => {
  const directory = mkdtempSync(join(tmpdir(), 'monstats-sealed-'));
  const path = join(directory, 'db.sqlite');
  const store = new Store(path);
  const d = publish(store, [fixture()], '2026-09-30T00:00:00Z', 'fixture');
  store.close();
  const version = Store.prototype.version;
  let reads = 0;
  Store.prototype.version = function (id: string) {
    reads++;
    return version.call(this, id);
  };
  try {
    assert.equal(checkDatabase(path, { sealed: true }).publication, d.id);
    assert.equal(
      reads,
      0,
      'logical validation was already completed before immutable sealing',
    );
    const damaged = new Store(path);
    damaged.db.exec('DELETE FROM matchup_indexes');
    damaged.close();
    assert.throws(
      () => checkDatabase(path, { sealed: true }),
      /metadata missing/,
    );
  } finally {
    Store.prototype.version = version;
    rmSync(directory, { recursive: true, force: true });
  }
});
