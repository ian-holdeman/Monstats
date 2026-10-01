import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { dataDirectory } from '../src/server/paths';
// Explicit read-only source audit, never imported by page handlers or the worker.
const targets = [
  ['rk9', 'https://rk9.gg/'],
  ['rk9-terms', 'https://rk9.gg/terms'],
  ['labmaus', 'https://labmaus.net/'],
  ['victory-road', 'https://victoryroad.pro/'],
  ['victory-road-circuit', 'https://circuit.victoryroad.pro/'],
  ['pokedata', 'https://pokedata.ovh/standings2/'],
  ['pikalytics', 'https://pikalytics.com/'],
  ['munchstats-about', 'https://www.munchstats.com/about/'],
  ['smogon-index', 'https://www.smogon.com/stats/'],
  ['showdown-replays', 'https://replay.pokemonshowdown.com/'],
];
const followups = [
  ['rk9-events', 'https://rk9.gg/events/pokemon'],
  ['victory-road-september', 'https://victoryroad.pro/vr-sep26-2/'],
  [
    'victory-road-details',
    'https://circuit.victoryroad.pro/tournament/vr-sep26-2',
  ],
  ['smogon-august', 'https://www.smogon.com/stats/2026-08/'],
  ['munchstats-champions', 'https://www.munchstats.com/'],
  ['pokedata-frankfurt', 'https://pokedata.ovh/standings2/'],
];
const official = [
  ['rk9-frankfurt', 'https://rk9.gg/event/pokemon-frankfurt-2027'],
  ['rk9-vgc-details', 'https://rk9.gg/tournament/FR002-fiunEHp9wx4mh4'],
  ['pokedata-frankfurt-masters', 'https://pokedata.ovh/standings2/'],
  [
    'munchstats-detail',
    'https://www.munchstats.com/champions/doubles/Rillaboom',
  ],
  ['labmaus-home', 'https://labmaus.net/home'],
];
const mode = process.argv.includes('--official')
  ? 'official'
  : process.argv.includes('--followups')
    ? 'followups'
    : 'report';
const directory = resolve(dataDirectory(), 'source-audit');
await mkdir(directory, { recursive: true });
const report = [];
for (const [name, url] of mode === 'official'
  ? official
  : mode === 'followups'
    ? followups
    : targets) {
  const retrievedAt = new Date().toISOString();
  if (url.startsWith('https://rk9.gg/') && !url.endsWith('/terms')) {
    report.push({
      name,
      url,
      retrievedAt,
      skipped:
        'RK9 terms section 7 prohibits automated extraction; use the public mirror audit via npm run audit:official',
    });
    continue;
  }
  try {
    const post = name.startsWith('pokedata-frankfurt');
    const response = await fetch(url, {
      signal: AbortSignal.timeout(15000),
      headers: {
        'User-Agent': 'Monstats/0.2 personal source audit',
        ...(post
          ? { 'Content-Type': 'application/x-www-form-urlencoded' }
          : {}),
      },
      ...(post
        ? {
            method: 'POST',
            body: name.endsWith('masters')
              ? 'id=1000070&division=Masters'
              : 'id=1000070',
          }
        : {}),
    });
    const reader = response.body?.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    if (reader)
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.length;
          if (size > 5000000) {
            await reader.cancel();
            throw new Error('Audit response exceeded bound');
          }
          chunks.push(value);
        }
      } finally {
        reader.releaseLock();
      }
    const body = Buffer.concat(chunks).toString('utf8');
    await writeFile(resolve(directory, `${name}.html`), body);
    const links = [...body.matchAll(/href=["']([^"']+)["']/g)]
      .map((m) => m[1])
      .filter((s) =>
        /rk9|limitless|pokemon|smogon|stats|champion|api|terms|privacy|github/i.test(
          s,
        ),
      );
    report.push({
      name,
      url,
      finalUrl: response.url,
      status: response.status,
      retrievedAt,
      bytes: size,
      checksum: createHash('sha256').update(body).digest('hex'),
      links: [...new Set(links)].slice(0, 40),
    });
  } catch (error) {
    report.push({
      name,
      url,
      retrievedAt,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
await writeFile(
  resolve(directory, `${mode}.json`),
  JSON.stringify(report, null, 2),
);
console.log(JSON.stringify(report, null, 2));
