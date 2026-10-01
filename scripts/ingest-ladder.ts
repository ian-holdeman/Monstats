import { mkdir, readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Store } from '../src/server/store';
import { LadderStore } from '../src/server/ladder-store';
import { refreshLadder } from '../src/server/ladder-refresh';
import { parseChampions, type LadderEnvironment } from '../src/domain/ladder';
import { dataDirectory, databasePath } from '../src/server/paths';
await mkdir(dataDirectory(), { recursive: true });
const args = process.argv.slice(2),
  envIndex = args.indexOf('--environment');
const env = envIndex < 0 ? 'both' : args[envIndex + 1];
if (!['both', 'showdown', 'champions'].includes(env))
  throw new Error('Use --environment showdown, champions or both');
const monthIndex = args.indexOf('--months');
const months = monthIndex < 0 ? undefined : args[monthIndex + 1].split(',');
const store = new Store(databasePath()),
  controller = new AbortController();
process.once('SIGINT', () => controller.abort());
process.once('SIGTERM', () => controller.abort());
const owner = `ladder-cli:${process.pid}`;
if (!store.acquireLease(owner, Date.now(), 3600000)) {
  store.close();
  throw new Error('Another ingestion process is active');
}
const lease = setInterval(() => {
  store.acquireLease(owner, Date.now(), 3600000);
}, 60000);
try {
  for (const environment of (env === 'both'
    ? ['showdown', 'champions']
    : [env]) as LadderEnvironment[]) {
    if (environment === 'champions' && args.includes('--from-audit')) {
      const root = resolve(dataDirectory(), 'ladder-audit'),
        names = await readdir(resolve(root, 'champions'));
      const records = await Promise.all(
        names
          .filter((n) => n.endsWith('.json'))
          .map(async (n) =>
            JSON.parse(await readFile(resolve(root, 'champions', n), 'utf8')),
          ),
      );
      for (const record of records) record.data = JSON.parse(record.body);
      if (
        !records.length ||
        records.length !== records[0].data.pokemon_names.length
      )
        throw new Error('Audited Champions sweep is incomplete');
      const snapshots = records.map((r) =>
        store.snapshot(r.url, r.body, r.retrievedAt),
      );
      records.forEach((record, i) =>
        store.saveState(`ladder-source:${record.url}`, snapshots[i]),
      );
      const official = await readFile(
        resolve(root, 'champions-news.pokemon-home.com_en_page_822.html.txt'),
        'utf8',
      );
      if (
        !official.includes(
          'Ranked Battles Season M-6 will follow Regulation Set M-C',
        )
      )
        throw new Error('Official season audit missing');
      const metadata = JSON.parse(
        await readFile(
          resolve(
            root,
            'champions-news.pokemon-home.com_en_page_822.html.json',
          ),
          'utf8',
        ),
      );
      snapshots.push(
        store.snapshot(metadata.url, official, metadata.retrievedAt),
      );
      const d = new LadderStore(store).publish(
        parseChampions(
          records.map((r) => r.data),
          snapshots,
        ),
      );
      console.log(
        JSON.stringify({
          environment,
          publication: d.id,
          pokemon: d.rows.length,
          details: d.detailCoverage,
          excluded: d.excluded,
        }),
      );
    } else {
      const ds = await refreshLadder(store, environment, {
        months,
        signal: controller.signal,
        progress: (n, total) => {
          if (n % 10 === 0)
            console.log(`${n}/${total} Champions records saved`);
        },
      });
      console.log(
        JSON.stringify(
          ds.map((d) => ({
            environment,
            regulation: d.regulation,
            format: d.format,
            month: d.month,
            rating: d.rating,
            publication: d.id,
            pokemon: d.rows.length,
          })),
        ),
      );
    }
  }
} finally {
  clearInterval(lease);
  store.releaseLease(owner);
  store.close();
}
