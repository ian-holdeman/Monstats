import type { NormalizedEvent, Provenance, Quarantine } from './types';
import { regulations } from './regulations';

export const MIN_ENTRANTS = 20;
export const LARGE_ENTRANTS = 100;
export function eligibility(players: unknown): string | null {
  if (!Number.isInteger(players) || Number(players) < 0)
    return 'unresolved-entrant-count';
  return Number(players) < MIN_ENTRANTS ? 'below-entrant-floor' : null;
}
export function provenance(event: NormalizedEvent): Provenance {
  return (
    event.provenance ?? {
      canonicalEvent: `limitless:${event.id}`,
      participantNamespace: 'limitless',
      environment: 'champions-cartridge',
      official: 'unknown',
      population: 'registrations',
      sources: [
        {
          provider: 'limitless',
          originalId: event.id,
          url: `https://play.limitlesstcg.com/tournament/${event.id}`,
        },
      ],
    }
  );
}
export function recordProviders(event: NormalizedEvent) {
  return provenance(event)
    .sources.filter((s) => !s.role || s.role === 'records')
    .map((s) => s.provider);
}
function facts(event: NormalizedEvent) {
  return JSON.stringify({
    regulation: event.regulation,
    date: event.date,
    players: event.players,
    completed: event.completed,
    archived: event.archived ?? false,
    platform: event.platform,
    sheet: event.sheet.visibility,
    phases: [...event.phases].sort((a, b) => a.phase - b.phase),
    namespace: provenance(event).participantNamespace,
    registrations: [...event.registrations].sort((a, b) =>
      a.player.localeCompare(b.player),
    ),
    matches: [...event.matches]
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((m) => ({
        ...m,
        administrative: m.administrative ?? false,
      })),
  });
}
export function officialEligibility(event: NormalizedEvent): string | null {
  const p = provenance(event);
  if (p.official !== 'verified')
    return p.division ? 'unverified-official-identity' : null;
  if (p.division !== 'masters' || !p.divisionEvidence?.trim())
    return 'unresolved-masters-division';
  if (
    p.season !== regulations.cohorts[event.regulation]?.season ||
    !p.eventType ||
    !p.regulationEvidence?.trim()
  )
    return 'unresolved-official-format';
  if (
    !p.entrantEvidence?.length ||
    p.entrantEvidence.some((n) => n !== event.players)
  )
    return 'contradictory-masters-entrant-count';
  if (p.roster !== 'complete' && p.roster !== 'supplemental')
    return 'selective-or-unresolved-roster';
  return null;
}
function supplementalMerge(copies: NormalizedEvent[]): NormalizedEvent | null {
  const first =
    copies.find((e) => provenance(e).roster === 'complete') ?? copies[0];
  const header = (e: NormalizedEvent) =>
    JSON.stringify({
      regulation: e.regulation,
      date: e.date,
      players: e.players,
      completed: e.completed,
      platform: e.platform,
      phases: e.phases,
      sheet: e.sheet.visibility,
      namespace: provenance(e).participantNamespace,
      division: provenance(e).division,
      season: provenance(e).season,
      eventType: provenance(e).eventType,
    });
  if (
    copies.some(
      (e) =>
        provenance(e).official !== 'verified' || header(e) !== header(first),
    )
  )
    return null;
  const registrations = new Map(
    first.registrations.map((r) => [r.player, { ...r }]),
  );
  const matches = new Map(first.matches.map((m) => [m.id, m]));
  for (const copy of copies) {
    if (
      provenance(copy).roster === 'complete' &&
      (copy.registrations.length !== registrations.size ||
        copy.registrations.some((r) => !registrations.has(r.player)))
    )
      return null;
    for (const r of copy.registrations) {
      const old = registrations.get(r.player);
      if (
        !old ||
        old.drop !== r.drop ||
        (old.slots &&
          r.slots &&
          JSON.stringify(old.slots) !== JSON.stringify(r.slots))
      )
        return null;
      if (!old.slots && r.slots) registrations.set(r.player, r);
    }
    for (const m of copy.matches) {
      const old = matches.get(m.id);
      if (old && JSON.stringify(old) !== JSON.stringify(m)) return null;
      if (
        !registrations.has(m.player1) ||
        (m.player2 && !registrations.has(m.player2))
      )
        return null;
      matches.set(m.id, m);
    }
  }
  return {
    ...first,
    registrations: [...registrations.values()],
    matches: [...matches.values()],
    accounting: undefined,
    quarantine: copies.flatMap((e) => [
      ...e.quarantine,
      {
        kind: 'source-ledger',
        reason: 'contributing-provider-accounting',
        evidence: { sources: provenance(e).sources, accounting: e.accounting },
      },
    ]),
  };
}
// Copies must have identical normalized facts and a verified original event key.
// Partial or conflicting mirrors require review instead of speculative joining.
export function reconcileSources(input: NormalizedEvent[]) {
  const groups = new Map<string, NormalizedEvent[]>();
  const quarantine: Quarantine[] = [];
  for (const original of input) {
    // Older snapshots may retain slots after their team validator failed.
    // Repair the normalized copy while preserving the original evidence.
    const invalid = original.registrations.filter(
      (r) =>
        r.slots && new Set(r.slots.map((s) => s.id)).size !== r.slots.length,
    );
    const event = invalid.length
      ? {
          ...original,
          registrations: original.registrations.map((r) =>
            invalid.includes(r) ? { ...r, slots: null } : r,
          ),
          quarantine: [
            ...original.quarantine,
            ...invalid.map((r) => ({
              kind: 'team' as const,
              reason: 'duplicate-team-species',
              evidence: r,
            })),
          ],
        }
      : original;
    const reason = eligibility(event.players) ?? officialEligibility(event);
    const p = provenance(event);
    if (
      reason ||
      p.environment !== 'champions-cartridge' ||
      p.population !== 'registrations'
    ) {
      quarantine.push({
        kind: 'event',
        reason: reason ?? 'incompatible-population',
        evidence: event,
      });
      continue;
    }
    const key = p.division
      ? `${p.canonicalEvent}:${p.division}`
      : p.canonicalEvent;
    const group = groups.get(key) ?? [];
    group.push(event);
    groups.set(key, group);
  }
  const ambiguous = new Set<string>();
  const signatures = new Map<string, { key: string; providers: Set<string> }>();
  for (const [key, events] of groups) {
    const event = events[0];
    const signature = `${event.regulation}:${event.date.slice(0, 10)}:${event.name.trim().toLowerCase()}`;
    const providers = new Set(
      events.flatMap((e) => provenance(e).sources.map((s) => s.provider)),
    );
    const previous = signatures.get(signature);
    if (
      previous &&
      previous.key !== key &&
      [...providers].some((s) => !previous.providers.has(s))
    ) {
      ambiguous.add(key);
      ambiguous.add(previous.key);
    } else signatures.set(signature, { key, providers });
  }
  const events: NormalizedEvent[] = [];
  for (const [key, copies] of groups) {
    const identical = copies.every((e) => facts(e) === facts(copies[0]));
    const merged = identical ? copies[0] : supplementalMerge(copies);
    if (ambiguous.has(key) || !merged) {
      quarantine.push({
        kind: 'event',
        reason: ambiguous.has(key)
          ? 'unresolved-cross-source-identity'
          : 'conflicting-source-event',
        evidence: copies,
      });
      continue;
    }
    const first = merged!;
    events.push({
      ...first,
      provenance: {
        ...provenance(first),
        sources: [
          ...new Map(
            copies
              .flatMap((e) => provenance(e).sources)
              .map((s) => [`${s.provider}:${s.originalId}`, s]),
          ).values(),
        ],
      },
      snapshots: [
        ...new Map(
          copies
            .flatMap((e) => e.snapshots)
            .map((s) => [`${s.url}:${s.checksum}:${s.retrievedAt}`, s]),
        ).values(),
      ],
    });
  }
  return { events, quarantine };
}
