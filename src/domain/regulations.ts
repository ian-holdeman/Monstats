import configured from '../../config/regulations.json' with { type: 'json' };
import type {
  PublishedDataset,
  CoverageInterval,
  NormalizedEvent,
  Options,
} from './types';
import { sourceSelection } from './filters';
export type RegulationConfig = {
  default: string;
  cohorts: Record<
    string,
    {
      enabled: boolean;
      environment: string;
      season: string;
      evidence: string;
      startsAt?: string;
      endsAt?: string;
      reviewed?: boolean;
    }
  >;
};
export const regulations: RegulationConfig = configured;
export function coverageInterval(
  id: string,
  asOf: string,
  config = regulations,
): CoverageInterval {
  const rule = requireRegulation(id, config);
  if (
    !rule.reviewed ||
    !rule.startsAt ||
    !rule.endsAt ||
    !Number.isFinite(Date.parse(asOf)) ||
    Date.parse(rule.startsAt) >= Date.parse(rule.endsAt)
  )
    throw new Error(`Unreviewed regulation interval ${id}`);
  return {
    version: 'regulation-v1',
    regulation: id,
    start: new Date(rule.startsAt).toISOString(),
    end: new Date(rule.endsAt).toISOString(),
    cutoff: new Date(
      Math.min(Date.parse(asOf), Date.parse(rule.endsAt) - 1),
    ).toISOString(),
  };
}
export function optionBounds(options: Options) {
  if (options.interval) {
    const i = options.interval;
    if (
      i.version !== 'regulation-v1' ||
      i.regulation !== options.regulation ||
      ![i.start, i.end, i.cutoff].every((v) =>
        Number.isFinite(Date.parse(v)),
      ) ||
      Date.parse(i.start) >= Date.parse(i.end)
    )
      throw new Error('Invalid coverage interval');
    return {
      start: Date.parse(i.start),
      end: Math.min(
        Date.parse(i.cutoff),
        Date.parse(i.end) - 1,
        Date.parse(options.asOf),
      ),
    };
  }
  const end = Date.parse(options.asOf);
  if (!Number.isFinite(end) || options.days <= 0)
    throw new Error('Invalid window');
  return { start: end - options.days * 86400000, end };
}
export function eventInInterval(
  event: Pick<NormalizedEvent, 'date' | 'regulation' | 'endsAt'>,
  interval: CoverageInterval,
) {
  const date = Date.parse(event.date),
    end = Date.parse(event.endsAt ?? event.date);
  return (
    event.regulation === interval.regulation &&
    Number.isFinite(date) &&
    Number.isFinite(end) &&
    end >= date &&
    date >= Date.parse(interval.start) &&
    date < Date.parse(interval.end) &&
    end < Date.parse(interval.end) &&
    end <= Date.parse(interval.cutoff)
  );
}
export function requireRegulation(id: string, config = regulations) {
  const entry = config.cohorts[id];
  if (
    !/^M-[A-Z]$/.test(id) ||
    !entry?.enabled ||
    entry.environment !== 'champions-cartridge' ||
    !entry.season ||
    !entry.evidence.trim()
  )
    throw new Error(`Unsupported or unverified regulation ${id}`);
  return entry;
}
export function datasetRegulation(d: PublishedDataset): string {
  // New versions carry an explicit identity; reading one cohort must not inflate every compressed view.
  const values = d.regulation
    ? [d.regulation]
    : [...new Set(Object.values(d.views).map((v) => v.options.regulation))];
  if (values.length !== 1) throw new Error('Mixed publication regulations');
  const id = values[0];
  const primary = d.views['all:0'] ?? d.views[Object.keys(d.views)[0]];
  if (
    !id ||
    (d.regulation && d.regulation !== id) ||
    d.events.some((e) => e.regulation !== id)
  )
    throw new Error('Publication regulation mismatch');
  if (!primary || primary.options.regulation !== id)
    throw new Error('Publication cohort mismatch');
  return id;
}
export const cohortKey = (
  source: string,
  sheet: string,
  size: number,
  official = false,
) =>
  official
    ? `${sourceSelection(source)}:${sheet}:${size}:official`
    : `${sourceSelection(source)}:${sheet}:${size}`;
