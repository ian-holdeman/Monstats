import test from 'node:test';
import assert from 'node:assert/strict';
import { Store, publish } from '../src/server/store';
import { fixture } from './fixtures';
import { readAppData, publicDataset } from '../src/server/reader';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
test('initial table omits unselected details, which remain lossless on demand', () => {
  const directory = mkdtempSync(join(tmpdir(), 'monstats-selected-'));
  const path = join(directory, 'db.sqlite');
  const store = new Store(path);
  try {
    const d = publish(store, [fixture()], '2026-09-30T00:00:00Z', 'fixture');
    const first = Object.values(readAppData(path).current!.views)[0];
    assert.deepEqual(first.matchups, {});
    assert.deepEqual(first.pokemon, d.views['all:0'].pokemon);
    const detail = publicDataset(
      d,
      'all',
      'all',
      0,
      false,
      store.db,
      'incineroar',
    );
    const view = Object.values(detail.views)[0];
    assert.deepEqual(
      view.matchups.incineroar,
      d.views['all:0'].matchups.incineroar,
    );
    assert.deepEqual(
      view.builds!.incineroar,
      d.views['all:0'].builds!.incineroar,
    );
    assert.deepEqual(Object.keys(view.matchups), ['incineroar']);
  } finally {
    store.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
