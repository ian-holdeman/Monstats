import { mkdir, readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { Store, publish } from '../src/server/store';
import { refresh } from '../src/server/refresh';
import { dataDirectory, databasePath } from '../src/server/paths';
import { reconcileRecords } from '../src/domain/reconciliation';
import {
  normalizeEvent,
  classifySheet,
  completedIds,
} from '../src/domain/normalize';
await mkdir(dataDirectory(), { recursive: true });
const store = new Store(databasePath());
const asOf = new Date().toISOString();
const owner = randomUUID();
let leased = false;
try {
  if (process.argv.includes('--archive')) {
    leased = store.acquireLease(owner, Date.now());
    if (!leased) throw new Error('Another ingestion process is running');
    store.archiveCurrent(store.activeRegulation());
    console.log('Archived active published coverage');
  } else {
    let events;
    if (process.argv.includes('--from-audit')) {
      leased = store.acquireLease(owner, Date.now());
      if (!leased) throw new Error('Another ingestion process is running');
      const completed = completedIds(
        await readFile(
          resolve(dataDirectory(), 'audit/completed.html'),
          'utf8',
        ),
      );
      const ids = [
        '6abb9a23880ed327106df304',
        '6abab273783097f8dcb72bc7',
        '6ab2d5c0e905c1db68747f7d',
      ];
      events = [];
      for (const id of ids) {
        const refs = [];
        const values = [];
        for (const endpoint of ['details', 'standings', 'pairings', 'page']) {
          const filename = resolve(
            dataDirectory(),
            `audit/${id}-${endpoint}.${endpoint === 'page' ? 'html' : 'json'}`,
          );
          const body = await readFile(filename, 'utf8');
          refs.push(
            store.snapshot(
              endpoint === 'page'
                ? `https://play.limitlesstcg.com/tournament/${id}`
                : `https://play.limitlesstcg.com/api/tournaments/${id}/${endpoint}`,
              body,
              (await stat(filename)).mtime.toISOString(),
            ),
          );
          values.push(endpoint === 'page' ? body : JSON.parse(body));
        }
        events.push(
          normalizeEvent(
            values[0],
            values[1],
            values[2],
            classifySheet(
              values[3],
              `https://play.limitlesstcg.com/tournament/${id}`,
            ),
            refs,
            completed.has(id),
          ),
        );
      }
    } else {
      if (process.argv.includes('--limit'))
        throw new Error(
          '--limit is retired. Discovery now covers all available eligible events. Use --max-reads for a resumable request budget.',
        );
      const index = process.argv.indexOf('--max-reads');
      const regulationIndex = process.argv.indexOf('--regulation');
      const dataset = await refresh(store, asOf, {
        force: process.argv.includes('--force'),
        maxReads: index < 0 ? undefined : Number(process.argv[index + 1]),
        regulation:
          regulationIndex < 0 ? undefined : process.argv[regulationIndex + 1],
        stage: process.argv.includes('--stage'),
        officialOnly: process.argv.includes('--official-only'),
      });
      console.log(
        JSON.stringify(
          {
            id: dataset.id,
            coverage: dataset.views['all:0'].coverage,
            collection: dataset.collection,
            records: dataset.events.map(reconcileRecords),
          },
          null,
          2,
        ),
      );
      process.exitCode = 0;
      events = null;
    }
    if (events) {
      const dataset = publish(
        store,
        events,
        asOf,
        `Bounded audit sample: ${events.length} completed events; not an exhaustive 30-day census`,
      );
      console.log(
        JSON.stringify(
          {
            id: dataset.id,
            scope: dataset.scope,
            coverage: dataset.views['all:0'].coverage,
            events: events.map((e) => ({
              name: e.name,
              sheet: e.sheet,
              teams: e.registrations.filter((r) => r.slots).length,
              quarantine: e.quarantine.reduce<Record<string, number>>(
                (a, q) => {
                  a[q.reason] = (a[q.reason] ?? 0) + 1;
                  return a;
                },
                {},
              ),
            })),
          },
          null,
          2,
        ),
      );
    }
  }
} catch (error) {
  store.refreshFailure(
    asOf,
    error instanceof Error ? error.message : 'Refresh failed',
  );
  console.error(
    'Refresh failed; previous publication retained.',
    error instanceof Error ? error.message : '',
  );
  process.exitCode = 1;
} finally {
  if (leased) store.releaseLease(owner);
  store.close();
}
