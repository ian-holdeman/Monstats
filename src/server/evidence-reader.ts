import { BoundedCache } from '../domain/bounded-cache';
import { EVIDENCE_VERSION } from '../domain/evidence';
import type { DatabaseSync } from 'node:sqlite';
import { readEvidence } from './evidence-index';
import type { Aggregate } from '../domain/types';

const caches = new WeakMap<DatabaseSync, BoundedCache<Aggregate>>();
// Read-only supplement: no provider reads, calculation or missing-index builds.
export function withEvidence(
  publication: string,
  view: Aggregate,
  db?: DatabaseSync,
) {
  if (view.pokemon.every((r) => r.evidence?.version === EVIDENCE_VERSION))
    return view;
  if (!db) return view;
  let cache = caches.get(db);
  if (!cache) {
    cache = new BoundedCache<Aggregate>(32);
    caches.set(db, cache);
  }
  const key = JSON.stringify([publication, EVIDENCE_VERSION, view.options]);
  const cached = cache.get(key);
  if (cached) return cached;
  try {
    const saved = readEvidence(db, publication, view.options);
    if (!saved) return view;
    return cache.set(key, {
      ...view,
      pokemon: view.pokemon.map((r) => ({
        ...r,
        evidence: saved.pokemon[r.id],
      })),
      matchups: Object.fromEntries(
        Object.entries(view.matchups).map(([id, rows]) => [
          id,
          rows.map((r) => ({ ...r, ...saved.matchups[id]?.[r.id] })),
        ]),
      ),
    });
  } catch {
    return view;
  }
}
