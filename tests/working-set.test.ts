import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store, publish } from '../src/server/store';
import { fixture } from './fixtures';
import { createWorkingSet } from '../src/server/cloud/serving-artifact';
import { needsHistory, withReadSnapshot } from '../src/server/cloud/reader';
import { cloudRuntime, readScope } from '../src/server/cloud/read-scope';
import { PinnedReader } from '../src/server/cloud/pinned-reader';
import { LadderStore } from '../src/server/ladder-store';
import { parseChampions } from '../src/domain/ladder';
import { championsResponse } from './ladder-fixtures';

test('working set keeps current and Archive facts, with explicit historical lookup and intact originals', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'monstats-working-'));
  const source = new Store(join(dir, 'source.sqlite'));
  try {
    const old = publish(source, [fixture()], '2026-09-28T18:00:00Z', 'old');
    const archive = publish(
      source,
      [fixture()],
      '2026-09-29T18:00:00Z',
      'archive',
    );
    source.db
      .prepare('INSERT INTO pointers VALUES (?,?)')
      .run('archive:fixture', archive.id);
    const current = publish(
      source,
      [fixture()],
      '2026-09-30T18:00:00Z',
      'current',
    );
    const ladder = new LadderStore(source);
    const oldLadder = ladder.publish(
      parseChampions(
        [championsResponse()],
        [
          {
            url: 'https://example.test/data',
            checksum: 'a'.repeat(64),
            retrievedAt: '2026-09-30T12:00:00Z',
          },
        ],
      ),
    );
    const changed = championsResponse();
    changed.moves_list[0][1] = '96.0';
    const currentLadder = ladder.publish(
      parseChampions(
        [changed],
        [
          {
            url: 'https://example.test/data',
            checksum: 'a'.repeat(64),
            retrievedAt: '2026-09-30T12:00:00Z',
          },
        ],
      ),
    );
    await createWorkingSet(source, join(dir, 'working.sqlite'));
    const working = new Store(join(dir, 'working.sqlite'), true);
    try {
      assert.deepEqual(working.current(), source.current());
      assert.deepEqual(working.archives(), source.archives());
      assert.equal(working.version(old.id), null);
      assert.ok(source.version(old.id));
      assert.deepEqual(
        working.db
          .prepare('SELECT id FROM serving_history WHERE kind=?')
          .all('tournament')
          .map((r) => r.id),
        [old.id],
      );
      for (const id of [archive.id, current.id]) {
        assert.deepEqual(working.version(id), source.version(id));
      }
      assert.equal(
        working.db.prepare('SELECT count(*) n FROM matchup_indexes').get()!.n,
        2,
      );
      assert.deepEqual(new LadderStore(working).catalog(), ladder.catalog());
      assert.deepEqual(
        new LadderStore(working).version(currentLadder.id),
        ladder.version(currentLadder.id),
      );
      assert.equal(new LadderStore(working).version(oldLadder.id), null);
      assert.equal(
        needsHistory(join(dir, 'working.sqlite'), {
          kind: 'tournament',
          id: old.id,
        }),
        true,
      );
      assert.equal(
        needsHistory(join(dir, 'working.sqlite'), {
          kind: 'tournament',
          id: 'unknown',
        }),
        false,
      );
      assert.equal(
        needsHistory(join(dir, 'working.sqlite'), {
          kind: 'ladder',
          id: oldLadder.id,
        }),
        true,
      );
      const priorEnv = process.env.MONSTATS_CONTROL_BUCKET;
      const priorReaders = {
        reader: cloudRuntime.reader,
        historyReader: cloudRuntime.historyReader,
        spriteReader: cloudRuntime.spriteReader,
      };
      const loads: string[] = [];
      const fake = (name: string, path: string) =>
        new PinnedReader(
          async () => name,
          async () => {
            loads.push(name);
            return path;
          },
          async () => {},
        );
      process.env.MONSTATS_CONTROL_BUCKET = 'test';
      cloudRuntime.reader = fake('working', join(dir, 'working.sqlite'));
      cloudRuntime.historyReader = fake(
        'history',
        join(dir, 'history', 'monstats.sqlite'),
      );
      cloudRuntime.spriteReader = fake(
        'sprites',
        join(dir, 'sprites', 'monstats.sqlite'),
      );
      try {
        assert.equal(
          await withReadSnapshot(async () => readScope.getStore(), 'sprites'),
          join(dir, 'sprites'),
        );
        assert.deepEqual(loads, ['sprites']);
        assert.equal(
          await withReadSnapshot(async () => readScope.getStore(), {
            kind: 'tournament',
            id: current.id,
          }),
          dir,
        );
        await withReadSnapshot(async () => {}, {
          kind: 'tournament',
          id: 'unknown',
        });
        assert.deepEqual(loads, ['sprites', 'working']);
        assert.equal(
          await withReadSnapshot(async () => readScope.getStore(), {
            kind: 'tournament',
            id: old.id,
          }),
          join(dir, 'history'),
        );
        assert.deepEqual(loads, ['sprites', 'working', 'history']);
      } finally {
        Object.assign(cloudRuntime, priorReaders);
        if (priorEnv === undefined) delete process.env.MONSTATS_CONTROL_BUCKET;
        else process.env.MONSTATS_CONTROL_BUCKET = priorEnv;
      }
    } finally {
      working.close();
    }
  } finally {
    source.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
