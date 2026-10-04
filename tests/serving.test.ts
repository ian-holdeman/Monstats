import { before, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setImmediate } from 'node:timers';
import { gunzipSync } from 'node:zlib';
import { Store, publish } from '../src/server/store';
import { fixture } from './fixtures';
import { GET } from '../src/app/data/[id]/route';
import { build } from 'esbuild';
import { publicDataset } from '../src/server/reader';
import { withEvidence } from '../src/server/evidence-reader';
import { backfillEvidence } from '../src/server/evidence-index';
import {
  ServingReader,
  ServingCapacityError,
  ServingUnavailableError,
  type DatasetRead,
  type ServingResponse,
} from '../src/server/serving-reader';

before(async () => {
  await build({
    entryPoints: ['scripts/serving-reader.ts'],
    outfile: 'dist/workers/serving-reader.mjs',
    bundle: true,
    platform: 'node',
    target: 'node24',
    format: 'esm',
    packages: 'external',
  });
});

test('compressed saved-data responses preserve complete JSON and vary by negotiation', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'monstats-gzip-'));
  const prior = process.env.MONSTATS_DATA_DIR;
  process.env.MONSTATS_DATA_DIR = directory;
  const store = new Store(join(directory, 'monstats.sqlite'));
  try {
    const d = publish(store, [fixture()], '2026-09-30T18:00:00Z', 'gzip');
    const context = { params: Promise.resolve({ id: d.id }) };
    const compressed = await GET(
      new Request(`http://localhost/data/${d.id}`, {
        headers: { 'Accept-Encoding': 'gzip' },
      }),
      context,
    );
    assert.equal(compressed.headers.get('content-encoding'), 'gzip');
    assert.equal(compressed.headers.get('vary'), 'Accept-Encoding');
    const raw = await GET(
      new Request(`http://localhost/data/${d.id}`, {
        headers: { 'Accept-Encoding': 'gzip;q=0' },
      }),
      context,
    );
    assert.equal(raw.headers.get('content-encoding'), null);
    assert.deepEqual(
      JSON.parse(
        gunzipSync(Buffer.from(await compressed.arrayBuffer())).toString(),
      ),
      await raw.json(),
    );
  } finally {
    store.close();
    if (prior === undefined) delete process.env.MONSTATS_DATA_DIR;
    else process.env.MONSTATS_DATA_DIR = prior;
    rmSync(directory, { recursive: true, force: true });
  }
});

test('a cold saved-data request yields the main thread while preparing its full response', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'monstats-cold-read-'));
  const prior = process.env.MONSTATS_DATA_DIR;
  process.env.MONSTATS_DATA_DIR = directory;
  const store = new Store(join(directory, 'monstats.sqlite'));
  try {
    const d = publish(
      store,
      [fixture()],
      '2026-09-30T18:00:00Z',
      'serving fixture',
    );
    let yielded = false;
    setImmediate(() => {
      yielded = true;
    });
    const response = await GET(new Request(`http://localhost/data/${d.id}`), {
      params: Promise.resolve({ id: d.id }),
    });
    assert.equal(response.status, 200);
    assert.equal(
      yielded,
      true,
      'Cold decode and serialization must not monopolize the web thread',
    );
    assert.equal((await response.json()).id, d.id);
  } finally {
    store.close();
    if (prior === undefined) delete process.env.MONSTATS_DATA_DIR;
    else process.env.MONSTATS_DATA_DIR = prior;
    rmSync(directory, { recursive: true, force: true });
  }
});

test('worker output matches every supported fixture cohort and refreshes mutable page state', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'monstats-serving-parity-'));
  const path = join(directory, 'monstats.sqlite');
  const store = new Store(path);
  const reader = new ServingReader();
  try {
    const d = publish(
      store,
      [fixture()],
      '2026-09-30T18:00:00Z',
      'serving parity',
    );
    for (const source of [
      'all',
      'limitless',
      'none',
      'missing',
      'limitless,missing',
    ])
      for (const sheet of ['all', 'open', 'closed'])
        for (const official of [false, true]) {
          const actual = await reader.read({
            kind: 'dataset',
            path,
            id: d.id,
            source,
            sheet,
            minPlayers: 0,
            official,
          });
          assert.equal(actual.kind, 'dataset');
          if (actual.kind !== 'dataset') throw new Error('Wrong result');
          assert.equal(actual.status, 200);
          assert.deepEqual(
            JSON.parse(new TextDecoder().decode(actual.body)),
            JSON.parse(
              JSON.stringify(
                publicDataset(d, source, sheet, 0, official, store.db),
              ),
            ),
          );
        }
    const first = await reader.read({ kind: 'app', path });
    assert.equal(first.kind, 'app');
    store.refreshFailure('2026-10-02T00:00:00Z', 'private error');
    store.archiveCurrent('M-C');
    const second = await reader.read({ kind: 'app', path });
    assert.equal(second.kind, 'app');
    if (first.kind !== 'app' || second.kind !== 'app')
      throw new Error('Wrong result');
    assert.equal(first.data.current?.id, d.id);
    assert.equal(second.data.current, null);
    assert.equal(second.data.archives[0].id, d.id);
    assert.equal(second.data.status?.state, 'failure');
    assert.equal(JSON.stringify(second.data).includes('private error'), false);
    assert.equal(
      (
        await reader.read({
          kind: 'dataset',
          path,
          id: 'missing',
          source: 'all',
          sheet: 'all',
          minPlayers: 0,
          official: false,
        })
      ).kind,
      'dataset',
    );
  } finally {
    await reader.close();
    store.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

const testWorker = `
import {parentPort} from 'node:worker_threads';
const calls = new Map();
parentPort.on('message', ({id,command}) => {
  const count=(calls.get(command.id)||0)+1; calls.set(command.id,count);
  if(command.kind==='app') { parentPort.postMessage({id,result:{kind:'app',data:{current:null,archives:[],status:{state:'success',attemptedAt:String(count)},readError:false,now:new Date().toISOString()}}}); return; }
  if(command.id==='hang') return;
  if(command.id==='crash') process.exit(2);
  if(command.id==='failure'&&count===1) {parentPort.postMessage({id,error:true});return;}
  const body=new TextEncoder().encode(JSON.stringify({id:command.id,reads:count,pad:'x'.repeat(command.id==='large'?1024:32)}));
  const result={kind:'dataset',status:command.id==='missing'&&count===1?404:200,cacheable:command.id!=='mutable',body};
  parentPort.postMessage({id,result},[body.buffer]);
});`;
const command = (id: string): DatasetRead => ({
  kind: 'dataset',
  path: 'fixture',
  id,
  source: 'all',
  sheet: 'all',
  minPlayers: 0,
  official: false,
});
const decoded = (r: ServingResponse) => {
  if (r.kind !== 'dataset') throw new Error('Wrong result');
  return JSON.parse(new TextDecoder().decode(r.body)) as {
    id: string;
    reads: number;
  };
};
async function withReader(
  run: (reader: ServingReader) => Promise<void>,
  cacheBytes = 1024,
  deadlineMs = 2000,
) {
  const directory = mkdtempSync(join(tmpdir(), 'monstats-serving-worker-'));
  const path = join(directory, 'worker.mjs');
  writeFileSync(path, testWorker);
  const reader = new ServingReader(path, {
    cacheBytes,
    cacheEntries: 64,
    jobs: 3,
    subscribers: 8,
    deadlineMs,
  });
  try {
    await run(reader);
  } finally {
    await reader.close();
    rmSync(directory, { recursive: true, force: true });
  }
}

test('cold requests coalesce, distinct jobs and duplicate subscribers are bounded', async () => {
  await withReader(async (reader) => {
    const same = Array.from({ length: 8 }, () => reader.read(command('same')));
    await assert.rejects(reader.read(command('same')), ServingCapacityError);
    assert.ok((await Promise.all(same)).every((r) => decoded(r).reads === 1));
    const queued = ['one', 'two', 'three'].map((id) =>
      reader.read(command(id)),
    );
    await assert.rejects(reader.read(command('four')), ServingCapacityError);
    assert.equal((await Promise.all(queued)).length, 3);
  });
});

test('serialized cache evicts by bytes, skips oversized bodies and never caches misses or incomplete evidence', async () => {
  await withReader(async (reader) => {
    assert.equal(decoded(await reader.read(command('a'))).reads, 1);
    assert.equal(decoded(await reader.read(command('a'))).reads, 1);
    await reader.read(command('b'));
    assert.equal(decoded(await reader.read(command('a'))).reads, 2);
    assert.equal(decoded(await reader.read(command('large'))).reads, 1);
    assert.equal(decoded(await reader.read(command('large'))).reads, 2);
    assert.equal(decoded(await reader.read(command('mutable'))).reads, 1);
    assert.equal(decoded(await reader.read(command('mutable'))).reads, 2);
    const missing = await reader.read(command('missing'));
    assert.equal(missing.kind === 'dataset' && missing.status, 404);
    assert.equal(decoded(await reader.read(command('missing'))).reads, 2);
    await assert.rejects(
      reader.read(command('failure')),
      ServingUnavailableError,
    );
    assert.equal(decoded(await reader.read(command('failure'))).reads, 2);
  }, 100);
});

test('expired or crashed workers are replaced and later requests recover', async () => {
  await withReader(
    async (reader) => {
      await assert.rejects(
        reader.read(command('hang')),
        ServingUnavailableError,
      );
      assert.equal(decoded(await reader.read(command('healthy'))).reads, 1);
      await assert.rejects(
        reader.read(command('crash')),
        ServingUnavailableError,
      );
      assert.equal(
        decoded(await reader.read(command('healthy-after-crash'))).reads,
        1,
      );
    },
    1024,
    500,
  );
});

test('same-path database and WAL generations cannot reuse a prior serialized response', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'monstats-serving-generation-'));
  const path = join(directory, 'database');
  try {
    writeFileSync(path, 'first-generation');
    await withReader(async (reader) => {
      const q = { ...command('generation'), path };
      assert.equal(decoded(await reader.read(q)).reads, 1);
      assert.equal(decoded(await reader.read(q)).reads, 1);
      writeFileSync(path, 'replacement-generation-with-different-size');
      assert.equal(decoded(await reader.read(q)).reads, 2);
      writeFileSync(path + '-wal', 'new-evidence-transaction');
      assert.equal(decoded(await reader.read(q)).reads, 3);
    });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('page navigation reuses saved metadata but reloads after a local commit', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'monstats-page-cache-'));
  const path = join(directory, 'database');
  writeFileSync(path, 'first');
  try {
    await withReader(async (reader) => {
      const read = async () => {
        const result = await reader.read({ kind: 'app', path });
        assert.equal(result.kind, 'app');
        if (result.kind !== 'app') throw new Error('Wrong result');
        return result.data.status?.attemptedAt;
      };
      assert.equal(await read(), '1');
      assert.equal(await read(), '1');
      writeFileSync(path + '-wal', 'new publication');
      assert.equal(await read(), '2');
    });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('an evidence-ready database cannot populate a separate database missing that evidence index', () => {
  const first = new Store(':memory:');
  const second = new Store(':memory:');
  try {
    const d = publish(
      first,
      [fixture()],
      '2026-09-30T18:00:00Z',
      'evidence cache isolation',
    );
    backfillEvidence(first.db, d);
    const view = d.views['all:0'];
    const legacy = {
      ...view,
      pokemon: view.pokemon.map((row) => ({ ...row, evidence: undefined })),
    };
    assert.ok(withEvidence(d.id, legacy, first.db).pokemon[0].evidence);
    assert.equal(
      withEvidence(d.id, legacy, second.db).pokemon[0].evidence,
      undefined,
    );
  } finally {
    first.close();
    second.close();
  }
});
