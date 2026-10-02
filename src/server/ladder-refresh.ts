import { randomUUID } from 'node:crypto';
import { championsContract, ladderSources } from '../domain/ladder-contracts';
import { setTimeout as pace } from 'node:timers/promises';
import {
  parseChampions,
  parseShowdown,
  discoverShowdown,
  type LadderEnvironment,
  type LadderSummary,
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
    const host = new URL(url).hostname;
    if ((this.store.state<number>(`ladder-cooldown:${host}`) ?? 0) > Date.now())
      throw new Error(`${host}: provider cooldown; retry later`);
    const munch = host === 'www.munchstats.com';
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
    const retry = response.headers.get('retry-after');
    if (response.status === 429 || (response.status >= 500 && retry)) {
      const duration = retry
        ? Number.isFinite(Number(retry))
          ? Number(retry) * 1000
          : Date.parse(retry) - Date.now()
        : 60000;
      this.store.saveState(
        `ladder-cooldown:${host}`,
        Date.now() +
          Math.max(1000, Number.isFinite(duration) ? duration : 60000),
      );
    }
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
export async function collectShowdown(
  read: Read,
  months?: string[],
  saved: LadderSummary[] = [],
) {
  const index = await read('https://www.smogon.com/stats/');
  const listed = [
    ...index.body.matchAll(/href="(20\d{2}-(?:0[1-9]|1[0-2]))\/"/g),
  ]
    .map((m) => m[1])
    .sort();
  const latest = listed.at(-1);
  if (!latest) throw new Error('Smogon month discovery changed');
  const selected =
    months ??
    listed.filter(
      (month) => month >= ladderSources.showdown.firstSupportedMonth,
    );
  const drafts = [];
  for (const month of selected) {
    if (!listed.includes(month))
      throw new Error(`Smogon has not published ${month}`);
    const listing = await read(`https://www.smogon.com/stats/${month}/`);
    const reports = discoverShowdown(listing.body, month);
    if (!reports.length)
      throw new Error(`No audited Champions VGC formats in ${month}`);
    for (const report of reports) {
      if (
        !months &&
        month !== latest &&
        saved.some(
          (d) =>
            d.month === month &&
            d.formatId === report.formatId &&
            d.rating === report.rating,
        )
      )
        continue;
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
  const contract = championsContract();
  const official = await read(contract.announcement, true);
  if (
    !official.body.includes(
      `Ranked Battles Season ${contract.season} will follow Regulation Set ${contract.regulation}`,
    ) ||
    !official.body.includes(contract.durationEvidence)
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
  const draft = parseChampions(inputs, snapshots, contract);
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
  const ladder = new LadderStore(store);
  const owner = randomUUID();
  if (!store.acquireLease(owner, Date.now()))
    throw new Error('Another ingestion process is running');
  const controller = new AbortController();
  const signal = AbortSignal.any([
    controller.signal,
    AbortSignal.timeout(45 * 60000),
    ...(options.signal ? [options.signal] : []),
  ]);
  const client = new LadderClient(store, signal);
  const read = options.read ?? client.read.bind(client);
  const timer = setInterval(() => {
    if (!store.renewLease(owner))
      controller.abort(new Error('Ingestion lease lost'));
  }, 30000);
  const checkedRead: Read = async (url, cache) => {
    signal.throwIfAborted();
    store.assertLease(owner);
    const result = await read(url, cache);
    signal.throwIfAborted();
    store.assertLease(owner);
    return result;
  };
  const attemptedAt = new Date().toISOString();
  const healthKey = `health:ladder-${environment}`;
  const priorHealth = store.state<Record<string, unknown>>(healthKey) ?? {};
  store.saveState(healthKey, { ...priorHealth, attemptedAt, state: 'running' });
  try {
    const drafts =
      environment === 'showdown'
        ? await collectShowdown(checkedRead, options.months, ladder.catalog())
        : [await collectChampions(checkedRead, options.progress)];
    store.assertLease(owner);
    if (!drafts.length) {
      store.saveState('ladder-status:' + environment, {
        state: 'success',
        attemptedAt: new Date().toISOString(),
        message: 'No missing supported periods',
      });
      store.saveState(healthKey, {
        ...priorHealth,
        attemptedAt,
        checkedAt: new Date().toISOString(),
        state: 'ok',
      });
      return [];
    }
    const datasets = ladder.publishBatch(drafts, owner);
    const publications = datasets.map((d) => d.id).sort();
    store.saveState(healthKey, {
      ...priorHealth,
      attemptedAt,
      checkedAt: new Date().toISOString(),
      state: 'ok',
      observedAt: drafts
        .flatMap((d) => d.snapshots)
        .map((s) => s.retrievedAt)
        .sort()
        .at(-1),
      changedAt:
        JSON.stringify(priorHealth.publications) ===
        JSON.stringify(publications)
          ? priorHealth.changedAt
          : new Date().toISOString(),
      publishedAt: datasets
        .map((d) => d.publishedAt)
        .sort()
        .at(-1),
      publications,
    });
    return datasets;
  } catch (error) {
    if (!store.renewLease(owner)) throw error;
    store.saveState(healthKey, {
      ...priorHealth,
      attemptedAt,
      state: 'failed',
      message: error instanceof Error ? error.message : String(error),
    });
    ladder.failure(
      environment,
      new Date().toISOString(),
      error instanceof Error ? error.message : 'Source refresh failed',
    );
    throw error;
  } finally {
    clearInterval(timer);
    store.releaseLease(owner);
  }
}
export function nextLadderRefresh(
  store: Store,
  environment: LadderEnvironment,
  now = Date.now(),
) {
  const status = new LadderStore(store).status(environment);
  const due = status
    ? Date.parse(status.attemptedAt) +
      (status.state === 'failure' ? 5 * 60000 : 24 * 3600000)
    : now;
  return Math.max(
    due,
    store.state<number>(
      `ladder-cooldown:${environment === 'showdown' ? 'www.smogon.com' : 'www.munchstats.com'}`,
    ) ?? 0,
  );
}
