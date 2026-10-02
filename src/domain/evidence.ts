// Independent descriptive context; never changes rates or ranking eligibility.
export const EVIDENCE_VERSION = 'evidence-context-v2';
export const EVIDENCE_RULES = { sample: 100 } as const;
export type PerformanceEvidence = {
  version: string;
  matches: number;
  events: number;
  largestEventShare: number | null;
  sources?: { provider: string; matches: number }[];
};
export function performanceEvidence(
  matchEvents: Map<string, string>,
  eventSources?: Map<string, string[]>,
): PerformanceEvidence {
  const events = new Map<string, number>();
  for (const event of matchEvents.values())
    events.set(event, (events.get(event) ?? 0) + 1);
  return eventEvidence(matchEvents.size, events, eventSources);
}
// Aggregates already deduplicate physical results: retain small per-event counts
// instead of copying every physical key into a second map for every Pokémon pair.
export function eventEvidence(
  matches: number,
  events: Map<string, number>,
  eventSources?: Map<string, string[]>,
): PerformanceEvidence {
  const sources = new Map<string, number>();
  for (const [event, count] of events)
    for (const provider of new Set(eventSources?.get(event) ?? []))
      sources.set(provider, (sources.get(provider) ?? 0) + count);
  return {
    version: EVIDENCE_VERSION,
    matches,
    events: events.size,
    largestEventShare:
      matches && events.size
        ? (100 * Math.max(...events.values())) / matches
        : null,
    ...(eventSources
      ? {
          sources: [...sources]
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([provider, matches]) => ({ provider, matches })),
        }
      : {}),
  };
}
export function sampleReasons(
  count: number | null | undefined,
  unit: 'usage' | 'matches' | 'build',
) {
  const reasons: string[] = [];
  if (count == null)
    reasons.push(
      'Sample unavailable. The source does not provide a defensible count.',
    );
  else if (count < EVIDENCE_RULES.sample)
    reasons.push(
      `${unit === 'usage' ? 'Small usage sample' : unit === 'build' ? 'Small build sample' : 'Small match sample'}. Based on ${count} ${unit === 'matches' ? 'physical matches/series' : unit === 'build' ? 'known-field registrations' : 'registrations'}.`,
    );
  return reasons;
}
export function performanceReasons({
  evidence,
  matches,
  baseline,
  baselineMatches,
  compareBaseline = false,
}: {
  evidence?: PerformanceEvidence;
  matches?: number;
  baseline?: PerformanceEvidence;
  baselineMatches?: number;
  compareBaseline?: boolean;
}) {
  const own = sampleReasons(evidence?.matches ?? matches, 'matches');
  const paired = compareBaseline || !!baseline || baselineMatches !== undefined;
  return paired
    ? [
        ...own.map((r) => `Matchup: ${r}`),
        ...sampleReasons(baseline?.matches ?? baselineMatches, 'matches').map(
          (r) => `Overall baseline: ${r}`,
        ),
      ]
    : own;
}
export function evidenceOrder<T>(
  rows: T[],
  get: (r: T) => PerformanceEvidence | undefined,
  key: (r: T) => string,
  matches: (r: T) => number = (r) => get(r)?.matches ?? 0,
  events: (r: T) => number = (r) => get(r)?.events ?? 0,
) {
  return [...rows].sort(
    (a, b) =>
      matches(b) - matches(a) ||
      events(b) - events(a) ||
      (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0),
  );
}
