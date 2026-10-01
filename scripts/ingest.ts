import { mkdir, readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Store, publish } from '../src/server/store';
import { collect } from '../src/server/collector';
import {
  normalizeEvent,
  classifySheet,
  completedIds,
} from '../src/domain/normalize';
await mkdir('.monstats', { recursive: true });
const store = new Store(resolve('.monstats/monstats.sqlite'));
const asOf = new Date().toISOString();
try {
  if (process.argv.includes('--archive')) {
    store.archiveCurrent('M-C');
    console.log('Archived published M-C coverage');
  } else {
    let events;
    if (process.argv.includes('--from-audit')) {
      const completed = completedIds(
        await readFile('.monstats/audit/completed.html', 'utf8'),
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
          const filename = `.monstats/audit/${id}-${endpoint}.${endpoint === 'page' ? 'html' : 'json'}`;
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
      const index = process.argv.indexOf('--limit');
      events = await collect(
        store,
        asOf,
        index < 0 ? 3 : Number(process.argv[index + 1]),
      );
    }
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
          coverage: dataset.views['open:0'].coverage,
          events: events.map((e) => ({
            name: e.name,
            sheet: e.sheet,
            teams: e.registrations.filter((r) => r.slots).length,
            quarantine: e.quarantine.reduce<Record<string, number>>((a, q) => {
              a[q.reason] = (a[q.reason] ?? 0) + 1;
              return a;
            }, {}),
          })),
        },
        null,
        2,
      ),
    );
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
  store.close();
}
