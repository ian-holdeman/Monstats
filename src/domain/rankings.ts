import type { Aggregate, EvidenceFloor } from './types';
import { evidenceOrder } from './evidence';
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
      (sort === 'evidence' || r[sort] !== null) &&
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
      a.name.localeCompare(b.name),
  );
}
