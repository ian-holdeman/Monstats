import {
  championsContract,
  configuredShowdown,
  ladderSources,
} from './ladder-contracts';
import { z } from 'zod';
import { normalizeSlot, NORMALIZATION_VERSION } from './normalize';
import { setLabel } from './set-identities';
import { analyticalSpeciesId, sinistchaSourceForm } from './species-identity';
import type { Snapshot } from './types';

export const LADDER_VERSION = 'ladder-v1';
export const CHAMPIONS_BUILD_NORMALIZATION = 'champions-build-identities-v1';
export type LadderEnvironment = 'showdown' | 'champions';
export type LadderValue = {
  name: string;
  id?: string;
  percent: number | null;
  rank: number | null;
  weight: number | null;
};
export type LadderDistribution = {
  kind: 'percent' | 'rank';
  denominator: number | null;
  basis: string;
  values: LadderValue[];
};
export type LadderBuilds = Partial<
  Record<
    'items' | 'moves' | 'teammates' | 'spreads' | 'natures' | 'abilities',
    LadderDistribution
  >
>;
export type LadderPokemon = {
  id: string;
  name: string;
  rawName: string;
  rank: number | null;
  identityNote?: string;
  usage: number | null;
  rawCount: number | null;
  rawPercent: number | null;
  realCount: number | null;
  realPercent: number | null;
  setCount: number | null;
  builds: LadderBuilds;
  trend?: { date: string; rank: number }[];
};
export type LadderDraft = {
  schemaVersion: typeof LADDER_VERSION;
  buildNormalizationVersion?: typeof CHAMPIONS_BUILD_NORMALIZATION;
  identityVersion: string;
  environment: LadderEnvironment;
  regulation: string;
  format: 'BO1' | 'BO3';
  formatId: string;
  period: string;
  periodLabel: string;
  month: string | null;
  season: string | null;
  capturedAt: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  periodBasis: string;
  rating: number | null;
  battles: number | null;
  averageWeight: number | null;
  snapshots: Snapshot[];
  notes: string[];
  rows: LadderPokemon[];
  detailCoverage: number;
  excluded: { rawName: string; reason: string; pokemon?: string }[];
};
export type LadderDataset = LadderDraft & { id: string; publishedAt: string };
export type LadderSummary = Omit<
  LadderDataset,
  'rows' | 'snapshots' | 'notes' | 'excluded'
> & { pokemon: number; excludedCount: number };
const finite = z.number().finite().nonnegative();
const percent = finite.max(100);
const time = z.iso.datetime();
const distribution = z.object({
  kind: z.enum(['percent', 'rank']),
  denominator: finite.nullable(),
  basis: z.string().min(1),
  values: z.array(
    z.object({
      name: z.string().min(1),
      id: z.string().optional(),
      percent: percent.nullable(),
      rank: z.number().int().positive().nullable(),
      weight: finite.nullable(),
    }),
  ),
});
const schema = z.object({
  schemaVersion: z.literal(LADDER_VERSION),
  buildNormalizationVersion: z
    .literal(CHAMPIONS_BUILD_NORMALIZATION)
    .optional(),
  identityVersion: z.string().min(1),
  environment: z.enum(['showdown', 'champions']),
  regulation: z.string().regex(/^M-[A-Z]$/),
  format: z.enum(['BO1', 'BO3']),
  formatId: z.string().min(1),
  period: z.string().min(1),
  periodLabel: z.string().min(1),
  month: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
    .nullable(),
  season: z.string().nullable(),
  capturedAt: time.nullable(),
  periodStart: time.nullable(),
  periodEnd: time.nullable(),
  periodBasis: z.string().min(1),
  rating: z.number().int().nonnegative().nullable(),
  battles: z.number().int().nonnegative().nullable(),
  averageWeight: finite.nullable(),
  snapshots: z
    .array(
      z.object({
        url: z.url(),
        checksum: z.string().regex(/^[a-f0-9]{64}$/),
        retrievedAt: time,
      }),
    )
    .min(1),
  notes: z.array(z.string()),
  detailCoverage: z.number().int().nonnegative(),
  excluded: z.array(
    z.object({
      rawName: z.string(),
      reason: z.string(),
      pokemon: z.string().optional(),
    }),
  ),
  rows: z
    .array(
      z.object({
        id: z.string().regex(/^[a-z0-9]+$/),
        name: z.string().min(1),
        rawName: z.string().min(1),
        rank: z.number().int().positive().nullable(),
        identityNote: z.string().optional(),
        usage: percent.nullable(),
        rawCount: z.number().int().nonnegative().nullable(),
        rawPercent: percent.nullable(),
        realCount: z.number().int().nonnegative().nullable(),
        realPercent: percent.nullable(),
        setCount: z.number().int().nonnegative().nullable(),
        builds: z.object({
          items: distribution.optional(),
          moves: distribution.optional(),
          teammates: distribution.optional(),
          spreads: distribution.optional(),
          natures: distribution.optional(),
          abilities: distribution.optional(),
        }),
        trend: z
          .array(
            z.object({
              date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
              rank: z.number().int().positive(),
            }),
          )
          .optional(),
      }),
    )
    .min(1),
});
export function ladderKey(
  d: Pick<
    LadderDraft,
    'environment' | 'regulation' | 'formatId' | 'period' | 'rating'
  >,
) {
  return [
    d.environment,
    d.regulation,
    d.formatId,
    d.period,
    d.rating ?? 'unrated',
  ].join(':');
}
const summarySchema = schema
  .omit({ rows: true, snapshots: true, notes: true, excluded: true })
  .extend({
    id: z.string().regex(/^[a-f0-9]{16}$/),
    publishedAt: time,
    pokemon: z.number().int().positive(),
    excludedCount: z.number().int().nonnegative(),
  });
export function validateLadderSummary(input: unknown): LadderSummary {
  const d = summarySchema.parse(input);
  validateMetadata(d);
  return d;
}
// Shared by newly parsed captures and reads of immutable legacy publications.
// Never guess which conflicting source value is right or renumber surviving ranks.
function normalizeChampionsBuilds(d: LadderDraft): LadderDraft {
  if (d.environment !== 'champions') return d;
  const excluded = [...d.excluded];
  let conflicts = 0,
    repeated = 0;
  const rows = d.rows.map((row) => ({
    ...row,
    builds: Object.fromEntries(
      Object.entries(row.builds).map(([field, distribution]) => {
        const groups = new Map<string, LadderValue[]>();
        for (const value of distribution.values) {
          const key =
            field === 'teammates'
              ? (value.id ?? identity(value.name).id)
              : field === 'spreads'
                ? value.name.trim()
                : setLabel(
                    field as 'items' | 'abilities' | 'moves' | 'natures',
                    value.name,
                  );
          const group = groups.get(key) ?? [];
          group.push(value);
          groups.set(key, group);
        }
        const values = [...groups.values()].flatMap((group) => {
          const first = group[0];
          if (
            group.some(
              (value) =>
                value.percent !== first.percent ||
                value.rank !== first.rank ||
                value.weight !== first.weight,
            )
          ) {
            conflicts++;
            const measures = group
              .map((value) =>
                value.rank === null ? `${value.percent}%` : `#${value.rank}`,
              )
              .join(', ');
            const entry = {
              rawName: first.name,
              pokemon: row.rawName,
              reason: `Conflicting duplicate Champions ${field} values (${measures}); omitted without guessing a rank or share. Original source evidence retained.`,
            };
            if (
              !excluded.some(
                (old) =>
                  old.rawName === entry.rawName &&
                  old.pokemon === entry.pokemon &&
                  old.reason === entry.reason,
              )
            )
              excluded.push(entry);
            return [];
          }
          repeated += group.length - 1;
          return [first];
        });
        return [field, { ...distribution, values }];
      }),
    ),
  }));
  const note =
    'Conflicting duplicate build labels are excluded without guessing ranks or percentages; identical repeated values are shown once. Remaining source ranks and original evidence are preserved.';
  return {
    ...d,
    buildNormalizationVersion: CHAMPIONS_BUILD_NORMALIZATION,
    rows,
    excluded,
    notes:
      (conflicts || repeated) && !d.notes.includes(note)
        ? [...d.notes, note]
        : d.notes,
  };
}
function validateMetadata(
  d: Pick<
    LadderDraft,
    | 'environment'
    | 'regulation'
    | 'formatId'
    | 'format'
    | 'month'
    | 'season'
    | 'period'
    | 'capturedAt'
    | 'periodStart'
    | 'periodEnd'
    | 'rating'
    | 'battles'
    | 'averageWeight'
  >,
) {
  if (d.environment === 'champions') {
    const contract = championsContract(d.season ?? '');
    if (
      d.regulation !== contract.regulation ||
      d.season !== contract.season ||
      d.formatId !== 'championsdoubles' ||
      d.format !== 'BO1' ||
      d.month !== null ||
      d.rating !== null ||
      d.battles !== null ||
      d.averageWeight !== null ||
      !d.capturedAt ||
      d.period !== `${contract.season}@${d.capturedAt}` ||
      d.periodStart !== contract.startsAt ||
      d.periodEnd !== contract.endsAt ||
      d.capturedAt < d.periodStart ||
      d.capturedAt > d.periodEnd
    )
      throw new Error('Invalid Champions season/capture metadata');
  } else {
    const contract = showdownContract(d.formatId);
    if (
      contract.regulation !== d.regulation ||
      contract.format !== d.format ||
      !d.month ||
      d.period !== d.month ||
      ![0, 1500, 1630, 1760].includes(d.rating ?? -1) ||
      d.capturedAt !== null ||
      d.season !== null ||
      d.battles === null ||
      d.averageWeight === null
    )
      throw new Error('Invalid Showdown reporting metadata');
    const [year, month] = d.month.split('-').map(Number);
    if (
      d.periodStart !== new Date(Date.UTC(year, month - 1, 1)).toISOString() ||
      d.periodEnd !== new Date(Date.UTC(year, month, 1)).toISOString()
    )
      throw new Error('Mismatched Showdown calendar period');
  }
}
export function validateLadder(input: LadderDraft): LadderDraft {
  const d = schema.parse(input);
  validateMetadata(d);
  if (
    new Set(d.rows.map((r) => r.id)).size !== d.rows.length ||
    new Set(d.rows.flatMap((r) => (r.rank === null ? [] : [r.rank]))).size !==
      d.rows.filter((r) => r.rank !== null).length
  )
    throw new Error('Duplicate ladder identity or rank');
  if (d.detailCoverage > d.rows.length)
    throw new Error('Invalid detail coverage');
  if (
    d.rows.some(
      (r) => r.rank === null && (r.id !== 'sinistcha' || !r.identityNote),
    )
  )
    throw new Error('Missing ladder rank without cosmetic-form evidence');
  if (d.environment === 'champions') {
    if (
      d.formatId !== 'championsdoubles' ||
      d.format !== 'BO1' ||
      d.month !== null ||
      d.rating !== null ||
      !d.capturedAt ||
      !d.season ||
      d.battles !== null ||
      d.averageWeight !== null ||
      d.rows.some(
        (r) =>
          r.usage !== null ||
          r.rawCount !== null ||
          r.realCount !== null ||
          r.setCount !== null,
      )
    )
      throw new Error('Invalid Champions rank contract');
  } else {
    const contract = showdownContract(d.formatId);
    if (
      contract.regulation !== d.regulation ||
      contract.format !== d.format ||
      !d.month ||
      ![0, 1500, 1630, 1760].includes(d.rating ?? -1) ||
      d.capturedAt !== null ||
      d.season !== null ||
      d.battles === null ||
      d.averageWeight === null ||
      d.rows.some((r) => r.usage === null && !r.identityNote)
    )
      throw new Error('Invalid Showdown monthly contract');
  }
  for (const row of d.rows) {
    if (identity(row.rawName).id !== analyticalSpeciesId(row.id))
      throw new Error('Invalid ladder canonical identity');
    for (const dist of Object.values(row.builds))
      for (const v of dist.values) {
        if (
          dist.kind === 'rank'
            ? v.percent !== null ||
              v.rank === null ||
              v.weight !== null ||
              dist.denominator !== null
            : v.percent === null || v.rank !== null
        )
          throw new Error('Mixed rank and percent distribution');
        if (v.id && identity(v.name).id !== analyticalSpeciesId(v.id))
          throw new Error('Invalid teammate identity');
      }
  }
  return normalizeChampionsBuilds(d);
}
function identity(rawName: string) {
  const slot = normalizeSlot({ name: rawName });
  return { id: slot.id, name: slot.name, rawName };
}
export function canonicalizeLadder(input: LadderDraft): LadderDraft {
  const groups = new Map<string, LadderPokemon[]>();
  for (const row of input.rows) {
    const id = analyticalSpeciesId(row.id);
    const group = groups.get(id) ?? [];
    group.push(row);
    groups.set(id, group);
  }
  const rows = [...groups].map(([id, group]) => {
    if (
      group.length > 1 &&
      (id !== 'sinistcha' ||
        group.length !== 2 ||
        new Set(group.map((r) => sinistchaSourceForm(r.rawName))).size !== 2 ||
        group.some((r) => !sinistchaSourceForm(r.rawName)))
    )
      throw new Error('Duplicate ladder identity');
    const first = group[0];
    if (id !== 'sinistcha') return { ...first, builds: { ...first.builds } };
    const row = {
      ...first,
      id,
      name: 'Sinistcha',
      builds: { ...first.builds },
    };
    if (group.length === 1) return row;
    // A capture supplies ranks and marginals, not a denominator for pooling.
    row.rank = null;
    row.trend = undefined;
    row.identityNote =
      'Combined rank unavailable; cosmetic forms were ranked separately.';
    row.builds = {};
    if (input.environment === 'champions') return row;
    // Same monthly format/rating report: appearance and weighted usage share
    // common denominators. Never combine reports or derive usage from ranks.
    for (const field of [
      'usage',
      'rawCount',
      'rawPercent',
      'realCount',
      'realPercent',
      'setCount',
    ] as const)
      row[field] = group.every((r) => r[field] !== null)
        ? group.reduce((sum, r) => sum + r[field]!, 0)
        : null;
    row.identityNote =
      'Cosmetic forms pooled within this report; combined rank unavailable.';
    for (const field of [
      'items',
      'moves',
      'abilities',
      'natures',
      'spreads',
      'teammates',
    ] as const) {
      const distributions = group.map((r) => r.builds[field]);
      if (
        !distributions.every(
          (d) =>
            d?.kind === 'percent' &&
            d.denominator !== null &&
            d.denominator > 0 &&
            d.values.every((v) => v.weight !== null),
        )
      )
        continue;
      const denominator = distributions.reduce(
        (sum, d) => sum + d!.denominator!,
        0,
      );
      const values = new Map<string, LadderValue>();
      for (const distribution of distributions)
        for (const value of distribution!.values) {
          const key = value.id ?? value.name;
          const old = values.get(key);
          values.set(key, {
            ...value,
            weight: (old?.weight ?? 0) + value.weight!,
          });
        }
      row.builds[field] = {
        kind: 'percent',
        denominator,
        basis:
          'Pooled published weights within the same format, month and rating report.',
        values: [...values.values()]
          .map((v) => ({ ...v, percent: (100 * v.weight!) / denominator }))
          .sort((a, b) => b.percent! - a.percent!),
      };
    }
    return row;
  });
  // Teammate aliases can collide even when the selected species does not.
  for (const row of rows) {
    const dist = row.builds.teammates;
    if (!dist) continue;
    const groups = new Map<string, LadderValue[]>();
    for (const v of dist.values) {
      const id = analyticalSpeciesId(v.id ?? identity(v.name).id);
      if (id === row.id) continue;
      const group = groups.get(id) ?? [];
      group.push({ ...v, id, name: id === 'sinistcha' ? 'Sinistcha' : v.name });
      groups.set(id, group);
    }
    row.builds = {
      ...row.builds,
      teammates: {
        ...dist,
        values: [...groups.values()].flatMap((group) => {
          if (group[0].id !== 'sinistcha') return group;
          if (group.length === 1) return group;
          if (
            dist.kind !== 'percent' ||
            !dist.denominator ||
            group.some((v) => v.weight === null)
          )
            return [];
          const weight = group.reduce((sum, v) => sum + v.weight!, 0);
          return [
            { ...group[0], weight, percent: (100 * weight) / dist.denominator },
          ];
        }),
        basis:
          dist.basis +
          (dist.kind === 'rank'
            ? ' Cosmetic-form rank collisions are unavailable.'
            : ''),
      },
    };
  }
  return {
    ...input,
    identityVersion: NORMALIZATION_VERSION,
    rows,
    detailCoverage:
      rows.length === input.rows.length
        ? input.detailCoverage
        : rows.filter((r) => Object.keys(r.builds).length > 0).length,
  };
}
export function showdownContract(formatId: string) {
  return configuredShowdown(formatId);
}
export function discoverShowdown(html: string, month: string) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))
    throw new Error('Invalid reporting month');
  const found = new Map<
    string,
    { month: string; formatId: string; rating: number }
  >();
  for (const m of html.matchAll(/href="([a-z0-9]+)-(0|1500|1630|1760)\.txt"/g))
    if (Object.hasOwn(ladderSources.showdown.formats, m[1]))
      found.set(m[1] + '-' + m[2], {
        month,
        formatId: m[1],
        rating: Number(m[2]),
      });
  return [...found.values()];
}
const numericMap = z.record(z.string(), finite);
const chaosSchema = z.object({
  info: z.object({
    metagame: z.string(),
    cutoff: z.number(),
    'number of battles': z.number().int().nonnegative(),
  }),
  data: z.record(
    z.string(),
    z.object({
      usage: finite.max(1),
      'Raw count': z.number().int().nonnegative(),
      Abilities: numericMap,
      Items: numericMap,
      Moves: numericMap,
      Spreads: numericMap,
      Teammates: numericMap,
    }),
  ),
});
export function parseShowdown(
  usageText: string,
  chaosInput: unknown,
  options: {
    month: string;
    formatId: string;
    rating: number;
    snapshots: Snapshot[];
  },
): LadderDraft {
  const contract = showdownContract(options.formatId),
    chaos = chaosSchema.parse(chaosInput);
  const battles = Number(
    usageText.match(/^Total battles: (\d+)\s*$/m)?.[1] ?? NaN,
  );
  const averageWeight = Number(
    usageText.match(/^Avg\. weight\/team: ([\d.]+)\s*$/m)?.[1] ?? NaN,
  );
  if (
    chaos.info.metagame !== options.formatId ||
    chaos.info.cutoff !== options.rating ||
    battles !== chaos.info['number of battles']
  )
    throw new Error('Mismatched Showdown report metadata');
  const rows: LadderPokemon[] = [];
  for (const line of usageText.split('\n')) {
    if (!/^\|\s*\d+\s*\|/.test(line)) continue;
    const cols = line
      .split('|')
      .slice(1, -1)
      .map((v) => v.trim());
    if (
      cols.length !== 7 ||
      !cols
        .slice(2)
        .every((v, i) =>
          i % 2 === 0 ? /^\d+(?:\.\d+)?%$/.test(v) : /^\d+$/.test(v),
        )
    )
      throw new Error('Malformed Showdown usage row');
    const [rank, name, usage, rawCount, rawPercent, realCount, realPercent] =
      cols;
    const set = chaos.data[name];
    if (set && Math.abs(set.usage * 100 - parseFloat(usage)) > 0.00002)
      throw new Error('Mismatched Showdown usage/sets');
    const denominator = set
      ? Object.values(set.Abilities).reduce((a, b) => a + b, 0)
      : 0;
    const builds: LadderBuilds = {};
    const natures: Record<string, number> = {};
    for (const [spread, weight] of Object.entries(set?.Spreads ?? {})) {
      const nature = spread.match(
        /^([A-Za-z]+):\d+\/\d+\/\d+\/\d+\/\d+\/\d+$/,
      )?.[1];
      if (nature) {
        const label = setLabel('natures', nature);
        natures[label] = (natures[label] ?? 0) + weight;
      }
    }
    if (set && denominator > 0)
      for (const [field, values] of Object.entries({
        items: set.Items,
        abilities: set.Abilities,
        moves: set.Moves,
        spreads: set.Spreads,
        natures,
        teammates: set.Teammates,
      })) {
        const kind = field as keyof LadderBuilds;
        const entries = Object.entries(values).filter(
          ([v]) =>
            !(kind === 'moves' && v === '') &&
            !(
              kind === 'teammates' &&
              (v === 'empty' || identity(v).id === identity(name).id)
            ),
        );
        builds[kind] = {
          kind: 'percent',
          denominator,
          basis:
            'Weighted set observations for this Pokémon; overlapping fields are marginal distributions.',
          values: entries
            .map(([raw, weight]) => ({
              name:
                kind === 'teammates'
                  ? identity(raw).name
                  : kind === 'spreads'
                    ? raw
                    : raw === 'nothing' || raw === ''
                      ? 'Nothing'
                      : setLabel(
                          kind as 'items' | 'abilities' | 'moves' | 'natures',
                          raw,
                        ),
              ...(kind === 'teammates' ? { id: identity(raw).id } : {}),
              percent:
                Math.abs((weight / denominator) * 100 - 100) < 1e-9
                  ? 100
                  : (weight / denominator) * 100,
              rank: null,
              weight,
            }))
            .sort(
              (a, b) => b.percent! - a.percent! || a.name.localeCompare(b.name),
            ),
        };
      }
    rows.push({
      ...identity(name),
      rank: Number(rank),
      usage: parseFloat(usage),
      rawCount: Number(rawCount),
      rawPercent: parseFloat(rawPercent),
      realCount: Number(realCount),
      realPercent: parseFloat(realPercent),
      setCount: set?.['Raw count'] ?? null,
      builds,
    });
  }
  const [year, month] = options.month.split('-').map(Number);
  return validateLadder(
    canonicalizeLadder({
      schemaVersion: LADDER_VERSION,
      identityVersion: NORMALIZATION_VERSION,
      environment: 'showdown',
      ...contract,
      formatId: options.formatId,
      period: options.month,
      periodLabel: options.month,
      month: options.month,
      season: null,
      capturedAt: null,
      periodStart: new Date(Date.UTC(year, month - 1, 1)).toISOString(),
      periodEnd: new Date(Date.UTC(year, month, 1)).toISOString(),
      periodBasis:
        'Calendar month; format-specific subset within the report month.',
      rating: options.rating,
      battles,
      averageWeight,
      snapshots: options.snapshots,
      rows,
      detailCoverage: rows.filter((r) => r.setCount !== null).length,
      excluded: [],
      notes: [
        'Usage is the published rating-weighted team appearance percentage. Rating reports overlap and are never pooled.',
        'Raw usage appearances, real appearances and raw set observations are distinct source measures; they are not unique players or tournament registrations.',
        'Low-usage identities can appear in the usage table without a detailed set report; their build coverage remains unavailable.',
        'Nature marginals are summed from explicitly published nature/spread weights using the same weighted-set denominator.',
        'The BO3 label identifies the ladder rules. The source reports battles, without establishing a series denominator.',
        'No team outcome win rates are supplied by these published reports. Checks/counters describe encounters, not team matchups.',
      ],
    }),
  );
}
const tuple = z.tuple([z.string(), z.string()]).rest(z.unknown());
const championsSchema = z.object({
  is_champions_game: z.literal(true),
  champions_slug: z.literal('doubles'),
  selected_format: z.tuple([z.literal('championsdoubles'), z.string()]),
  selected_pokemon: z.string(),
  champions_updated: z.string(),
  current_pokemon: z
    .tuple([z.string(), z.string(), z.string()])
    .rest(z.unknown()),
  pokemon_names: z.array(tuple).min(1),
  items_list: z.array(tuple),
  abilities_list: z.array(tuple),
  moves_list: z.array(tuple),
  natures_list: z.array(tuple),
  spreads_list: z.array(tuple),
  teammates_list: z.array(tuple),
  trend_kind: z.literal('rank'),
  trend_months: z.array(z.string()),
  trend_usage: z.array(z.number().int().positive()),
});
export function parseChampions(
  inputs: unknown[],
  snapshots: Snapshot[],
  contract = championsContract(
    undefined,
    Date.parse(snapshots[0]?.retrievedAt ?? new Date().toISOString()),
  ),
): LadderDraft {
  const data = inputs.map((v) => championsSchema.parse(v)),
    first = data[0];
  if (!first) throw new Error('No Champions capture');
  const capturedAt = new Date(
    first.champions_updated.replace(' at ', ' '),
  ).toISOString();
  // This reviewed contract is evidenced by official M-C and M-6 notices, not an inferred calendar month.
  const start = contract.startsAt,
    end = contract.endsAt;
  if (capturedAt < start || capturedAt > end)
    throw new Error('Champions season contract needs a new source audit');
  const listKey = JSON.stringify(first.pokemon_names.map((v) => v.slice(0, 2)));
  const excluded: LadderDraft['excluded'] = [];
  const rows: LadderPokemon[] = first.pokemon_names.flatMap(([name, rank]) => {
    if (!/^#[1-9]\d*$/.test(rank)) throw new Error('Malformed Champions rank');
    let resolved;
    try {
      resolved = identity(name);
    } catch {
      excluded.push({
        rawName: name,
        reason: 'Unresolved canonical species; original evidence retained.',
      });
      return [];
    }
    return [
      {
        ...resolved,
        rank: Number(rank.slice(1)),
        usage: null,
        rawCount: null,
        rawPercent: null,
        realCount: null,
        realPercent: null,
        setCount: null,
        builds: {},
      },
    ];
  });
  const seen = new Set<string>();
  for (const entry of data) {
    if (
      entry.champions_updated !== first.champions_updated ||
      JSON.stringify(entry.pokemon_names.map((v) => v.slice(0, 2))) !== listKey
    )
      throw new Error('Mixed Champions capture or ranking');
    const row = rows.find((r) => r.rawName === entry.selected_pokemon);
    if (!row && excluded.some((v) => v.rawName === entry.selected_pokemon))
      continue;
    if (
      !row ||
      seen.has(row.rawName) ||
      entry.current_pokemon[0] !== row.rawName ||
      Number(entry.current_pokemon[2]) !== row.rank
    )
      throw new Error('Mismatched Champions detail identity/rank');
    seen.add(row.rawName);
    for (const field of [
      'items',
      'abilities',
      'moves',
      'natures',
      'spreads',
      'teammates',
    ] as const) {
      const values = entry[`${field}_list`];
      if (!values.length) continue;
      const ranked = field === 'teammates';
      row.builds[field] = {
        kind: ranked ? 'rank' : 'percent',
        denominator: null,
        basis: ranked
          ? 'Published in-game teammate rank; no share or population count supplied.'
          : 'Published in-game marginal percentage; population counts unavailable and source may list only leading values.',
        values: values
          .flatMap(([raw, val]) => {
            if (
              ranked ? !/^#[1-9]\d*$/.test(val) : !/^\d+(?:\.\d+)?$/.test(val)
            )
              throw new Error('Malformed Champions build value');
            let teammate;
            if (ranked) {
              try {
                teammate = identity(raw);
              } catch {
                excluded.push({
                  rawName: raw,
                  pokemon: row.rawName,
                  reason:
                    'Unresolved canonical teammate; original evidence retained.',
                });
                return [];
              }
            }
            return [
              {
                name: ranked
                  ? teammate!.name
                  : field === 'spreads'
                    ? raw
                    : setLabel(
                        field as 'items' | 'moves' | 'abilities' | 'natures',
                        raw,
                      ),
                ...(ranked ? { id: teammate!.id } : {}),
                percent: ranked ? null : Number(val),
                rank: ranked ? Number(val.slice(1)) : null,
                weight: null,
              },
            ];
          })
          .filter((v) => v.id !== row.id)
          .sort((a, b) =>
            ranked ? a.rank! - b.rank! : b.percent! - a.percent!,
          ),
      };
    }
    if (entry.trend_months.length !== entry.trend_usage.length)
      throw new Error('Malformed Champions rank history');
    row.trend = entry.trend_months.map((date, i) => ({
      date,
      rank: entry.trend_usage[i],
    }));
  }
  return validateLadder(
    canonicalizeLadder({
      schemaVersion: LADDER_VERSION,
      identityVersion: NORMALIZATION_VERSION,
      environment: 'champions',
      regulation: contract.regulation,
      format: 'BO1',
      formatId: 'championsdoubles',
      period: `${contract.season}@${capturedAt}`,
      periodLabel: `${contract.season} · ${capturedAt.slice(0, 10)}`,
      month: null,
      season: contract.season,
      capturedAt,
      periodStart: start,
      periodEnd: end,
      periodBasis: `Official ranked season ${contract.season} / ${contract.regulation}; the capture response does not specify the underlying Battle Data aggregation window.`,
      rating: null,
      battles: null,
      averageWeight: null,
      snapshots,
      rows: rows.sort((a, b) => (a.rank ?? Infinity) - (b.rank ?? Infinity)),
      detailCoverage: seen.size,
      excluded,
      notes: [
        'Battle Data captured in-game by MunchStats. Usage and teammates are published ranks, not percentages.',
        'Ranked season and regulation are independently audited; the source aggregation window, tier population and sample counts remain unknown.',
        'Base/form ranking identities are preserved. Item marginals do not establish transformed-form usage.',
        'Moves, items, abilities, natures and stat points are independent source distributions, never reconstructed joint sets.',
        'No competitive outcomes are supplied. Win rates and matchup performance remain unavailable.',
      ],
    }),
  );
}
