import type { PerformanceEvidence } from './evidence';
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
  originalForm?: string;
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
export type SourceRef = {
  provider: string;
  originalId: string;
  url: string;
  role?: 'records' | 'original' | 'metadata';
};
export type Provenance = {
  // Only adapters with evidenced original IDs may supply a shared canonical key.
  canonicalEvent: string;
  participantNamespace: string;
  environment: 'champions-cartridge' | 'showdown' | 'aggregate-ladder';
  official: 'verified' | 'unknown';
  population: 'registrations' | 'published-top-teams';
  sources: SourceRef[];
  division?: 'masters' | 'senior' | 'junior' | 'unknown';
  eventType?: 'regional' | 'special' | 'international' | 'worlds';
  season?: string;
  roster?: 'complete' | 'supplemental' | 'selective';
  regulationEvidence?: string;
  divisionEvidence?: string;
  entrantEvidence?: number[];
  seriesGranularity?: 'round-result';
  seriesEvidence?: string;
};
export type RecordAccounting = {
  registrations: number;
  malformedRegistrations: number;
  matchRecords: number;
  duplicateMatchRecords: number;
  malformedMatchRecords: number;
  conflictingMatchRecords: number;
};
export type NormalizedEvent = {
  id: string;
  name: string;
  regulation: string;
  date: string;
  endsAt?: string;
  completed: boolean;
  archived?: boolean;
  platform: string;
  players: number;
  sheet: Sheet;
  phases: Phase[];
  registrations: {
    player: string;
    sourcePlayer?: string;
    slots: Slot[] | null;
    drop: number | null;
  }[];
  matches: Match[];
  quarantine: Quarantine[];
  snapshots: Snapshot[];
  provenance?: Provenance;
  accounting?: RecordAccounting;
};
export type Options = {
  regulation: string;
  asOf: string;
  days: number;
  interval?: CoverageInterval;
  sheet: Visibility | 'all';
  minPlayers: number;
  source?: string;
  official?: boolean;
};
export type CoverageInterval = {
  version: 'regulation-v1';
  regulation: string;
  start: string;
  end: string;
  cutoff: string;
};
export type Distribution = {
  known: number;
  total: number;
  values: { id?: string; name: string; count: number; percent: number }[];
};
export type Builds = Record<
  'items' | 'abilities' | 'moves' | 'natures' | 'spreads' | 'teammates',
  Distribution
>;
export type EvidenceFloor = {
  matches: number;
  events: number;
  players: number;
};
export type PokemonRow = {
  evidence?: PerformanceEvidence;
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
  evidence?: PerformanceEvidence;
  baselineEvidence?: PerformanceEvidence;
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
  builds?: Record<string, Builds>;
};
export type CollectionReport = {
  asOf: string;
  discovery: 'complete' | 'partial';
  apiPages: number;
  completedPages: number;
  listed: number;
  completed: number;
  refreshed: number;
  cached: number;
  excluded: { id: string; reason: string; evidence: unknown }[];
  carriedForward: string[];
  snapshots: Snapshot[];
};
export type PublishedDataset = {
  id: string;
  regulation?: string;
  publishedAt: string;
  asOf: string;
  normalizationVersion: string;
  calculationVersion: string;
  scope: string;
  events: NormalizedEvent[];
  views: Record<string, Aggregate>;
  floor: EvidenceFloor;
  collection?: CollectionReport;
  quarantine?: Quarantine[];
};
export type RefreshState = {
  state: 'success' | 'failure';
  attemptedAt: string;
  message: string;
};
