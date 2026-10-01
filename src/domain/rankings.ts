import type { Aggregate, EvidenceFloor } from './types';
export function rankMatchups(
  result: Aggregate,
  selected: string,
  direction: 'best' | 'worst',
  floor: EvidenceFloor,
  sort: 'difference' | 'winRate' = 'difference',
) {
  return (result.matchups[selected] ?? [])
    .filter(
      (r) =>
        r.id !== selected &&
        r.winRate !== null &&
        r[sort] !== null &&
        r.matches >= floor.matches &&
        r.events >= floor.events &&
        r.players >= floor.players,
    )
    .sort(
      (a, b) =>
        (direction === 'best' ? b[sort]! - a[sort]! : a[sort]! - b[sort]!) ||
        b.matches - a.matches ||
        a.name.localeCompare(b.name),
    );
}
