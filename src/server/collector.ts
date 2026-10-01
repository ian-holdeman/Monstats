import { setTimeout as delay } from 'node:timers/promises';
import { z } from 'zod';
import {
  completedIds,
  classifySheet,
  normalizeEvent,
} from '../domain/normalize';
import { Store } from './store';
import type { NormalizedEvent, Snapshot } from '../domain/types';
const origin = 'https://play.limitlesstcg.com';
const listings = z.array(
  z.object({
    id: z.string().regex(/^[a-f0-9]{24}$/),
    game: z.string(),
    format: z.string(),
    date: z.iso.datetime(),
    players: z.number().int().nonnegative(),
  }),
);
export async function fetchBounded(
  url: string,
  fetcher: typeof fetch = fetch,
): Promise<string> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const r = await fetcher(url, {
        signal: AbortSignal.timeout(20000),
        headers: { 'User-Agent': 'Monstats/0.1 personal source audit' },
      });
      if (r.status === 429 || r.status >= 500) {
        if (attempt === 1) throw new Error(`Provider HTTP ${r.status}`);
        const seconds = Number(r.headers.get('retry-after') ?? 1);
        if (!Number.isFinite(seconds) || seconds > 30)
          throw new Error('Provider requested longer cooldown; retry later');
        await delay(Math.max(1, seconds) * 1000);
        continue;
      }
      if (!r.ok) throw new Error(`Provider HTTP ${r.status}`);
      if (Number(r.headers.get('content-length') ?? 0) > 10000000)
        throw new Error('Response exceeds snapshot limit');
      const body = await r.text();
      if (body.length > 10000000)
        throw new Error('Response exceeds snapshot limit');
      return body;
    } catch (error) {
      if (
        attempt === 1 ||
        (error instanceof Error &&
          /HTTP 4|cooldown|snapshot limit/.test(error.message))
      )
        throw error;
      await delay(1000);
    }
  }
  throw new Error('Provider failed');
}
export async function collect(
  store: Store,
  asOf: string,
  limit = 3,
  fetcher: typeof fetch = fetch,
): Promise<NormalizedEvent[]> {
  if (!Number.isInteger(limit) || limit < 1 || limit > 20)
    throw new Error('Event limit must be 1–20');
  const refs: Snapshot[] = [];
  const read = async (path: string) => {
    const url = origin + path;
    const body = await fetchBounded(url, fetcher);
    refs.push(store.snapshot(url, body, new Date().toISOString()));
    await delay(150);
    return body;
  };
  const list = listings.parse(
    JSON.parse(await read('/api/tournaments?game=VGC&format=M-C&limit=50')),
  );
  const completed = completedIds(
    await read('/tournaments/completed?game=VGC&format=M-C&show=100'),
  );
  const end = Date.parse(asOf),
    start = end - 30 * 86400000;
  const candidates = list
    .filter(
      (e) =>
        completed.has(e.id) &&
        e.game === 'VGC' &&
        e.format === 'M-C' &&
        e.players >= 25 &&
        Date.parse(e.date) >= start &&
        Date.parse(e.date) <= end,
    )
    .slice(0, limit);
  if (!candidates.length)
    throw new Error(
      'No completed M-C candidates found within the audit bounds',
    );
  const events: NormalizedEvent[] = [];
  for (const candidate of candidates) {
    const offset = refs.length;
    const details = JSON.parse(
      await read(`/api/tournaments/${candidate.id}/details`),
    );
    const standings = JSON.parse(
      await read(`/api/tournaments/${candidate.id}/standings`),
    );
    const pairings = JSON.parse(
      await read(`/api/tournaments/${candidate.id}/pairings`),
    );
    const page = await read(`/tournament/${candidate.id}`);
    const event = normalizeEvent(
      details,
      standings,
      pairings,
      classifySheet(page, `${origin}/tournament/${candidate.id}`),
      [...refs.slice(0, 2), ...refs.slice(offset)],
      true,
    );
    if (
      event.id !== candidate.id ||
      event.regulation !== 'M-C' ||
      event.date !== candidate.date
    )
      throw new Error('Source event identity changed during collection');
    events.push(event);
  }
  return events;
}
