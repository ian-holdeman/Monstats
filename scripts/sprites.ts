import { mkdir, writeFile, access } from 'node:fs/promises';
import { Dex } from '@pkmn/dex';
import { Store } from '../src/server/store';
import { databasePath, dataDirectory } from '../src/server/paths';
import { resolve } from 'node:path';
import { LadderStore } from '../src/server/ladder-store';
await mkdir(resolve(dataDirectory(), 'sprites'), { recursive: true });
const store = new Store(databasePath(), true);
const dataset = store.current();
const ladder = new LadderStore(store);
const rows = new Map<string, { id: string }>(
  (dataset
    ? (dataset.views['all:0'] ?? dataset.views['open:0']).pokemon
    : []
  ).map((row) => [row.id, row]),
);
if (process.argv.includes('--ladder'))
  for (const cohort of ladder.catalog())
    for (const row of ladder.version(cohort.id)?.rows ?? [])
      rows.set(row.id, row);
store.close();
if (!rows.size) throw new Error('Publish a dataset before caching artwork');
let downloaded = 0,
  missing = 0;
for (const row of rows.values()) {
  const path = resolve(dataDirectory(), `sprites/${row.id}.png`);
  try {
    await access(path);
    continue;
  } catch {
    /* fetch missing local artwork */
  }
  const species = Dex.species.get(row.id);
  const name =
    species.baseSpecies.toLowerCase().replace(/[^a-z0-9]/g, '') +
    (species.forme
      ? `-${species.forme.toLowerCase().replace(/[^a-z0-9]/g, '')}`
      : '');
  const response = await fetch(
    `https://play.pokemonshowdown.com/sprites/gen5/${name}.png`,
    { signal: AbortSignal.timeout(15000) },
  );
  if (
    !response.ok ||
    !response.headers.get('content-type')?.includes('image/png')
  ) {
    missing++;
    continue;
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  if (
    bytes.length > 500000 ||
    bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a'
  ) {
    missing++;
    continue;
  }
  await writeFile(path, bytes);
  downloaded++;
}
console.log({ downloaded, missing });
