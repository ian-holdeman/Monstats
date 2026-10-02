import { mkdir, writeFile, readFile, rename } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { Store } from '../src/server/store';
import { LadderStore } from '../src/server/ladder-store';
import { databasePath, dataDirectory } from '../src/server/paths';
import { artworkSource } from '../src/domain/artwork';
import { validateArtwork } from '../src/server/artwork';

const dir = resolve(dataDirectory(), 'sprites');
await mkdir(dir, { recursive: true });
const store = new Store(databasePath(), true);
const ids = new Set<string>();
try {
  for (const saved of store.db
    .prepare('SELECT id FROM versions ORDER BY id')
    .all()) {
    const d = store.version(String(saved.id));
    if (d) {
      for (const row of d.views['all:0']?.pokemon ?? []) ids.add(row.id);
      for (const e of d.events)
        for (const r of e.registrations)
          for (const slot of r.slots ?? []) ids.add(slot.id);
    }
  }
  const ladder = new LadderStore(store);
  if (
    store.db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='ladder_versions'",
      )
      .get()
  )
    for (const saved of store.db
      .prepare('SELECT id FROM ladder_versions ORDER BY id')
      .all())
      for (const row of ladder.version(String(saved.id))?.rows ?? [])
        ids.add(row.id);
} finally {
  store.close();
}
if (!ids.size) throw new Error('Publish a dataset before caching artwork');
const report: {
  id: string;
  status: string;
  url?: string;
  credit?: string;
  terms?: string;
  hash?: string;
  reason?: string;
}[] = [];
let previous: typeof report = [];
try {
  previous = JSON.parse(
    await readFile(resolve(dir, 'acquisition-report.json'), 'utf8'),
  );
} catch {
  /* First acquisition. */
}
for (const id of [...ids].sort()) {
  const path = resolve(dir, `${id}.png`);
  try {
    await validateArtwork(await readFile(path));
    report.push({
      ...previous.find((r) => r.id === id),
      id,
      status: 'existing',
    });
    continue;
  } catch {
    /* Missing/broken files may be repaired only with reviewed source mappings. */
  }
  const source = artworkSource(id);
  if (process.argv.includes('--audit') || !source) {
    report.push({
      id,
      status: 'unresolved',
      reason: source
        ? 'Missing or broken local file'
        : 'No reviewed form-specific source',
    });
    continue;
  }
  try {
    const response = await fetch(source.url, {
      signal: AbortSignal.timeout(15000),
    });
    if (
      !response.ok ||
      !response.headers.get('content-type')?.includes('image/png')
    )
      throw new Error(`Invalid image response ${response.status}`);
    if (Number(response.headers.get('content-length')) > 500000)
      throw new Error('Image exceeds limit');
    const bytes = Buffer.from(await response.arrayBuffer());
    const info = await validateArtwork(bytes);
    if (!info.transparent) throw new Error('Transparent background required');
    // Validate fully, then replace atomically. Preserve every valid existing file.
    const temporary = `${path}.pending`;
    await writeFile(temporary, bytes);
    await rename(temporary, path);
    report.push({
      id,
      status: 'downloaded',
      ...source,
      hash: createHash('sha256').update(bytes).digest('hex'),
    });
  } catch (e) {
    report.push({
      id,
      status: 'unresolved',
      ...source,
      reason: e instanceof Error ? e.message : 'Acquisition failed',
    });
  }
}
await writeFile(
  resolve(
    dir,
    process.argv.includes('--audit')
      ? 'coverage-report.json'
      : 'acquisition-report.json',
  ),
  JSON.stringify(report, null, 2),
);
const health = {
  checkedAt: new Date().toISOString(),
  state: report.some((r) => r.status === 'unresolved') ? 'partial' : 'ok',
  audited: ids.size,
  downloaded: report.filter((r) => r.status === 'downloaded').length,
  unresolved: report.filter((r) => r.status === 'unresolved'),
};
const healthStore = new Store(databasePath());
try {
  healthStore.saveState('artwork-health', health);
} finally {
  healthStore.close();
}
console.log(health);
