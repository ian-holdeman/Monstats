import { Store } from './store';
import { databasePath } from './paths';
import { indexMetadata, queryMatchups } from './matchup-index';
import { BoundedCache } from '../domain/bounded-cache';
import {
  validateMatchupRequest,
  type MatchupRequest,
  type MatchupResponse,
} from '../domain/dynamic-matchups';
import { scanMatchupGroups } from './matchup-query-worker';

const cache = new BoundedCache<MatchupResponse>(32);
const pending = new Map<string, Promise<MatchupResponse>>();
let active = 0;
const slots: (() => void)[] = [];
async function runBounded<T>(task: () => Promise<T>): Promise<T> {
  if (active >= 2) await new Promise<void>((resolve) => slots.push(resolve));
  else active++;
  try {
    return await task();
  } finally {
    const next = slots.shift();
    if (next) next();
    else active--;
  }
}
export async function readMatchups(id: string, input: MatchupRequest) {
  const path = databasePath(),
    store = new Store(path, true);
  let owned = false;
  try {
    const meta = indexMetadata(store.db, id);
    if (!meta) throw new Error('Matchup index unavailable');
    const request = validateMatchupRequest(
      input,
      new Set(meta.catalog.map((p) => p.id)),
    );
    const key = JSON.stringify([
      path,
      id,
      meta.calculation,
      meta.index,
      meta.options,
      meta.floor,
      request,
    ]);
    const cached = cache.get(key);
    if (cached) return cached;
    const existing = pending.get(key);
    if (existing) return await existing;
    if (pending.size >= 8) throw new Error('Matchup query capacity reached');
    owned = true;
    const result = runBounded(() =>
      queryMatchups(store.db, id, request, (sql, values) =>
        scanMatchupGroups(path, sql, values),
      ),
    )
      .then((value) => cache.set(key, value))
      .finally(() => {
        pending.delete(key);
        store.close();
      });
    pending.set(key, result);
    return await result;
  } finally {
    if (!owned) store.close();
  }
}
