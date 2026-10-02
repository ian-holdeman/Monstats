import { coverageInterval } from '../domain/regulations';
import { z } from 'zod';
import { normalizeSlot } from '../domain/normalize';
import { eligibility, provenance } from '../domain/sources';
import type {
  CollectionReport,
  NormalizedEvent,
  Snapshot,
} from '../domain/types';
import { fetchBounded, failureClass, type CollectorOptions } from './collector';
import { Store } from './store';
const circuit = 'https://circuit.victoryroad.pro';
const articleOrigin = 'https://victoryroad.pro';
const payloadSchema = z.object({
  ids: z.array(z.string().min(1)),
  j: z.array(
    z.tuple([
      z.string(),
      z.string(),
      z.string(),
      z.number(),
      z.string(),
      z.array(z.tuple([z.string(), z.string(), z.string(), z.string()])),
      z.string().nullable(),
    ]),
  ),
  h: z.array(
    z.array(
      z.tuple([
        z.union([z.number().int().positive(), z.string()]),
        z.number().int(),
        z.string(),
        z.string(),
        z.number(),
        z.number(),
        z.number(),
      ]),
    ),
  ),
});
const months = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];
const plain = (html: string) =>
  html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');
export function victoryMetadata(article: string, page: string) {
  const text = plain(article);
  if (
    !/Videogame\s+Pokémon Champions\b/.test(text) ||
    !/Season\s+2027 Season\s*[–-]\s*VGC Regulation Set M-C\b/.test(text)
  )
    throw new Error('incompatible-format');
  const date = text.match(
    /Date\s+(\d{1,2})(?:[–-](\d{1,2}))?\s+([A-Za-z]+)\s+(\d{4})\b/,
  );
  const time = plain(
    page.match(/<p class="tp-fecha">([\s\S]*?)<\/p>/)?.[1] ?? '',
  ).match(/(\d{1,2})\s+([A-Za-z]+)\s*·\s*(\d{2}:\d{2}) UTC/);
  const month = months.indexOf(date?.[3] ?? '') + 1;
  if (
    !date ||
    !time ||
    !month ||
    Number(time[1]) !== Number(date[1]) ||
    time[2] !== date[3]
  )
    throw new Error('Unresolved Victory Road start date');
  const dateString = `${date[4]}-${String(month).padStart(2, '0')}-${date[1].padStart(2, '0')}T${time[3]}:00.000Z`;
  if (new Date(dateString).toISOString() !== dateString)
    throw new Error('Invalid Victory Road start date');
  const endsAt = date[2]
    ? `${date[4]}-${String(month).padStart(2, '0')}-${date[2].padStart(2, '0')}T23:59:59.999Z`
    : undefined;
  if (
    endsAt &&
    (new Date(endsAt).toISOString() !== endsAt ||
      Date.parse(endsAt) < Date.parse(dateString))
  )
    throw new Error('Invalid Victory Road end date');
  const players = Number(text.match(/Attendance\s+(\d+) players\b/)?.[1]);
  const pagePlayers = Number(
    page.match(/<div class="n">(\d+)<\/div><div class="l">Players<\/div>/)?.[1],
  );
  if (!Number.isInteger(players) || players !== pagePlayers)
    throw new Error('contradictory-entrant-count');
  return {
    date: dateString,
    endsAt,
    players,
    sheet: /\bOpen team lists\b/.test(text)
      ? ('open' as const)
      : ('unknown' as const),
  };
}
export function normalizeVictoryRoad(
  slug: string,
  article: string,
  page: string,
  snapshots: Snapshot[],
): NormalizedEvent {
  const metadata = victoryMetadata(article, page);
  const raw = page.match(
    /<script id="partidas-json" type="application\/json">([\s\S]*?)<\/script>/,
  )?.[1];
  if (!raw) throw new Error('Missing Victory Road round history');
  const data = payloadSchema.parse(JSON.parse(raw));
  if (
    data.ids.length !== metadata.players ||
    data.j.length !== data.ids.length ||
    data.h.length !== data.ids.length ||
    new Set(data.ids).size !== data.ids.length
  )
    throw new Error('Unresolved Victory Road roster coverage');
  const sourceIds = [
    ...new Set(
      [
        ...page.matchAll(
          /https:\/\/battlefy\.com\/victoryroad\/[^"\s/]+\/([a-f0-9]{24})\/info/g,
        ),
      ].map((m) => m[1]),
    ),
  ];
  if (sourceIds.length !== 1)
    throw new Error('Unresolved original Battlefy event');
  const event: NormalizedEvent = {
    id: `victory-road:${slug}`,
    name: plain(page.match(/<h1[^>]*>([\s\S]*?)<\/h1>/)?.[1] ?? slug),
    regulation: 'M-C',
    date: metadata.date,
    endsAt: metadata.endsAt,
    players: metadata.players,
    completed: false,
    platform: 'SWITCH',
    sheet: {
      visibility: metadata.sheet,
      basis: metadata.sheet === 'open' ? 'verified' : 'unknown',
      evidence: `Organizer results at ${articleOrigin}/${slug}/`,
    },
    phases: [
      {
        phase: 1,
        type: 'SWISS',
        mode: 'BO3',
        rounds: Math.max(
          0,
          ...data.h.flat().map((r) => (typeof r[0] === 'number' ? r[0] : 0)),
        ),
      },
      { phase: 2, type: 'SINGLE_BRACKET', mode: 'BO3', rounds: 4 },
    ],
    registrations: [],
    matches: [],
    quarantine: [],
    snapshots,
    provenance: {
      canonicalEvent: `battlefy:${sourceIds[0]}`,
      participantNamespace: 'battlefy',
      environment: 'champions-cartridge',
      official: 'unknown',
      population: 'registrations',
      sources: [
        {
          provider: 'victory-road',
          originalId: sourceIds[0],
          url: `${circuit}/tournament/${slug}`,
        },
      ],
    },
    accounting: {
      registrations: data.ids.length,
      malformedRegistrations: 0,
      matchRecords: data.h.flat().length,
      duplicateMatchRecords: 0,
      malformedMatchRecords: 0,
      conflictingMatchRecords: 0,
    },
  };
  const reason = eligibility(metadata.players);
  if (reason) throw new Error(reason);
  data.ids.forEach((player, i) => {
    let slots = null;
    try {
      if (data.j[i][5].length !== 6)
        throw new Error('Missing complete six-slot team');
      slots = data.j[i][5].map((s) =>
        normalizeSlot({ name: s[1], item: s[3] || null }),
      );
      if (new Set(slots.map((s) => s.id)).size !== 6)
        throw new Error('Duplicate team species');
    } catch (error) {
      slots = null;
      event.quarantine.push({
        kind: 'team',
        reason: error instanceof Error ? error.message : 'unresolved-team',
        evidence: data.j[i],
      });
    }
    event.registrations.push({ player, slots, drop: null });
  });
  type History = z.infer<typeof payloadSchema>['h'][number][number];
  const groups = new Map<string, { own: number; row: History }[]>();
  const cut = ['Top 16', 'Quarterfinals', 'Semifinals', 'Final'];
  data.h.forEach((rows, own) =>
    rows.forEach((row) => {
      const key = JSON.stringify([
        row[0],
        row[1] < 0 ? [own, 'bye'] : [own, row[1]].sort((a, b) => a - b),
      ]);
      const group = groups.get(key) ?? [];
      group.push({ own, row });
      groups.set(key, group);
    }),
  );
  for (const [id, group] of groups) {
    const { own, row } = group[0];
    const opponent = row[1];
    const phase = typeof row[0] === 'number' ? 1 : 2;
    const round = typeof row[0] === 'number' ? row[0] : cut.indexOf(row[0]) + 1;
    let winner: string | null = null;
    if (opponent >= data.ids.length || opponent === own || round < 1) {
      event.accounting!.conflictingMatchRecords += group.length;
      event.quarantine.push({
        kind: 'match',
        reason: 'malformed-or-unsupported-history',
        evidence: group,
      });
      continue;
    }
    const score = row[3].replace(/–/g, '-');
    const reverse = score.split('-').reverse().join('-');
    const decisive =
      (row[2] === 'V' && /^2-[01]$/.test(score)) ||
      (row[2] === 'D' && /^[01]-2$/.test(score));
    if (
      opponent >= 0 &&
      (group.length !== 2 ||
        group[1].own !== opponent ||
        group[1].row[1] !== own ||
        group[1].row[2] !== (row[2] === 'V' ? 'D' : 'V') ||
        group[1].row[3].replace(/–/g, '-') !== reverse ||
        !decisive)
    ) {
      event.accounting!.conflictingMatchRecords += group.length;
      event.quarantine.push({
        kind: 'match',
        reason: 'unresolved-reciprocal-result',
        evidence: group,
      });
      continue;
    }
    if (opponent >= 0) winner = data.ids[row[2] === 'V' ? own : opponent];
    event.accounting!.duplicateMatchRecords += group.length - 1;
    event.matches.push({
      id,
      phase,
      round,
      player1: data.ids[own],
      player2: opponent >= 0 ? data.ids[opponent] : null,
      winner,
    });
    if (opponent < 0)
      event.quarantine.push({
        kind: 'match',
        reason: 'bye-or-automatic-loss',
        evidence: group,
      });
    if (row[0] === 'Final' && winner) event.completed = true;
  }
  if (!event.completed) throw new Error('not-confirmed-completed');
  // Raw histories are series scores. Eligible reciprocal decisive records always reach two wins.
  return event;
}
export async function collectVictoryRoad(
  store: Store,
  asOf: string,
  report: CollectionReport,
  options: CollectorOptions = {},
  fetcher: typeof fetch = fetch,
) {
  const regulation = options.regulation ?? store.activeRegulation();
  // The circuit parser is audited only for M-C; other evidence stays unsupported.
  if (regulation !== 'M-C') return [];
  const refs: Snapshot[] = [];
  let reads = 0;
  const rateAware = (async (
    input: string | URL | Request,
    init?: RequestInit,
  ) => {
    const due = store.state<number>('victory-road-next-request') ?? 0;
    if (due > Date.now()) throw new Error('Victory Road provider cooldown');
    const response = await fetcher(input, init);
    const retry = response.headers.get('retry-after');
    if (response.status === 429 || (response.status >= 500 && retry)) {
      const duration = retry
        ? Number.isFinite(Number(retry))
          ? Number(retry) * 1000
          : Date.parse(retry) - Date.now()
        : 60000;
      store.saveState(
        'victory-road-next-request',
        Date.now() +
          Math.max(1000, Number.isFinite(duration) ? duration : 60000),
      );
    }
    return response;
  }) as typeof fetch;
  const read = async (url: string) => {
    options.signal?.throwIfAborted();
    if (++reads > (options.maxReads ?? 100))
      throw new Error('Victory Road request budget reached');
    options.heartbeat?.();
    const body = await fetchBounded(url, rateAware, options.signal);
    const ref = store.snapshot(url, body, new Date().toISOString());
    refs.push(ref);
    report.snapshots.push(ref);
    return body;
  };
  const index = await read(`${circuit}/`);
  if (
    !index.includes('VR Circuit 2027') ||
    !index.includes('Pokémon Champions')
  )
    throw new Error('Unrecognized Victory Road circuit index');
  const slugs = [
    ...new Set(
      [...index.matchAll(/href="\/tournament\/(vr-[a-z0-9-]+)"/g)].map(
        (m) => m[1],
      ),
    ),
  ];
  if (!slugs.length || slugs.length > 50)
    throw new Error('Unresolved Victory Road discovery');
  const interval = coverageInterval(regulation, asOf, store.config);
  const end = Date.parse(interval.cutoff),
    start = Date.parse(interval.start);
  const events = new Map(
    (store.forRegulation(regulation, options.stage)?.events ?? [])
      .filter(
        (e) =>
          provenance(e).sources.some((s) => s.provider === 'victory-road') &&
          provenance(e).official !== 'verified' &&
          e.regulation === regulation &&
          Date.parse(e.date) >= start &&
          Date.parse(e.date) <= end,
      )
      .map((e) => [e.id, e]),
  );
  for (const slug of slugs) {
    const id = `victory-road:${slug}`,
      offset = refs.length;
    const cacheKey: string = `victory-road:${slug}:${regulation}`;
    const cached = store.cache(cacheKey) ?? store.cache(id);
    if (
      !options.force &&
      cached &&
      !cached.event &&
      Date.parse(asOf) - Date.parse(cached.retrievedAt) < 7 * 86400000
    ) {
      report.excluded.push({
        id,
        reason: cached.reason ?? 'unsupported-evidence',
        evidence: null,
      });
      continue;
    }
    if (
      !options.force &&
      cached?.event &&
      cached.event.regulation === regulation &&
      Date.parse(asOf) - Date.parse(cached.retrievedAt) >= 0 &&
      Date.parse(asOf) - Date.parse(cached.retrievedAt) <
        (end - Date.parse(cached.event.date) > 7 * 86400000
          ? 7 * 86400000
          : 86400000) &&
      Date.parse(cached.event.date) >= start &&
      Date.parse(cached.event.date) <= end
    ) {
      events.set(id, cached.event);
      report.cached++;
      continue;
    }
    const workKey = `${cacheKey}:work${options.finalJob ? ':' + options.finalJob : ''}`;
    const work = store.state<{
      bodies: Record<string, { body: string; ref: Snapshot }>;
    }>(workKey) ?? { bodies: {} };
    const eventRead = async (url: string) => {
      const saved = work.bodies[url];
      if (saved) {
        refs.push(saved.ref);
        report.snapshots.push(saved.ref);
        return saved.body;
      }
      const body = await read(url);
      work.bodies[url] = { body, ref: refs.at(-1)! };
      store.saveState(workKey, work);
      return body;
    };
    try {
      const article = await eventRead(`${articleOrigin}/${slug}/`);
      if (
        !plain(article).includes('Pokémon Champions') ||
        !/VGC Regulation Set M-C\b/.test(plain(article))
      ) {
        report.excluded.push({
          id,
          reason: 'incompatible-format',
          evidence: refs.at(-1),
        });
        events.delete(id);
        store.saveState(workKey, null);
        continue;
      }
      const page = await eventRead(`${circuit}/tournament/${slug}`);
      const metadata = victoryMetadata(article, page);
      if (
        Date.parse(metadata.date) < start ||
        Date.parse(metadata.date) > end
      ) {
        report.excluded.push({
          id,
          reason: 'outside-window',
          evidence: metadata,
        });
        events.delete(id);
        store.saveState(workKey, null);
        continue;
      }
      const reason = eligibility(metadata.players);
      if (reason) {
        report.excluded.push({ id, reason, evidence: metadata });
        events.delete(id);
        store.saveState(workKey, null);
        continue;
      }
      const event = normalizeVictoryRoad(
        slug,
        article,
        page,
        refs.slice(offset),
      );
      store.saveCache(cacheKey, asOf, event);
      events.set(id, event);
      report.refreshed++;
      store.saveState(workKey, null);
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'source-failure';
      const kind = failureClass(error);
      if (options.signal?.aborted || kind === 'lease-contention') throw error;
      if (
        [
          'request-budget',
          'rate-limit',
          'transient-failure',
          'access-denied',
        ].includes(kind)
      )
        report.discovery = 'partial';
      else {
        store.saveCache(cacheKey, asOf, null, reason);
        store.saveState(workKey, null);
      }
      if (events.has(id)) report.carriedForward.push(id);
      report.excluded.push({
        id,
        reason: kind,
        evidence: { message: reason, snapshots: refs.slice(offset) },
      });
      if (kind === 'request-budget' || kind === 'rate-limit') break;
    }
  }
  return [...events.values()];
}
