import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { Store } from '../src/server/store';
import { databasePath, dataDirectory } from '../src/server/paths';
import {
  indexKey,
  indexMetadata,
  perspectiveQuery,
} from '../src/server/matchup-index';
import { readMatchups } from '../src/server/matchup-reader';
import type { MatchupRequest } from '../src/domain/dynamic-matchups';

const store = new Store(databasePath(), true);
try {
  const start = performance.now();
  const d = store.current()!;
  const publicationLoadMs = performance.now() - start;
  const meta = indexMetadata(store.db, d.id)!;
  const composition = store.db
    .prepare(
      'SELECT t.composition,count(*) n FROM matchup_teams t JOIN matchup_results r ON r.version=t.version AND (r.left_team=t.id OR r.right_team=t.id) WHERE t.version=? GROUP BY t.composition ORDER BY n DESC',
    )
    .all(indexKey(d.id));
  const a = JSON.parse(String(composition[0].composition)) as string[];
  const rare = JSON.parse(String(composition.at(-1)!.composition)) as string[];
  const common = ['sneasler', 'gholdengo'];
  const base: MatchupRequest = {
    mode: 'compare',
    a,
    b: common,
    source: 'all',
    sheet: 'all',
    official: false,
    minPlayers: 0,
    candidateSize: 1,
    sort: 'difference',
    direction: 'best',
    limit: 50,
    offset: 0,
  };
  const measurements = [];
  let peakHeap = process.memoryUsage().heapUsed,
    maxTurnMs = 0;
  let lastTick = performance.now();
  const interval = setInterval(() => {
    const now = performance.now();
    maxTurnMs = Math.max(maxTurnMs, now - lastTick);
    lastTick = now;
    peakHeap = Math.max(peakHeap, process.memoryUsage().heapUsed);
  }, 10);
  for (const mode of ['compare', 'discover'] as const)
    for (let size = 1; size <= 6; size++)
      for (const [target, b] of [
        ['common', common],
        ['rare', rare],
        ['overall', []],
      ] as const) {
        const q: MatchupRequest = {
          ...base,
          mode,
          a: mode === 'compare' ? a.slice(0, size) : [],
          b: [...b],
          candidateSize: size,
          sort: b.length ? 'difference' : 'winRate',
        };
        const cpu = process.cpuUsage(),
          cold = performance.now();
        const result = await readMatchups(d.id, q);
        const coldMs = performance.now() - cold;
        const cpuMs =
          Object.values(process.cpuUsage(cpu)).reduce((x, y) => x + y, 0) /
          1000;
        const warm = performance.now();
        assert.deepEqual(await readMatchups(d.id, q), result);
        measurements.push({
          mode,
          size,
          target,
          coldMs,
          warmMs: performance.now() - warm,
          cpuMs,
          rankedRows: result.total,
        });
      }
  clearInterval(interval);
  // Numerical saved-publication parity. Legacy name-based tie ordering is intentionally not copied.
  const old = d.views['all:0'];
  let parityRows = 0;
  for (const target of ['incineroar', 'sneasler', 'gholdengo']) {
    for (let offset = 0; ; offset += 50) {
      const result = await readMatchups(d.id, {
        ...base,
        mode: 'discover',
        a: [],
        b: [target],
        candidateSize: 1,
        offset,
      });
      for (const r of result.rows) {
        const prior = old.matchups[target].find((p) => p.id === r.members[0])!;
        assert.equal(r.sample.winRate, prior.winRate);
        assert.equal(r.overall.winRate, prior.baseline);
        assert.equal(r.difference, prior.difference);
        assert.equal(r.sample.matches, prior.matches);
        assert.equal(r.sample.outcomes, prior.outcomes);
        assert.equal(r.sample.events, prior.events);
        assert.equal(r.sample.players, prior.players);
        parityRows++;
      }
      if (offset + 50 >= result.total) break;
    }
  }
  const query = perspectiveQuery(
    d.id,
    { ...base, mode: 'discover', a: [] },
    meta,
    true,
  );
  const plan = store.db
    .prepare(`EXPLAIN QUERY PLAN ${query.sql}`)
    .all(...query.values);
  const report = {
    publication: d.id,
    asOf: d.asOf,
    physicalResults: meta.physicalResults,
    teams: meta.teams,
    publicationLoadMs,
    peakHeapMb: peakHeap / 1048576,
    rssMb: process.memoryUsage().rss / 1048576,
    maxTurnMs,
    common,
    rare,
    parityRows,
    measurements,
    plan,
  };
  const destination = resolve(dataDirectory(), 'matchup-qa');
  await mkdir(destination, { recursive: true });
  await writeFile(
    resolve(destination, 'benchmark.json'),
    JSON.stringify(report, null, 2),
  );
  console.log(
    JSON.stringify(
      {
        publication: d.id,
        publicationLoadMs,
        peakHeapMb: report.peakHeapMb,
        maxTurnMs,
        parityRows,
        measurements,
      },
      null,
      2,
    ),
  );
} finally {
  store.close();
}
