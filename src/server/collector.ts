import { setTimeout as delay } from 'node:timers/promises';
import { z } from 'zod';
import {
  completedIds,
  classifySheet,
  normalizeEvent,
} from '../domain/normalize';
import { eligibility, provenance } from '../domain/sources';
import { requireRegulation } from '../domain/regulations';
import { Store } from './store';
import type {
  CollectionReport,
  NormalizedEvent,
  Snapshot,
} from '../domain/types';
const origin = 'https://play.limitlesstcg.com';
const listing = z
  .object({
    id: z.string().regex(/^[a-f0-9]{24}$/),
    game: z.string(),
    format: z.string(),
    date: z.iso.datetime(),
    players: z.unknown(),
  })
  .passthrough();
type Listing = z.infer<typeof listing>;
type Progress = {
  asOf: string;
  apiPage: number;
  completedPage: number;
  apiDone: boolean;
  completedDone: boolean;
  candidates: Listing[];
  completed: string[];
  snapshots: Snapshot[];
  pageHashes: string[];
};
export type CollectorOptions = {
  regulation?: string;
  stage?: boolean;
  officialOnly?: boolean;
  maxReads?: number;
  force?: boolean;
  heartbeat?: () => void;
  signal?: AbortSignal;
};
export function retryDelay(value: string | null, now = Date.now()) {
  if (!value) return 1000;
  const seconds = Number(value);
  const milliseconds = Number.isFinite(seconds)
    ? seconds * 1000
    : Date.parse(value) - now;
  if (!Number.isFinite(milliseconds) || milliseconds > 60000)
    throw new Error('Provider requested longer cooldown; retry later');
  return Math.max(1000, milliseconds);
}
export async function fetchBounded(
  url: string,
  fetcher: typeof fetch = fetch,
  signal?: AbortSignal,
): Promise<string> {
  for (let attempt = 0; attempt < 2; attempt++) {
    let response: Response;
    try {
      response = await fetcher(url, {
        signal: signal
          ? AbortSignal.any([signal, AbortSignal.timeout(20000)])
          : AbortSignal.timeout(20000),
        headers: {
          'User-Agent': 'Monstats/0.2 personal analytics source audit',
        },
      });
    } catch (error) {
      if (attempt === 1 || signal?.aborted) throw error;
      await delay(1000, undefined, { signal });
      continue;
    }
    if (response.status === 429 || response.status >= 500) {
      if (attempt === 1) throw new Error(`Provider HTTP ${response.status}`);
      await delay(retryDelay(response.headers.get('retry-after')), undefined, {
        signal,
      });
      continue;
    }
    if (!response.ok) throw new Error(`Provider HTTP ${response.status}`);
    if (Number(response.headers.get('content-length') ?? 0) > 10000000)
      throw new Error('Response exceeds snapshot limit');
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    if (response.body) {
      const reader = response.body.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          bytes += value.length;
          if (bytes > 10000000) {
            await reader.cancel();
            throw new Error('Response exceeds snapshot limit');
          }
          chunks.push(value);
        }
      } finally {
        reader.releaseLock();
      }
    }
    return Buffer.concat(chunks).toString('utf8');
  }
  throw new Error('Provider failed');
}
export function completedPagination(html: string, current: number) {
  const pagination = html.match(
    /<ul\b[^>]*class="[^"]*pagination[^"]*"[^>]*>/,
  )?.[0];
  if (pagination) {
    const actual = Number(pagination.match(/data-current="(\d+)"/)?.[1]);
    const max = Number(pagination.match(/data-max="(\d+)"/)?.[1]);
    if (actual !== current || !Number.isInteger(max) || max < current)
      throw new Error('Unrecognized completed pagination');
    return current < max;
  }
  const pages = [
    ...html.matchAll(/href="[^"]*[?&](?:amp;)?page=(\d+)[^"]*"/g),
  ].map((m) => Number(m[1]));
  return pages.some((p) => p > current);
}
export async function collect(
  store: Store,
  asOf: string,
  options: CollectorOptions = {},
  fetcher: typeof fetch = fetch,
): Promise<NormalizedEvent[]> {
  const regulation = options.regulation ?? store.activeRegulation();
  requireRegulation(regulation, store.config);
  const progressKey = `limitless:${regulation}:progress`;
  const end = Date.parse(asOf),
    start = end - 30 * 86400000;
  if (!Number.isFinite(end)) throw new Error('Invalid collection window');
  const maxReads = options.maxReads ?? 500;
  if (!Number.isInteger(maxReads) || maxReads < 1 || maxReads > 10000)
    throw new Error('Invalid request budget');
  const saved =
    store.state<Progress>(progressKey) ??
    (regulation === 'M-C' ? store.state<Progress>('limitless-progress') : null);
  const progress: Progress =
    saved &&
    end - Date.parse(saved.asOf) >= 0 &&
    end - Date.parse(saved.asOf) < 86400000
      ? saved
      : {
          asOf,
          apiPage: 1,
          completedPage: 1,
          apiDone: false,
          completedDone: false,
          candidates: [],
          completed: [],
          snapshots: [],
          pageHashes: [],
        };
  let reads = 0;
  const rateAware = (async (
    input: string | URL | Request,
    init?: RequestInit,
  ) => {
    const until = store.state<number>('limitless-next-request') ?? 0;
    const cooldown = until - Date.now();
    if (cooldown > 60000)
      throw new Error('Rate limit cooldown; collection will resume later');
    if (cooldown > 0)
      await delay(cooldown, undefined, { signal: options.signal });
    options.heartbeat?.();
    const response = await fetcher(input, init);
    const rate = response.headers.get('ratelimit');
    const remaining = Number(rate?.match(/\br=(\d+)/)?.[1]);
    const reset = Number(rate?.match(/\bt=(\d+)/)?.[1]);
    if (rate && Number.isFinite(remaining) && Number.isFinite(reset))
      store.saveState(
        'limitless-next-request',
        Date.now() + Math.ceil((reset / Math.max(1, remaining)) * 1000),
      );
    if (response.status === 429) {
      const value = response.headers.get('retry-after');
      const seconds = Number(value);
      const duration = value
        ? Number.isFinite(seconds)
          ? seconds * 1000
          : Date.parse(value) - Date.now()
        : 1000;
      if (Number.isFinite(duration))
        store.saveState(
          'limitless-next-request',
          Date.now() + Math.max(1000, duration),
        );
    }
    return response;
  }) as typeof fetch;
  const read = async (path: string) => {
    options.signal?.throwIfAborted();
    options.heartbeat?.();
    if (reads >= maxReads)
      throw new Error(
        'Request budget reached; collection remains partial and will resume',
      );
    reads++;
    const url = origin + path;
    const body = await fetchBounded(url, rateAware, options.signal);
    const ref = store.snapshot(url, body, new Date().toISOString());
    progress.snapshots.push(ref);
    return { body, ref };
  };
  const persist = () => store.saveState(progressKey, progress);
  const report: CollectionReport = {
    asOf,
    discovery: 'partial',
    apiPages: 0,
    completedPages: 0,
    listed: 0,
    completed: 0,
    refreshed: 0,
    cached: 0,
    excluded: [],
    carriedForward: [],
    snapshots: progress.snapshots,
  };
  try {
    while (!progress.apiDone) {
      const { body, ref } = await read(
        `/api/tournaments?game=VGC&format=${regulation}&limit=50&page=${progress.apiPage}`,
      );
      const list = z.array(listing).parse(JSON.parse(body));
      if (list.length && progress.pageHashes.includes(ref.checksum))
        throw new Error('API pagination repeated a page; coverage unresolved');
      progress.pageHashes.push(ref.checksum);
      for (const entry of list) {
        const previous = progress.candidates.find((e) => e.id === entry.id);
        if (previous && JSON.stringify(previous) !== JSON.stringify(entry))
          throw new Error(
            'Listing changed during pagination; restart discovery',
          );
        if (!previous) progress.candidates.push(entry);
      }
      progress.apiDone = !list.length;
      progress.apiPage++;
      persist();
    }
    while (!progress.completedDone) {
      const { body } = await read(
        `/tournaments/completed?game=VGC&format=${regulation}&show=100&page=${progress.completedPage}`,
      );
      const ids = completedIds(body);
      if (
        progress.completedPage > 1 &&
        ids.size &&
        [...ids].every((id) => progress.completed.includes(id))
      )
        throw new Error(
          'Completed pagination repeated a page; coverage unresolved',
        );
      progress.completed = [...new Set([...progress.completed, ...ids])];
      progress.completedDone = !completedPagination(
        body,
        progress.completedPage,
      );
      progress.completedPage++;
      persist();
    }
    report.discovery = 'complete';
    const completed = new Set(progress.completed);
    const events = new Map<string, NormalizedEvent>();
    for (const event of store.current()?.events ?? [])
      if (
        event.regulation === regulation &&
        provenance(event).official !== 'verified' &&
        provenance(event).sources.some((s) => s.provider === 'limitless') &&
        Date.parse(event.date) >= start &&
        Date.parse(event.date) <= end
      )
        events.set(event.id, event);
    const observed = new Set<string>();
    for (const entry of progress.candidates) {
      observed.add(entry.id);
      const excluded = (reason: string, evidence: unknown = entry) => {
        report.excluded.push({ id: entry.id, reason, evidence });
        events.delete(entry.id);
      };
      if (entry.game !== 'VGC' || entry.format !== regulation) {
        excluded('incompatible-format');
        continue;
      }
      if (Date.parse(entry.date) < start || Date.parse(entry.date) > end) {
        excluded('outside-window');
        continue;
      }
      const reason = eligibility(entry.players);
      if (reason) {
        excluded(reason);
        continue;
      }
      if (!completed.has(entry.id)) {
        if (events.has(entry.id)) report.carriedForward.push(entry.id);
        else
          report.excluded.push({
            id: entry.id,
            reason: 'not-confirmed-completed',
            evidence: entry,
          });
        continue;
      }
      const cacheKey = `limitless:${entry.id}:${regulation}`;
      const cached =
        store.cache(cacheKey) ??
        (regulation === 'M-C' ? store.cache(entry.id) : null);
      const cacheAge = end - Date.parse(cached?.retrievedAt ?? '');
      if (
        !options.force &&
        cached &&
        cached.event?.regulation === regulation &&
        cacheAge >= 0 &&
        cacheAge < 86400000 &&
        cached.event?.date === entry.date &&
        cached.event.players === entry.players
      ) {
        events.set(entry.id, cached.event);
        report.cached++;
        continue;
      }
      const offset = progress.snapshots.length;
      const details = JSON.parse(
        (await read(`/api/tournaments/${entry.id}/details`)).body,
      );
      if (
        details.id !== entry.id ||
        details.format !== regulation ||
        details.date !== entry.date
      )
        throw new Error('Source event identity changed during collection');
      if (details.players !== entry.players) {
        excluded('contradictory-entrant-count', { listing: entry, details });
        store.saveCache(cacheKey, asOf, null, 'contradictory-entrant-count');
        continue;
      }
      if (
        details.platform !== 'SWITCH' ||
        details.isPublic !== true ||
        details.decklists !== true ||
        (details.specialRules?.length ?? 0) ||
        (details.bannedCards?.length ?? 0)
      ) {
        excluded('unsupported-event', { listing: entry, details });
        store.saveCache(cacheKey, asOf, null, 'unsupported-event');
        continue;
      }
      const standings = JSON.parse(
        (await read(`/api/tournaments/${entry.id}/standings`)).body,
      );
      const pairings = JSON.parse(
        (await read(`/api/tournaments/${entry.id}/pairings`)).body,
      );
      const page = (await read(`/tournament/${entry.id}`)).body;
      const event = normalizeEvent(
        details,
        standings,
        pairings,
        classifySheet(page, `${origin}/tournament/${entry.id}`),
        progress.snapshots.slice(offset),
        true,
      );
      store.saveCache(cacheKey, asOf, event);
      events.set(entry.id, event);
      report.refreshed++;
      persist();
    }
    for (const id of events.keys())
      if (!observed.has(id)) report.carriedForward.push(id);
    return [...events.values()];
  } catch (error) {
    persist();
    throw error;
  } finally {
    report.apiPages = progress.apiPage - 1;
    report.completedPages = progress.completedPage - 1;
    report.listed = progress.candidates.length;
    report.completed = progress.completed.length;
    store.saveState('collection-report', report);
  }
}
