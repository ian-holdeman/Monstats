import { mkdir, writeFile } from 'node:fs/promises';
import { Store } from '../src/server/store';
import { collect } from '../src/server/collector';
import { dataDirectory } from '../src/server/paths';
import { resolve } from 'node:path';
const directory = resolve(dataDirectory(), 'audit');
await mkdir(directory, { recursive: true });
const store = new Store(resolve(directory, 'audit.sqlite'));
try {
  const events = await collect(store, new Date().toISOString());
  const report = events.map((e) => ({
    id: e.id,
    name: e.name,
    date: e.date,
    sheet: e.sheet,
    phases: e.phases,
    registrations: e.registrations.length,
    resolvedTeams: e.registrations.filter((r) => r.slots).length,
    pairings: e.matches.length,
    quarantine: e.quarantine.map((q) => q.reason),
    snapshots: e.snapshots,
  }));
  await writeFile(
    resolve(directory, 'report.json'),
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report, null, 2));
} finally {
  store.close();
}
