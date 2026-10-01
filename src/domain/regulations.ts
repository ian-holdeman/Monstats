import configured from '../../config/regulations.json' with { type: 'json' };
import type { PublishedDataset } from './types';
import { sourceSelection } from './filters';
export type RegulationConfig = {
  default: string;
  cohorts: Record<
    string,
    { enabled: boolean; environment: string; season: string; evidence: string }
  >;
};
export const regulations: RegulationConfig = configured;
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
