import { setTimeout as pace } from 'node:timers/promises';
import {
  parseChampions,
  parseShowdown,
  discoverShowdown,
  type LadderEnvironment,
} from '../domain/ladder';
import type { Snapshot } from '../domain/types';
import { LadderStore } from './ladder-store';
import type { Store } from './store';
type Read = (
  url: string,
  cache?: boolean,
) => Promise<{ body: string; snapshot: Snapshot }>;
export class LadderClient {
  constructor(
    readonly store: Store,
    readonly signal?: AbortSignal,
    readonly fetcher: typeof fetch = fetch,
  ) {}
  async read(url: string, cache = false) {
    if (cache) {
      const saved = this.store.state<Snapshot>(`ladder-source:${url}`);
      if (saved && Date.now() - Date.parse(saved.retrievedAt) < 24 * 3600000) {
        const row = this.store.db
          .prepare('SELECT body FROM snapshots WHERE checksum=?')
          .get(saved.checksum);
        if (row) return { body: String(row.body), snapshot: saved };
      }
    }
    const munch = new URL(url).hostname === 'www.munchstats.com';
    if (munch) {
      const due = this.store.state<number>('ladder-next-read:munchstats') ?? 0;
      if (due > Date.now())
        await pace(due - Date.now(), undefined, { signal: this.signal });
      this.store.saveState('ladder-next-read:munchstats', Date.now() + 10000);
    }
    const response = await this.fetcher(url, {
      signal: this.signal
        ? AbortSignal.any([this.signal, AbortSignal.timeout(45000)])
        : AbortSignal.timeout(45000),
      headers: { 'User-Agent': 'Monstats local source audit' },
    });
    if (!response.ok)
      throw new Error(
        `${new URL(url).hostname}: HTTP ${response.status} at ${url}`,
      );
    const body = await response.text();
    const snapshot = this.store.snapshot(url, body, new Date().toISOString());
    this.store.saveState(`ladder-source:${url}`, snapshot);
    return { body, snapshot };
  }
}
export async function collectShowdown(read: Read, months?: string[]) {
  const index = await read('https://www.smogon.com/stats/');
  const listed = [
    ...index.body.matchAll(/href="(20\d{2}-(?:0[1-9]|1[0-2]))\/"/g),
  ]
    .map((m) => m[1])
    .sort();
  const latest = listed.at(-1);
  if (!latest) throw new Error('Smogon month discovery changed');
  const selected = months ?? [...new Set(['2026-08', latest])];
  const drafts = [];
  for (const month of selected) {
    if (!listed.includes(month))
      throw new Error(`Smogon has not published ${month}`);
    const listing = await read(`https://www.smogon.com/stats/${month}/`);
    const reports = discoverShowdown(listing.body, month);
    if (!reports.length)
      throw new Error(`No audited Champions VGC formats in ${month}`);
    for (const report of reports) {
      const base = `https://www.smogon.com/stats/${month}/`,
        filename = `${report.formatId}-${report.rating}`;
      const usage = await read(`${base}${filename}.txt`, true);
      const chaos = await read(`${base}chaos/${filename}.json`, true);
      drafts.push(
        parseShowdown(usage.body, JSON.parse(chaos.body), {
          ...report,
          snapshots: [
            index.snapshot,
            listing.snapshot,
            usage.snapshot,
            chaos.snapshot,
          ],
        }),
      );
    }
  }
  return drafts;
}
export async function collectChampions(
  read: Read,
  progress?: (done: number, total: number) => void,
) {
  const official = await read(
    'https://champions-news.pokemon-home.com/en/page/822.html',
    true,
  );
  if (
    !/Ranked Battles Season M-6 will follow Regulation Set M-C/.test(
      official.body,
    ) ||
    !/September 9, 2026, at 02:00 UTC to Wednesday, October 7, 2026, at 01:59 UTC/.test(
      official.body,
    )
  )
    throw new Error('Official Champions season contract changed');
  const first = await read(
    'https://www.munchstats.com/api/championsdoubles/0/Rillaboom',
  );
  const initial = JSON.parse(first.body);
  const names = initial.pokemon_names;
  if (!Array.isArray(names) || !names.length)
    throw new Error('Champions ranking list missing');
  const inputs = [initial],
    snapshots = [official.snapshot, first.snapshot];
  for (const [name] of names) {
    if (name === 'Rillaboom') continue;
    const url = `https://www.munchstats.com/api/championsdoubles/0/${encodeURIComponent(name)}`;
    let record = await read(url, true);
    if (JSON.parse(record.body).champions_updated !== initial.champions_updated)
      record = await read(url);
    inputs.push(JSON.parse(record.body));
    snapshots.push(record.snapshot);
    progress?.(inputs.length, names.length);
  }
  // A second roster check prevents publication across a capture/ranking change during a long sweep.
  const final = await read(
    'https://www.munchstats.com/api/championsdoubles/0/Rillaboom',
  );
  snapshots.push(final.snapshot);
  if (
    JSON.stringify(JSON.parse(final.body).pokemon_names) !==
      JSON.stringify(names) ||
    JSON.parse(final.body).champions_updated !== initial.champions_updated
  )
    throw new Error(
      'Champions capture changed during collection; retry required',
    );
  const draft = parseChampions(inputs, snapshots);
  if (
    draft.detailCoverage + draft.excluded.filter((v) => !v.pokemon).length !==
    names.length
  )
    throw new Error('Incomplete Champions detail sweep');
  return draft;
}
export async function refreshLadder(
  store: Store,
  environment: LadderEnvironment,
  options: {
    signal?: AbortSignal;
    months?: string[];
    read?: Read;
    progress?: (done: number, total: number) => void;
  } = {},
) {
  const ladder = new LadderStore(store),
    client = new LadderClient(store, options.signal);
  const read = options.read ?? client.read.bind(client);
  try {
    const drafts =
      environment === 'showdown'
        ? await collectShowdown(read, options.months)
        : [await collectChampions(read, options.progress)];
    return ladder.publishBatch(drafts);
  } catch (error) {
    ladder.failure(
      environment,
      new Date().toISOString(),
      error instanceof Error ? error.message : 'Source refresh failed',
    );
    throw error;
  }
}
export function nextLadderRefresh(
  store: Store,
  environment: LadderEnvironment,
  now = Date.now(),
) {
  const status = new LadderStore(store).status(environment);
  return status
    ? Date.parse(status.attemptedAt) +
        (status.state === 'failure' ? 5 * 60000 : 24 * 3600000)
    : now;
}
