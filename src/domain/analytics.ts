import type { Aggregate, Match, NormalizedEvent, Options, Slot } from './types';
import {
  MIN_ENTRANTS,
  provenance,
  reconcileSources,
  recordProviders,
} from './sources';
import { buildSummaries } from './builds';
import { sourceMatches } from './filters';
export { rankMatchups } from './rankings';
export const CALCULATION_VERSION = 'masters-cohort-series-v5';
const rate = (wins: number, outcomes: number) =>
  outcomes ? (wins / outcomes) * 100 : null;
export function rejection(match: Match, event: NormalizedEvent): string | null {
  if (!match.player1 || !match.player2) return 'bye-or-automatic-loss';
  if (match.player1 === match.player2) return 'self-pairing';
  if (match.administrative) return 'administrative';
  const phase = event.phases.find((p) => p.phase === match.phase);
  if (
    !phase ||
    ![
      'SWISS',
      'SINGLE_BRACKET',
      'SINGLE_ELIMINATION',
      'SINGLE',
      'DOUBLE_BRACKET',
    ].includes(phase.type) ||
    !(
      ['BO1', 'BO3'].includes(phase.mode) ||
      (phase.mode === 'BO1/BO3' &&
        provenance(event).seriesGranularity === 'round-result' &&
        !!provenance(event).seriesEvidence)
    )
  )
    return 'unsupported-phase';
  if (match.winner === 0) return 'tie';
  if (match.winner === -1) return 'double-loss';
  if (!match.winner) return 'unknown-outcome';
  if (match.winner !== match.player1 && match.winner !== match.player2)
    return 'ambiguous-winner';
  return null;
}
export function eligibleResult(
  match: Match,
  event: NormalizedEvent,
  leftResolved: boolean,
  rightResolved: boolean,
) {
  return !rejection(match, event) && leftResolved && rightResolved;
}
export function selectEvents(events: NormalizedEvent[], options: Options) {
  const end = Date.parse(options.asOf),
    start = end - options.days * 86400000;
  if (!Number.isFinite(end) || options.days <= 0)
    throw new Error('Invalid window');
  return events.filter(
    (e) =>
      e.completed &&
      !e.archived &&
      e.regulation === options.regulation &&
      Number.isInteger(e.players) &&
      e.players >= Math.max(MIN_ENTRANTS, options.minPlayers) &&
      (!options.official || provenance(e).official === 'verified') &&
      sourceMatches(options.source, recordProviders(e)) &&
      (options.sheet === 'all' || e.sheet.visibility === options.sheet) &&
      Date.parse(e.date) >= start &&
      Date.parse(e.date) <= end,
  );
}
type Counter = {
  wins: number;
  outcomes: number;
  matches: Set<string>;
  events: Set<string>;
  players: Set<string>;
};
const counter = (): Counter => ({
  wins: 0,
  outcomes: 0,
  matches: new Set(),
  events: new Set(),
  players: new Set(),
});
function add(
  c: Counter,
  win: boolean,
  key: string,
  event: string,
  player: string,
) {
  c.wins += Number(win);
  c.outcomes++;
  c.matches.add(key);
  c.events.add(event);
  c.players.add(player);
}
export function aggregate(
  events: NormalizedEvent[],
  options: Options,
): Aggregate {
  const selected = selectEvents(reconcileSources(events).events, options);
  const pokemon = new Map<
    string,
    { slot: Slot; registrations: number; counter: Counter }
  >();
  const pairs = new Map<string, Map<string, Counter>>();
  let registrations = 0,
    matches = 0,
    excludedMatches = 0;
  for (const event of selected) {
    const teams = new Map(event.registrations.map((r) => [r.player, r.slots]));
    for (const slots of teams.values()) {
      if (!slots?.length) continue;
      registrations++;
      for (const slot of new Map(slots.map((s) => [s.id, s])).values()) {
        if (!pokemon.has(slot.id))
          pokemon.set(slot.id, { slot, registrations: 0, counter: counter() });
        pokemon.get(slot.id)!.registrations++;
      }
    }
    const seen = new Set<string>();
    for (const match of event.matches) {
      if (seen.has(match.id)) continue;
      seen.add(match.id);
      const left = teams.get(match.player1),
        right = teams.get(match.player2 ?? '');
      if (!eligibleResult(match, event, !!left?.length, !!right?.length)) {
        excludedMatches++;
        continue;
      }
      matches++;
      if (!left || !right) throw new Error('Unresolved eligible teams');
      const key = `${provenance(event).canonicalEvent}:${match.id}`;
      for (const [own, opp, player] of [
        [left, right, match.player1],
        [right, left, match.player2!],
      ] as const) {
        const ownIds = new Set(own.map((s) => s.id)),
          oppIds = new Set(opp.map((s) => s.id));
        for (const id of ownIds) {
          add(
            pokemon.get(id)!.counter,
            match.winner === player,
            key,
            event.id,
            `${provenance(event).participantNamespace}:${player}`,
          );
          for (const opponent of oppIds) {
            if (!pairs.has(opponent)) pairs.set(opponent, new Map());
            const map = pairs.get(opponent)!;
            if (!map.has(id)) map.set(id, counter());
            add(
              map.get(id)!,
              match.winner === player,
              key,
              provenance(event).canonicalEvent,
              `${provenance(event).participantNamespace}:${player}`,
            );
          }
        }
      }
    }
  }
  const rows = [...pokemon]
    .map(([id, p]) => ({
      id,
      name: p.slot.name,
      registrations: p.registrations,
      usage: (p.registrations / registrations) * 100,
      wins: p.counter.wins,
      outcomes: p.counter.outcomes,
      matches: p.counter.matches.size,
      winRate: rate(p.counter.wins, p.counter.outcomes),
    }))
    .sort(
      (a, b) =>
        b.registrations - a.registrations || a.name.localeCompare(b.name),
    );
  const matchups = Object.fromEntries(
    [...pairs].map(([selected, map]) => [
      selected,
      [...map].map(([id, c]) => {
        const p = pokemon.get(id)!,
          baseline = rate(p.counter.wins, p.counter.outcomes),
          winRate = rate(c.wins, c.outcomes);
        return {
          id,
          name: p.slot.name,
          wins: c.wins,
          outcomes: c.outcomes,
          matches: c.matches.size,
          events: c.events.size,
          players: c.players.size,
          winRate,
          baseline,
          difference:
            winRate === null || baseline === null ? null : winRate - baseline,
        };
      }),
    ]),
  );
  const dates = selected.map((e) => e.date).sort();
  return {
    pokemon: rows,
    matchups,
    options,
    builds: buildSummaries(selected),
    coverage: {
      events: selected.length,
      registrations,
      entrants: selected.reduce((s, e) => s + e.players, 0),
      matches,
      excludedMatches,
      assumptions: selected.filter((e) => e.sheet.basis === 'assumption')
        .length,
      from: dates[0] ?? null,
      to: dates.at(-1) ?? null,
    },
  };
}
