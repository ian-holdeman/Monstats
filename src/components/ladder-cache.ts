import { BoundedCache } from '@/domain/bounded-cache';
import type { LadderDataset, LadderPokemon } from '@/domain/ladder';
export type PublicLadder = Omit<LadderDataset, 'snapshots' | 'excluded'> & {
  excludedCount: number;
  sources: string[];
};
export const cohortCache = new BoundedCache<PublicLadder>(8);
export const detailCache = new BoundedCache<LadderPokemon>(24);
const inflight = new Map<string, Promise<LadderPokemon>>();
export function readDetail(publication: string, pokemon: string) {
  const key = `${publication}:${pokemon}`;
  const cached = detailCache.get(key);
  if (cached) return Promise.resolve(cached);
  const pending = inflight.get(key);
  if (pending) return pending;
  const request = fetch(
    `/ladder/${publication}?pokemon=${encodeURIComponent(pokemon)}`,
  )
    .then(async (r) => {
      if (!r.ok) throw new Error('Saved detail unavailable');
      const value = await r.json();
      if (
        value.publication !== publication ||
        value.row?.id !== pokemon ||
        !value.row.builds
      )
        throw new Error('Invalid saved detail');
      return detailCache.set(key, value.row);
    })
    .finally(() => inflight.delete(key));
  inflight.set(key, request);
  return request;
}
