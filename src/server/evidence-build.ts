import { aggregate } from '../domain/analytics';
import { EVIDENCE_VERSION } from '../domain/evidence';
import type {
  Aggregate,
  NormalizedEvent,
  PokemonRow,
  MatchupRow,
} from '../domain/types';

// Called only by the explicit backfill; source rows are never changed.
export function deriveEvidence(view: Aggregate, events: NormalizedEvent[]) {
  if (view.pokemon.every((r) => r.evidence?.version === EVIDENCE_VERSION))
    return view;
  const derived = aggregate(events, view.options);
  const byPokemon = new Map(derived.pokemon.map((r) => [r.id, r]));
  const byMatchup = new Map(
    Object.entries(derived.matchups).map(([id, rows]) => [
      id,
      new Map(rows.map((r) => [r.id, r])),
    ]),
  );
  const same = (a: PokemonRow | MatchupRow, b?: PokemonRow | MatchupRow) =>
    b &&
    a.wins === b.wins &&
    a.outcomes === b.outcomes &&
    a.matches === b.matches &&
    a.winRate === b.winRate;
  return {
    ...view,
    pokemon: view.pokemon.map((r) => {
      const b = byPokemon.get(r.id);
      return same(r, b) ? { ...r, evidence: b!.evidence } : r;
    }),
    matchups: Object.fromEntries(
      Object.entries(view.matchups).map(([id, rows]) => [
        id,
        rows.map((r) => {
          const b = byMatchup.get(id)?.get(r.id);
          return same(r, b) && r.baseline === b!.baseline
            ? {
                ...r,
                evidence: b!.evidence,
                baselineEvidence: b!.baselineEvidence,
              }
            : r;
        }),
      ]),
    ),
  };
}
