import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { dataDirectory } from '../src/server/paths';
import { Store } from '../src/server/store';
import { collectOfficial } from '../src/server/official';
import { reconcileRecords } from '../src/domain/reconciliation';
import { aggregate } from '../src/domain/analytics';
import type { CollectionReport } from '../src/domain/types';
const directory = resolve(dataDirectory(), 'official-audit');
await mkdir(directory, { recursive: true });
// Audit evidence and cache use a separate durable database. This command never publishes to the app.
const store = new Store(resolve(directory, 'audit.sqlite'));
try {
  const asOf = new Date().toISOString();
  const report: CollectionReport = {
    asOf,
    discovery: 'complete',
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
  const events = await collectOfficial(store, asOf, report, { force: true });
  const coverage = aggregate(events, {
    regulation: 'M-C',
    asOf,
    days: 30,
    sheet: 'all',
    minPlayers: 0,
  }).coverage;
  const output = {
    asOf,
    coverage,
    events: events.map((e) => ({
      ...reconcileRecords(e),
      regulation: e.regulation,
      provenance: e.provenance,
      snapshots: e.snapshots,
      quarantine: e.quarantine,
    })),
    collection: report,
  };
  await writeFile(
    resolve(directory, 'report.json'),
    JSON.stringify(output, null, 2),
  );
  console.log(
    JSON.stringify(
      {
        asOf,
        coverage,
        events: events.map(reconcileRecords),
        excluded: report.excluded.map((e) => ({ id: e.id, reason: e.reason })),
        report: resolve(directory, 'report.json'),
      },
      null,
      2,
    ),
  );
  if (!events.length) process.exitCode = 1;
} finally {
  store.close();
}
