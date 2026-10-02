import type { EvidenceFloor, Options } from './types';
import { sourceSelection } from './filters';
import {
  performanceEvidence,
  evidenceOrder,
  type PerformanceEvidence,
} from './evidence';

export const MATCHUP_CALCULATION = 'joint-perspectives-v1';
export const MATCHUP_INDEX = 'members-results-v2';
export type MatchupRequest = {
  mode: 'compare' | 'discover';
  a: string[];
  b: string[];
  candidateSize: number;
  sort: 'difference' | 'winRate' | 'evidence';
  direction: 'best' | 'worst';
  offset: number;
  limit: number;
  source: string;
  sheet: Options['sheet'];
  minPlayers: number;
  official: boolean;
  hideNotices?: boolean;
};
export type Sample = {
  evidence?: PerformanceEvidence;
  wins: number;
  losses: number;
  outcomes: number;
  winRate: number | null;
  matches: number;
  events: number;
  players: number;
};
export type CombinationRow = {
  key: string;
  members: string[];
  sample: Sample;
  overall: Sample;
  difference: number | null;
  sufficient: boolean;
};
export type MatchupResponse = {
  publication: string;
  calculation: string;
  index: string;
  asOf: string;
  regulation: string;
  floor: EvidenceFloor;
  request: MatchupRequest;
  rows: CombinationRow[];
  total: number;
  catalog: { id: string; name: string }[];
};
export function selection(ids: string[], known: Set<string>) {
  if (!Array.isArray(ids) || ids.length > 6 || new Set(ids).size !== ids.length)
    throw new Error('Invalid selection: use up to six distinct Pokémon');
  if (ids.some((id) => typeof id !== 'string' || !known.has(id)))
    throw new Error('Unknown canonical Pokémon identity');
  return [...ids].sort();
}
export function validateMatchupRequest(
  q: MatchupRequest,
  known: Set<string>,
): MatchupRequest {
  const a = selection(q.a, known),
    b = selection(q.b, known);
  if (
    !['compare', 'discover'].includes(q.mode) ||
    (q.mode === 'compare' && !a.length) ||
    !Number.isInteger(q.candidateSize) ||
    q.candidateSize < 1 ||
    q.candidateSize > 6 ||
    !['difference', 'winRate', 'evidence'].includes(q.sort) ||
    (!b.length && q.sort === 'difference') ||
    !['best', 'worst'].includes(q.direction) ||
    !Number.isInteger(q.offset) ||
    q.offset < 0 ||
    q.offset > 100000 ||
    !Number.isInteger(q.limit) ||
    q.limit < 1 ||
    q.limit > 50 ||
    !['all', 'open', 'closed', 'unknown'].includes(q.sheet) ||
    ![0, 100].includes(q.minPlayers) ||
    typeof q.official !== 'boolean' ||
    (q.hideNotices !== undefined && typeof q.hideNotices !== 'boolean') ||
    typeof q.source !== 'string'
  )
    throw new Error('Invalid matchup request');
  return {
    mode: q.mode,
    candidateSize: q.candidateSize,
    sort: q.sort,
    direction: q.direction,
    offset: q.offset,
    limit: q.limit,
    sheet: q.sheet,
    minPlayers: q.minPlayers,
    official: q.official,
    ...(q.hideNotices !== undefined ? { hideNotices: q.hideNotices } : {}),
    a: q.mode === 'discover' ? [] : a,
    b,
    source: sourceSelection(q.source),
  };
}
export function subsets(members: string[], size: number): string[][] {
  const result: string[][] = [];
  function visit(start: number, chosen: string[]) {
    if (chosen.length === size) {
      result.push(chosen);
      return;
    }
    for (let i = start; i <= members.length - (size - chosen.length); i++)
      visit(i + 1, [...chosen, members[i]]);
  }
  visit(0, []);
  return result;
}
export type Counter = {
  matchEvents?: Map<string, string>;
  eventSources?: Map<string, string[]>;
  wins: number;
  outcomes: number;
  matches: Set<string>;
  events: Set<string>;
  players: Set<string>;
};
export const counter = (): Counter => ({
  matchEvents: new Map(),
  eventSources: new Map(),
  wins: 0,
  outcomes: 0,
  matches: new Set(),
  events: new Set(),
  players: new Set(),
});
export function sample(c: Counter): Sample {
  return {
    wins: c.wins,
    losses: c.outcomes - c.wins,
    outcomes: c.outcomes,
    winRate: c.outcomes ? (c.wins / c.outcomes) * 100 : null,
    matches: c.matches.size,
    events: c.events.size,
    players: c.players.size,
    ...(c.matchEvents
      ? {
          evidence: performanceEvidence(c.matchEvents, c.eventSources),
        }
      : {}),
  };
}
export function sufficient(s: Sample, floor: EvidenceFloor) {
  return (
    s.matches >= floor.matches &&
    s.events >= floor.events &&
    s.players >= floor.players
  );
}
export function combinationRow(
  members: string[],
  conditional: Counter,
  baseline: Counter,
  floor: EvidenceFloor,
): CombinationRow {
  const overall = sample(baseline),
    s = sample(conditional);
  return {
    key: members.join('+'),
    members,
    sample: s,
    overall,
    difference:
      s.winRate === null || overall.winRate === null
        ? null
        : s.winRate - overall.winRate,
    sufficient: sufficient(s, floor),
  };
}
export function rankCombinations(rows: CombinationRow[], q: MatchupRequest) {
  if (q.sort === 'evidence')
    return evidenceOrder(
      rows.filter(
        (r) =>
          r.sufficient &&
          r.sample.winRate !== null &&
          (!q.b.length || r.key !== q.b.join('+')),
      ),
      (r) => r.sample.evidence,
      (r) => r.key,
      (r) => r.sample.matches,
      (r) => r.sample.events,
    );
  const value = (r: CombinationRow) =>
    q.sort === 'difference' ? r.difference! : r.sample.winRate!;
  return rows
    .filter(
      (r) =>
        r.sufficient &&
        r.sample.winRate !== null &&
        (!q.b.length || r.key !== q.b.join('+')),
    )
    .sort(
      (a, b) =>
        (q.direction === 'best' ? value(b) - value(a) : value(a) - value(b)) ||
        b.sample.matches - a.sample.matches ||
        (a.key < b.key ? -1 : a.key > b.key ? 1 : 0),
    );
}
