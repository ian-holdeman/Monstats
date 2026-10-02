import type { Aggregate, EvidenceFloor } from './types';
import { evidenceOrder } from './evidence';
// Response semantics change without rebuilding statistical indexes.
export const MATCHUP_RANKING = 'baseline-sign-v1';
export function matchupGroup(
  difference: number | null,
  direction: 'best' | 'worst',
) {
  return (
    difference !== null &&
    Number.isFinite(difference) &&
    (direction === 'best' ? difference >= 0 : difference < 0)
  );
}
export function rankMatchups(
  result: Aggregate,
  selected: string,
  direction: 'best' | 'worst',
  floor: EvidenceFloor,
  sort: 'difference' | 'winRate' | 'evidence' = 'difference',
) {
  const rows = (result.matchups[selected] ?? []).filter(
    (r) =>
      r.id !== selected &&
      r.winRate !== null &&
      Number.isFinite(r.winRate) &&
      matchupGroup(r.difference, direction) &&
      r.matches >= floor.matches &&
      r.events >= floor.events &&
      r.players >= floor.players,
  );
  if (sort === 'evidence')
    return evidenceOrder(
      rows,
      (r) => r.evidence,
      (r) => r.id,
      (r) => r.matches,
      (r) => r.events,
    );
  return rows.sort(
    (a, b) =>
      (direction === 'best' ? b[sort]! - a[sort]! : a[sort]! - b[sort]!) ||
      b.matches - a.matches ||
      a.name.localeCompare(b.name) ||
      a.id.localeCompare(b.id),
  );
}
