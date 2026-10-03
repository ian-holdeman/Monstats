import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { clearTimeout, setTimeout } from 'node:timers';
import { Store, publish } from '../src/server/store';
import { LadderStore } from '../src/server/ladder-store';
import { publicDataset, readAppData } from '../src/server/reader';
import { POST } from '../src/app/matchups/[id]/route';
import { readRequestBody, RequestBodyError } from '../src/server/request-body';
import { fixture } from './fixtures';
import config from '../next.config';
import { cohortKey } from '../src/domain/regulations';

test('public page props omit collector diagnostics while retaining status and timestamps', () => {
  const directory = mkdtempSync(join(tmpdir(), 'monstats-public-status-'));
  const prior = process.env.MONSTATS_DATA_DIR;
  process.env.MONSTATS_DATA_DIR = directory;
  const store = new Store(join(directory, 'monstats.sqlite'));
  const attemptedAt = '2026-10-02T00:00:00Z';
  const diagnostic = 'private collector diagnostic sentinel';
  try {
    store.refreshFailure(attemptedAt, diagnostic);
    const ladder = new LadderStore(store);
    ladder.failure('showdown', attemptedAt, diagnostic);
    ladder.failure('champions', attemptedAt, diagnostic);
    const data = readAppData();
    assert.equal(data.readError, false);
    assert.deepEqual(data.status, { state: 'failure', attemptedAt });
    for (const status of Object.values(data.ladder!.status))
      assert.deepEqual(status, { state: 'failure', attemptedAt });
    assert.equal(JSON.stringify(data).includes(diagnostic), false);
    assert.equal(store.status()?.message, diagnostic);
    assert.equal(ladder.status('showdown')?.message, diagnostic);
  } finally {
    store.close();
    if (prior === undefined) delete process.env.MONSTATS_DATA_DIR;
    else process.env.MONSTATS_DATA_DIR = prior;
    rmSync(directory, { recursive: true, force: true });
  }
});

test('aborting a partially uploaded Matchups body ends the request and cancels the stream', async () => {
  let controller: ReadableStreamDefaultController<Uint8Array>;
  let cancelled = false;
  let started: () => void;
  const reading = new Promise<void>((resolve) => {
    started = resolve;
  });
  const body = new ReadableStream<Uint8Array>({
    start(value) {
      controller = value;
      value.enqueue(new TextEncoder().encode('{'));
    },
    pull() {
      started();
    },
    cancel() {
      cancelled = true;
    },
  });
  const abort = new AbortController();
  const response = POST(
    new Request('http://localhost/matchups/audit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      signal: abort.signal,
      duplex: 'half',
    } as RequestInit),
    { params: Promise.resolve({ id: 'audit' }) },
  );
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await reading;
    abort.abort(new Error('private cancellation diagnostic'));
    const result = await Promise.race([
      response,
      new Promise<undefined>((resolve) => {
        timer = setTimeout(() => resolve(undefined), 100);
      }),
    ]);
    assert.ok(result, 'Request must stop after its signal is aborted');
    assert.equal(result.status, 408);
    assert.equal(cancelled, true);
    assert.equal((await result.text()).includes('private'), false);
  } finally {
    clearTimeout(timer);
    if (!cancelled) controller!.close();
    await response;
  }
});

test('unfinished uploads time out and release their body without waiting for cancellation', async () => {
  let cancelled = false;
  const body = new ReadableStream<Uint8Array>({
    cancel() {
      cancelled = true;
      return new Promise<void>(() => {});
    },
  });
  const request = new Request('http://localhost/matchups/audit', {
    method: 'POST',
    body,
    duplex: 'half',
  } as RequestInit);
  await assert.rejects(
    readRequestBody(request, 4096, 20),
    (error) => error instanceof RequestBodyError && error.status === 408,
  );
  assert.equal(cancelled, true);
  assert.equal(body.locked, false);
});

test('upload bound counts streamed UTF-8 bytes and preserves valid bodies', async () => {
  const text = 'é'.repeat(2048);
  assert.equal(
    await readRequestBody(
      new Request('http://localhost', { method: 'POST', body: text }),
    ),
    text,
  );
  await assert.rejects(
    readRequestBody(
      new Request('http://localhost', { method: 'POST', body: text + 'é' }),
    ),
    (error) => error instanceof RequestBodyError && error.status === 413,
  );
  let cancelled = false;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(text));
      controller.enqueue(new TextEncoder().encode('é'));
    },
    cancel() {
      cancelled = true;
    },
  });
  await assert.rejects(
    readRequestBody(
      new Request('http://localhost', {
        method: 'POST',
        body: stream,
        duplex: 'half',
      } as RequestInit),
    ),
    (error) => error instanceof RequestBodyError && error.status === 413,
  );
  assert.equal(cancelled, true);
  assert.equal(stream.locked, false);
});

test('same-origin JSON Matchups requests preserve successful queries and reject injected selections', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'monstats-matchup-boundary-'));
  const prior = process.env.MONSTATS_DATA_DIR;
  process.env.MONSTATS_DATA_DIR = directory;
  const store = new Store(join(directory, 'monstats.sqlite'));
  try {
    const d = publish(
      store,
      [fixture()],
      '2026-09-30T18:00:00Z',
      'request fixture',
    );
    const base = {
      mode: 'compare',
      a: ['rillaboom'],
      b: ['sneasler'],
      candidateSize: 1,
      sort: 'difference',
      direction: 'best',
      offset: 0,
      limit: 50,
      source: 'all',
      sheet: 'all',
      minPlayers: 0,
      official: false,
    };
    const post = (body: unknown) =>
      POST(
        new Request(`http://localhost/matchups/${d.id}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json; charset=utf-8',
            Origin: 'http://localhost',
          },
          body: JSON.stringify(body),
        }),
        { params: Promise.resolve({ id: d.id }) },
      );
    const valid = await post(base);
    assert.equal(valid.status, 200);
    assert.equal((await valid.json()).publication, d.id);
    for (const body of [
      null,
      [],
      { ...base, a: ["'; DROP TABLE versions;--"] },
      { ...base, source: '<script>' },
      { ...base, limit: 51 },
    ])
      assert.equal((await post(body)).status, 400);
    assert.equal(
      (await post({ ...base, padding: 'x'.repeat(4096) })).status,
      413,
    );
    assert.equal(store.current()?.id, d.id);
  } finally {
    store.close();
    if (prior === undefined) delete process.env.MONSTATS_DATA_DIR;
    else process.env.MONSTATS_DATA_DIR = prior;
    rmSync(directory, { recursive: true, force: true });
  }
});

test('foreign-site simple POSTs cannot run Matchups queries with text/plain bodies', async () => {
  const response = await POST(
    new Request('http://localhost/matchups/audit', {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain',
        Origin: 'https://other.invalid',
      },
      body: '{}',
    }),
    { params: Promise.resolve({ id: 'audit' }) },
  );
  assert.equal(response.status, 415);
});

test('unknown provider aliases reuse saved metrics while preserving selected filters', () => {
  const store = new Store(':memory:');
  try {
    const d = publish(
      store,
      [fixture()],
      '2026-09-30T18:00:00Z',
      'security fixture',
    );
    const saved = Object.values(publicDataset(d, 'all').views)[0];
    d.views[cohortKey('legacy-provider', 'all', 0, false)] = {
      ...saved,
      options: { ...saved.options, source: 'legacy-provider' },
    };
    Object.defineProperty(d.events[0], 'matches', {
      get() {
        throw new Error('Saved cohort must not be recalculated');
      },
    });
    const response = publicDataset(d, 'missing-provider,limitless');
    const view = Object.values(response.views)[0];
    assert.equal(view.options.source, 'limitless,missing-provider');
    assert.equal(view.pokemon, saved.pokemon);
    assert.deepEqual(view.coverage, saved.coverage);
    assert.equal(
      Object.keys(response.views)[0].startsWith('limitless,missing-provider:'),
      true,
    );
    const unavailable = Object.values(
      publicDataset(d, 'missing-provider').views,
    )[0];
    assert.equal(unavailable.coverage.events, 0);
    assert.equal(unavailable.options.source, 'missing-provider');
    assert.equal(
      Object.values(publicDataset(d, 'legacy-provider').views)[0].pokemon,
      saved.pokemon,
      'Retain a legacy saved cohort even when its provider metadata is absent',
    );
  } finally {
    store.close();
  }
});

test('production CSP denies dynamic evaluation, plugins and cross-origin document targets', async () => {
  const prior = process.env.NODE_ENV;
  Object.assign(process.env, { NODE_ENV: 'production' });
  try {
    const routes = await config.headers!();
    const csp = routes
      .find((r) => r.source === '/(.*)')!
      .headers.find((h) => h.key === 'Content-Security-Policy')!.value;
    assert.equal(csp.includes("'unsafe-eval'"), false);
    for (const directive of [
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ])
      assert.ok(csp.includes(directive));
  } finally {
    if (prior === undefined) Reflect.deleteProperty(process.env, 'NODE_ENV');
    else Object.assign(process.env, { NODE_ENV: prior });
  }
});
