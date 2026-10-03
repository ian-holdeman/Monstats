import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import {
  CheckpointJournal,
  replayCheckpoint,
} from '../src/server/cloud/journal';

function database() {
  const db = new DatabaseSync(':memory:');
  db.exec(
    'CREATE TABLE state (name TEXT PRIMARY KEY, value TEXT NOT NULL); CREATE TABLE snapshots (hash TEXT PRIMARY KEY, body BLOB NOT NULL)',
  );
  return db;
}

test('checkpoint replay preserves claims, cooldown and evidence across multiple hard restarts', async () => {
  const source = database(),
    recovered = database();
  const journal = new CheckpointJournal(source);
  const committed: Uint8Array[] = [];
  try {
    source
      .prepare('INSERT INTO state VALUES (?,?)')
      .run('final:run', 'running:original-deadline');
    await journal.checkpoint(async (bytes) => {
      committed.push(bytes);
    });
    source
      .prepare('INSERT INTO snapshots VALUES (?,?)')
      .run('sha', new Uint8Array([0, 1, 255]));
    source.prepare('INSERT INTO state VALUES (?,?)').run('cooldown', 'future');
    await journal.checkpoint(async (bytes) => {
      committed.push(bytes);
    });
    for (const bytes of committed) replayCheckpoint(recovered, bytes);
    assert.deepEqual(
      recovered.prepare('SELECT * FROM state ORDER BY name').all(),
      source.prepare('SELECT * FROM state ORDER BY name').all(),
    );
    assert.deepEqual(
      recovered.prepare('SELECT * FROM snapshots').all(),
      source.prepare('SELECT * FROM snapshots').all(),
    );
    await journal.checkpoint(async () => {
      assert.fail('empty checkpoint');
    });
    assert.equal(committed.length, 2);
    assert.throws(() => replayCheckpoint(recovered, committed[0]), /conflict/i);
  } finally {
    journal.close();
    source.close();
    recovered.close();
  }
});

test('failed durable checkpoint fences subsequent provider-boundary checkpoints', async () => {
  const source = database();
  const journal = new CheckpointJournal(source);
  try {
    source.prepare('INSERT INTO state VALUES (?,?)').run('attempt', '1');
    await assert.rejects(
      journal.checkpoint(async () => {
        throw new Error('offline');
      }),
      /offline/,
    );
    await assert.rejects(
      journal.checkpoint(async () => {}),
      /unavailable/,
    );
  } finally {
    journal.close();
    source.close();
  }
});

test('mutations while a checkpoint upload is pending survive in the next checkpoint', async () => {
  const source = database(),
    recovered = database();
  const journal = new CheckpointJournal(source);
  try {
    source.prepare('INSERT INTO state VALUES (?,?)').run('attempt', '1');
    await journal.checkpoint(async (bytes) => {
      replayCheckpoint(recovered, bytes);
      source.prepare('INSERT INTO state VALUES (?,?)').run('heartbeat', '2');
    });
    await journal.checkpoint(async (bytes) => {
      replayCheckpoint(recovered, bytes);
    });
    assert.deepEqual(
      recovered.prepare('SELECT * FROM state ORDER BY name').all(),
      source.prepare('SELECT * FROM state ORDER BY name').all(),
    );
  } finally {
    journal.close();
    source.close();
    recovered.close();
  }
});
