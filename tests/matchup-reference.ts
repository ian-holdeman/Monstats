// Deliberately simple oracle: scan each physical result for each candidate.
// No indexed membership, composition grouping, batched baselines or production counters.
import { rejection, selectEvents } from '../src/domain/analytics';
import {
  reconcileSources,
  provenance,
  recordProviders,
} from '../src/domain/sources';
import type { PublishedDataset } from '../src/domain/types';
import type {
  CombinationRow,
  MatchupRequest,
  Sample,
} from '../src/domain/dynamic-matchups';

export function referenceMatchups(d: PublishedDataset, q: MatchupRequest) {
  const events = selectEvents(reconcileSources(d.events).events, {
    ...d.views['all:0'].options,
    ...q,
  });
  const perspectives: {
    own: string[];
    opp: string[];
    win: boolean;
    match: string;
    event: string;
    player: string;
    providers: string[];
  }[] = [];
  for (const e of events) {
    const seen = new Set<string>();
    for (const m of e.matches) {
      if (seen.has(m.id)) continue;
      seen.add(m.id);
      const l = e.registrations.find((r) => r.player === m.player1)?.slots;
      const r = e.registrations.find((r) => r.player === m.player2)?.slots;
      if (rejection(m, e) || !l?.length || !r?.length) continue;
      for (const [own, opp, p] of [
        [l, r, m.player1],
        [r, l, m.player2!],
      ] as const)
        perspectives.push({
          own: [...new Set(own.map((s) => s.id))].sort(),
          opp: opp.map((s) => s.id),
          win: m.winner === p,
          match: `${provenance(e).canonicalEvent}:${m.id}`,
          event: provenance(e).canonicalEvent,
          player: `${provenance(e).participantNamespace}:${p}`,
          providers: recordProviders(e),
        });
    }
  }
  const contains = (team: string[], chosen: string[]) =>
    chosen.every((id) => team.includes(id));
  const candidates = new Map<string, string[]>();
  if (q.mode === 'compare')
    candidates.set([...q.a].sort().join('+'), [...q.a].sort());
  else
    for (const p of perspectives.filter((p) => contains(p.opp, q.b))) {
      // Independent bit-mask subset enumeration.
      for (let mask = 1; mask < 2 ** p.own.length; mask++) {
        const ids = p.own.filter((_, i) => mask & (1 << i));
        if (ids.length === q.candidateSize) candidates.set(ids.join('+'), ids);
      }
    }
  const count = (ps: typeof perspectives): Sample => {
    const wins = ps.filter((p) => p.win).length;
    const physical = new Set(ps.map((p) => p.match));
    const eventIds = [...new Set(ps.map((p) => p.event))];
    const largest = Math.max(
      0,
      ...eventIds.map(
        (id) =>
          new Set(ps.filter((p) => p.event === id).map((p) => p.match)).size,
      ),
    );
    return {
      wins,
      losses: ps.length - wins,
      outcomes: ps.length,
      winRate: ps.length ? (wins / ps.length) * 100 : null,
      matches: new Set(ps.map((p) => p.match)).size,
      events: new Set(ps.map((p) => p.event)).size,
      players: new Set(ps.map((p) => p.player)).size,
      evidence: {
        sources: [...new Set(ps.flatMap((p) => p.providers))]
          .sort()
          .map((provider) => ({
            provider,
            matches: new Set(
              ps
                .filter((p) => p.providers.includes(provider))
                .map((p) => p.match),
            ).size,
          })),
        version: 'evidence-context-v2',
        matches: physical.size,
        events: eventIds.length,
        largestEventShare: physical.size
          ? (largest / physical.size) * 100
          : null,
      },
    };
  };
  let rows: CombinationRow[] = [...candidates].map(([key, members]) => {
    const s = perspectives.filter((p) => contains(p.own, members)),
      overall = count(s),
      sample = count(s.filter((p) => contains(p.opp, q.b)));
    return {
      key,
      members,
      overall,
      sample,
      difference:
        overall.winRate === null || sample.winRate === null
          ? null
          : sample.winRate - overall.winRate,
      sufficient:
        sample.matches >= d.floor.matches &&
        sample.events >= d.floor.events &&
        sample.players >= d.floor.players,
    };
  });
  if (q.mode === 'discover')
    rows = rows
      .filter(
        (r) =>
          r.sufficient &&
          r.sample.winRate !== null &&
          (!q.b.length || r.key !== [...q.b].sort().join('+')) &&
          (!q.b.length ||
            (typeof r.difference === 'number' &&
              Number.isFinite(r.difference) &&
              (q.direction === 'worst'
                ? r.difference < 0
                : r.difference >= 0))),
      )
      .sort((a, b) => {
        if (q.sort === 'evidence')
          return (
            b.sample.matches - a.sample.matches ||
            b.sample.events - a.sample.events ||
            (a.key < b.key ? -1 : a.key > b.key ? 1 : 0)
          );
        const av = q.sort === 'difference' ? a.difference! : a.sample.winRate!,
          bv = q.sort === 'difference' ? b.difference! : b.sample.winRate!;
        return (
          (q.direction === 'best' ? bv - av : av - bv) ||
          b.sample.matches - a.sample.matches ||
          (a.key < b.key ? -1 : a.key > b.key ? 1 : 0)
        );
      });
  if (q.hideNotices)
    rows = rows.filter(
      (r) =>
        r.sample.matches >= 100 && (!q.b.length || r.overall.matches >= 100),
    );
  return { rows: rows.slice(q.offset, q.offset + q.limit), total: rows.length };
}
