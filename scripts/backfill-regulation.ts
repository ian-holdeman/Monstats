import { mkdir, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { Store, publish } from '../src/server/store';
import { refresh } from '../src/server/refresh';
import { databasePath, dataDirectory } from '../src/server/paths';
import { coverageInterval, eventInInterval } from '../src/domain/regulations';
import { aggregate } from '../src/domain/analytics';
import type { NormalizedEvent } from '../src/domain/types';
import assert from 'node:assert/strict';

await mkdir(dataDirectory(), { recursive: true });
const store = new Store(databasePath());
const regulation = store.activeRegulation(),
  asOf = new Date().toISOString();
const before = store.forRegulation(regulation);
const owner = randomUUID();
const controller = new AbortController();
process.once('SIGINT', () => controller.abort());
process.once('SIGTERM', () => controller.abort());
const evidence = store.db
  .prepare('SELECT payload FROM event_cache ORDER BY retrieved_at')
  .all()
  .map((r) => JSON.parse(String(r.payload)).event as NormalizedEvent | null)
  .filter((e): e is NormalizedEvent => !!e);
const interval = coverageInterval(regulation, asOf, store.config);
const saved = new Map(
  evidence.filter((e) => eventInInterval(e, interval)).map((e) => [e.id, e]),
);
for (const e of before?.events ?? [])
  if (eventInInterval(e, interval)) saved.set(e.id, e);
try {
  if (!store.acquireLease(owner, Date.now()))
    throw new Error('Another ingestion process is running');
  const start = performance.now();
  const seeded = publish(
    store,
    [...saved.values()],
    asOf,
    'Saved audited evidence backfill; staged full regulation',
    undefined,
    { regulation, stage: true, owner },
  );
  store.releaseLease(owner);
  const staged = process.argv.includes('--offline')
    ? seeded
    : await refresh(store, asOf, {
        regulation,
        stage: true,
        signal: AbortSignal.any([
          controller.signal,
          AbortSignal.timeout(45 * 60000),
        ]),
      });
  const previousIds = new Set(before?.events.map((e) => e.id));
  const added = staged.events.filter((e) => !previousIds.has(e.id));
  const corrections = staged.events
    .filter(
      (e) =>
        previousIds.has(e.id) &&
        JSON.stringify({ ...e, snapshots: [], endsAt: undefined }) !==
          JSON.stringify({
            ...before!.events.find((p) => p.id === e.id),
            snapshots: [],
            endsAt: undefined,
          }),
    )
    .map((e) => ({ id: e.id, snapshots: e.snapshots }));
  const overlap = staged.events.filter((e) => previousIds.has(e.id));
  if (before && !corrections.length) {
    const recalc = aggregate(overlap, before.views['all:0'].options);
    assert.deepEqual(
      recalc.pokemon.map(({ evidence, ...row }) => {
        void evidence;
        return row;
      }),
      before.views['all:0'].pokemon.map(({ evidence, ...row }) => {
        void evidence;
        return row;
      }),
    );
    assert.deepEqual(recalc.coverage, before.views['all:0'].coverage);
  }
  const report = {
    regulation,
    interval,
    before: before?.views['all:0'].coverage,
    after: staged.views['all:0'].coverage,
    previous: before?.id,
    staged: staged.id,
    added: added.map((e) => ({
      id: e.id,
      name: e.name,
      date: e.date,
      snapshots: e.snapshots,
    })),
    corrections,
    overlapParity: corrections.length
      ? 'Separate source corrections require evidence; see snapshots'
      : 'All usage/outcome rows and coverage equal on overlapping population',
    durationMs: performance.now() - start,
    collection: staged.collection,
  };
  await writeFile(
    resolve(dataDirectory(), 'regulation-backfill.json'),
    JSON.stringify(report, null, 2),
  );
  if (process.argv.includes('--activate')) {
    if (staged.collection?.discovery === 'partial')
      throw new Error(
        'Partial discovery; staged facts retained, active publication unchanged. Resume collection before activation',
      );
    if (!store.acquireLease(owner, Date.now()))
      throw new Error('Another ingestion process is running');
    store.activate(regulation, staged.id);
  }
  console.log(
    JSON.stringify({
      previous: report.previous,
      staged: report.staged,
      before: report.before,
      after: report.after,
      added: added.length,
      corrections: corrections.length,
      durationMs: report.durationMs,
    }),
  );
} finally {
  store.releaseLease(owner);
  store.close();
}
