import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Store } from '../src/server/store';
import { correctSavedIdentities } from '../src/server/identity-correction';
const directory = process.argv[2];
if (!directory || !process.argv.includes('--isolated'))
  throw new Error(
    'Supply a new restored directory and --isolated; never target the owner original or cloud runtime',
  );
if (process.env.MONSTATS_CONTROL_BUCKET)
  throw new Error(
    'Cloud application requires a separately authorized fenced migration',
  );
const path = resolve(directory, 'monstats.sqlite');
if (path === resolve('.monstats/monstats.sqlite'))
  throw new Error('Owner original is not a correction rehearsal');
const store = new Store(path);
try {
  const report = correctSavedIdentities(store);
  if (report.length)
    await writeFile(
      resolve(directory, 'identity-correction.json'),
      JSON.stringify(report, null, 2),
    );
  console.log(
    JSON.stringify(
      report.map(({ kind, before, after }) => ({ kind, before, after })),
    ),
  );
} finally {
  store.close();
}
