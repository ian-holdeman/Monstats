import { resolve } from 'node:path';
import { createReadStream, createWriteStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import { createGzip } from 'node:zlib';
import { Store } from '../src/server/store';
import { databasePath } from '../src/server/paths';
import { createServingArtifact } from '../src/server/cloud/serving-artifact';

const destination = process.argv[2];
if (!destination) throw new Error('Usage: serving-export <new-output.sqlite>');
const started = performance.now();
const store = new Store(databasePath(), true);
try {
  const path = resolve(destination);
  const result = await createServingArtifact(store, path);
  const exportMs = performance.now() - started;
  await pipeline(
    createReadStream(path),
    createGzip(),
    createWriteStream(`${path}.gz`, { flags: 'wx' }),
  );
  console.log(
    JSON.stringify({
      ...result,
      exportMs,
      totalMs: performance.now() - started,
      compressedBytes: (await stat(`${path}.gz`)).size,
      peakRssKiB: process.resourceUsage().maxRSS,
    }),
  );
} finally {
  store.close();
}
