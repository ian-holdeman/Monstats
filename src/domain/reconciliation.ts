import { rejection } from './analytics';
import type { NormalizedEvent } from './types';
export function reconcileRecords(event: NormalizedEvent) {
  const teams = new Map(event.registrations.map((r) => [r.player, r.slots]));
  const reasons: Record<string, number> = {};
  let eligible = 0;
  for (const match of event.matches) {
    const reason =
      rejection(match, event) ??
      (!teams.get(match.player1)?.length ||
      !teams.get(match.player2 ?? '')?.length
        ? 'missing-complete-team'
        : null);
    if (reason) reasons[reason] = (reasons[reason] ?? 0) + 1;
    else eligible++;
  }
  const accounting = event.accounting;
  const excluded = Object.values(reasons).reduce((a, b) => a + b, 0);
  const represented =
    eligible +
    excluded +
    (accounting?.duplicateMatchRecords ?? 0) +
    (accounting?.malformedMatchRecords ?? 0) +
    (accounting?.conflictingMatchRecords ?? 0);
  if (
    accounting &&
    (represented !== accounting.matchRecords ||
      event.registrations.length + accounting.malformedRegistrations !==
        accounting.registrations)
  )
    throw new Error('Unreconciled source records');
  return {
    event: event.id,
    entrants: event.players,
    registrationRecords:
      accounting?.registrations ?? event.registrations.length,
    resolvedTeams: event.registrations.filter((r) => r.slots).length,
    unavailableTeams: event.registrations.filter((r) => !r.slots).length,
    missingRegistrations: Math.max(
      0,
      event.players - (accounting?.registrations ?? event.registrations.length),
    ),
    eligible,
    excluded,
    reasons,
    accounting,
    representedMatchRecords: represented,
  };
}
