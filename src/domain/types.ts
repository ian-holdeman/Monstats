export type Visibility = 'open' | 'closed' | 'unknown';
export type Sheet = {
  visibility: Visibility;
  basis: 'verified' | 'assumption' | 'unknown';
  evidence: string;
};
export type Slot = {
  id: string;
  name: string;
  originalName: string;
  originalId: string | null;
  derivedForm: string | null;
  item: string | null;
  ability: string | null;
  moves: string[] | null;
  nature: string | null;
  stats: Record<string, unknown> | null;
};
export type Phase = {
  phase: number;
  type: string;
  mode: string;
  rounds: number;
};
export type Match = {
  id: string;
  phase: number;
  round: number;
  player1: string;
  player2: string | null;
  winner: string | number | null;
  administrative?: boolean;
};
export type Quarantine = { kind: string; reason: string; evidence: unknown };
export type Snapshot = { url: string; checksum: string; retrievedAt: string };
export type NormalizedEvent = {
  id: string;
  name: string;
  regulation: string;
  date: string;
  completed: boolean;
  archived?: boolean;
  platform: string;
  players: number;
  sheet: Sheet;
  phases: Phase[];
  registrations: {
    player: string;
    slots: Slot[] | null;
    drop: number | null;
  }[];
  matches: Match[];
  quarantine: Quarantine[];
  snapshots: Snapshot[];
};
export type Options = {
  regulation: string;
  asOf: string;
  days: number;
  sheet: Visibility | 'all';
  minPlayers: number;
};
export type EvidenceFloor = {
  matches: number;
  events: number;
  players: number;
};
export type PokemonRow = {
  id: string;
  name: string;
  registrations: number;
  usage: number;
  wins: number;
  outcomes: number;
  matches: number;
  winRate: number | null;
};
export type MatchupRow = {
  id: string;
  name: string;
  wins: number;
  outcomes: number;
  matches: number;
  winRate: number | null;
  baseline: number | null;
  difference: number | null;
  events: number;
  players: number;
};
export type Aggregate = {
  pokemon: PokemonRow[];
  matchups: Record<string, MatchupRow[]>;
  coverage: {
    events: number;
    registrations: number;
    entrants: number;
    matches: number;
    excludedMatches: number;
    assumptions: number;
    from: string | null;
    to: string | null;
  };
  options: Options;
};
export type PublishedDataset = {
  id: string;
  publishedAt: string;
  asOf: string;
  normalizationVersion: string;
  calculationVersion: string;
  scope: string;
  events: NormalizedEvent[];
  views: Record<string, Aggregate>;
  floor: EvidenceFloor;
};
export type RefreshState = {
  state: 'success' | 'failure';
  attemptedAt: string;
  message: string;
};
