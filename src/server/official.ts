import { z } from 'zod';
import { normalizeSlot, NORMALIZATION_VERSION } from '../domain/normalize';
import { eligibility, provenance } from '../domain/sources';
import { coverageInterval, requireRegulation } from '../domain/regulations';
import { reconcileRecords } from '../domain/reconciliation';
import type {
  CollectionReport,
  NormalizedEvent,
  Snapshot,
} from '../domain/types';
import { fetchBounded, failureClass, type CollectorOptions } from './collector';
import { Store } from './store';
const origin = 'https://pokedata.ovh/standings2/';
const plain = (html: string) =>
  html
    .replace(/<script\b[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;|&#160;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
// JSON literals are parsed as data. Provider JavaScript is never evaluated or reused.
function literal(html: string, label: string) {
  const prefix = `${label} = `;
  const values: unknown[] = [];
  let offset = 0;
  while (true) {
    const start = html.indexOf(prefix, offset);
    if (start < 0) break;
    offset = start + prefix.length;
    const tail = html.slice(offset);
    const end = tail.search(/;\r?\n/);
    if (end < 0) continue;
    try {
      values.push(JSON.parse(tail.slice(0, end)));
    } catch {
      /* Runtime reassignment expressions are not JSON source evidence. */
    }
  }
  if (values.length !== 1)
    throw new Error(`Missing or ambiguous ${label} JSON literal`);
  return values[0];
}
export type OfficialListing = {
  id: string;
  name: string;
  type: 'regional' | 'special' | 'international' | 'worlds';
  article: string | null;
};
export function discoverOfficial(
  html: string,
  season?: string,
): OfficialListing[] {
  const result: OfficialListing[] = [];
  for (const m of html.matchAll(
    /<div class="tournament vg"[\s\S]*?<div class="title">([^<]+)<\/div>[\s\S]*?<input type="hidden" name="id" value="(\d+)"/g,
  )) {
    const name = plain(m[1]);
    if (
      (season && !name.startsWith(`${season} `)) ||
      !/Pokémon VGC|World Championships/.test(name)
    )
      continue;
    const type = name.includes('Regional Championships')
      ? 'regional'
      : /Special (?:Event|Championships)/.test(name)
        ? 'special'
        : name.includes('International Championships')
          ? 'international'
          : name.includes('World Championships')
            ? 'worlds'
            : null;
    if (!type) continue;
    const item: OfficialListing = {
      id: m[2],
      name,
      type,
      article: null,
    };
    if (result.some((e) => e.id === item.id && e.name !== item.name))
      throw new Error('Conflicting official listing identity');
    if (!result.some((e) => e.id === item.id)) result.push(item);
  }
  if (!html.includes('hidden-form') || !html.includes('class="tournament'))
    throw new Error('Unrecognized official listing');
  if (result.length > 100) throw new Error('Official discovery bound exceeded');
  if (/pagination|[?&]page=|load.more/i.test(html))
    throw new Error('Unaudited official listing pagination');
  return result;
}
export function officialMetadata(listing: OfficialListing, article: string) {
  const season = listing.name.match(/^(20\d{2}) /)?.[1];
  if (!season) throw new Error('unresolved-championship-season');
  const rows = new Map(
    [...article.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map((m) => {
      const cells = [
        ...m[1].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi),
      ].map((c) => plain(c[1]));
      return [cells[0], cells[1]];
    }),
  );
  const game = rows.get('Videogame') ?? '',
    format = rows.get('Season') ?? '';
  if (!game.startsWith('Pokémon Champions'))
    throw new Error('incompatible-game');
  const regulation = format.match(/VGC Regulation Set (M-[A-Z])\b/)?.[1];
  if (!regulation || !format.startsWith(`${season} Season`))
    throw new Error('unresolved-regulation-or-season');
  const count = rows
    .get('Attendance')
    ?.match(/^([\d,]+)(?: (?:qualified )?players)?\s*(?:\(MA\)|MA)(?:\s|$)/);
  // Parenthesized MA and plain MA are both observed; combined attendance is never used.
  const players = count ? Number(count[1].replaceAll(',', '')) : NaN;
  if (eligibility(players)) throw new Error(eligibility(players)!);
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
  const date = rows
    .get('Date')
    ?.match(/^(\d{1,2})(?:[–-](\d{1,2}))? ([A-Za-z]+) (\d{4})$/);
  const month = months.indexOf(date?.[3] ?? '') + 1;
  if (!date || !month) throw new Error('unresolved-official-date');
  const dateString = `${date[4]}-${String(month).padStart(2, '0')}-${date[1].padStart(2, '0')}T00:00:00.000Z`;
  const endsAt = new Date(
    Date.parse(
      `${date[4]}-${String(month).padStart(2, '0')}-${(date[2] ?? date[1]).padStart(2, '0')}T00:00:00.000Z`,
    ) +
      86400000 -
      1,
  ).toISOString();
  if (new Date(dateString).toISOString() !== dateString)
    throw new Error('Invalid official date');
  const rounds = rows
    .get('Format')
    ?.match(/^(\d+)(?:\+(\d+))? Swiss rounds \+ asymmetrical(?: X-2)? top cut/);
  if (!rounds) throw new Error('unresolved-official-phases');
  const eventLabel = rows.get('Event') ?? '';
  const canonicalName = (name: string) =>
    name.replace(' Pokémon VGC', '').replace(/\s+/g, ' ').trim();
  if (canonicalName(eventLabel) !== canonicalName(listing.name))
    throw new Error('unresolved-official-metadata-identity');
  return {
    regulation,
    players,
    date: dateString,
    endsAt,
    season,
    swiss: Number(rounds[1]) + Number(rounds[2] ?? 0),
    sheet: rows.get('Format')?.includes('Open team lists')
      ? ('open' as const)
      : ('unknown' as const),
  };
}
const teamSlot = z.tuple([
  z.string(),
  z.string(),
  z.string().nullable(),
  z.string().nullable(),
  z.string(),
  z.string(),
  z.string(),
  z.array(z.string()),
]);
const participant = z
  .object({
    i: z.number().int().nonnegative(),
    n: z.string(),
    c: z.string().nullable(),
    d: z.number().int().nullable(),
    q: z.boolean(),
    r: z.array(z.unknown()),
    o: z
      .object({
        'Team List': z.string().optional(),
        d: z.string().optional(),
        n: z.string().optional(),
        c: z.string().optional(),
        tl: z.array(z.unknown()).optional(),
      })
      .passthrough()
      .nullish(),
  })
  .passthrough();
export function normalizeOfficial(
  listing: OfficialListing,
  article: string,
  html: string,
  snapshots: Snapshot[],
): NormalizedEvent {
  const meta = officialMetadata(listing, article);
  const count = Number(
    html.match(/window\.EXPECTED_COMPETITORS\s*=\s*(\d+)/)?.[1],
  );
  if (count !== meta.players)
    throw new Error('contradictory-masters-entrant-count');
  if (
    !html.includes(`const divisionName = "Masters"`) ||
    !html.includes(`const tournamentId = "${listing.id}"`) ||
    plain(html.match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? '') !== listing.name
  )
    throw new Error('unresolved-masters-division-or-identity');
  const raw = z
    .record(z.string(), z.unknown())
    .parse(literal(html, 'window.playersDataMap'));
  const linkIds = [
    ...new Set(
      [
        ...html.matchAll(
          /https:\/\/rk9\.gg\/(?:tournament|roster|pairings)\/([A-Za-z0-9-]+)/g,
        ),
      ].map((m) => m[1]),
    ),
  ];
  const rosterIds = [
    ...new Set(
      Object.values(raw).flatMap((value) => {
        const p = participant.safeParse(value);
        const ref = p.success ? p.data.o?.['Team List'] : undefined;
        const id = ref?.match(/^([A-Za-z0-9-]+)\/[A-Za-z0-9]+$/)?.[1];
        return id ? [id] : [];
      }),
    ),
  ];
  const originalIds = rosterIds.length ? rosterIds : linkIds;
  if (originalIds.length !== 1) throw new Error('unresolved-original-event');
  const original = originalIds[0];
  if (linkIds.length && !linkIds.includes(original))
    throw new Error('conflicting-original-event-identity');
  if (
    !article.includes(`https://rk9.gg/tournament/${original}`) &&
    !article.includes(`https://rk9.gg/roster/${original}`) &&
    !article.includes(`https://rk9.gg/pairings/${original}`)
  )
    throw new Error('conflicting-original-event-identity');
  if (Object.keys(raw).length !== count)
    throw new Error('incomplete-official-roster');
  const parsed = new Map<number, z.infer<typeof participant>>();
  const e: NormalizedEvent = {
    id: `rk9:${original}:masters`,
    name: listing.name,
    regulation: meta.regulation,
    date: meta.date,
    endsAt: meta.endsAt,
    players: count,
    completed: false,
    platform: 'SWITCH',
    sheet: {
      visibility: meta.sheet,
      basis: meta.sheet === 'open' ? 'verified' : 'unknown',
      evidence: listing.article!,
    },
    phases: [
      { phase: 1, type: 'SWISS', mode: 'BO1/BO3', rounds: meta.swiss },
      { phase: 2, type: 'SINGLE_BRACKET', mode: 'BO1/BO3', rounds: 0 },
    ],
    registrations: [],
    matches: [],
    quarantine: [],
    snapshots,
    provenance: {
      canonicalEvent: `rk9:${original}`,
      participantNamespace: `rk9:${original}:masters`,
      environment: 'champions-cartridge',
      official: 'verified',
      population: 'registrations',
      division: 'masters',
      eventType: listing.type,
      season: meta.season,
      roster: 'complete',
      regulationEvidence: listing.article!,
      divisionEvidence: `${origin} (id=${listing.id}, division=Masters)`,
      entrantEvidence: [count, meta.players],
      seriesGranularity: 'round-result',
      seriesEvidence:
        'Reciprocal opponent/index/round/table/result records, one result per tournament round; per-game scores and BO length unavailable',
      sources: [
        {
          provider: 'pokedata',
          originalId: original,
          url: origin,
          role: 'records',
        },
        {
          provider: 'rk9',
          originalId: original,
          url: `https://rk9.gg/pairings/${original}`,
          role: 'original',
        },
        {
          provider: 'victory-road',
          originalId: original,
          url: listing.article!,
          role: 'metadata',
        },
      ],
    },
    accounting: {
      registrations: count,
      malformedRegistrations: 0,
      matchRecords: 0,
      duplicateMatchRecords: 0,
      malformedMatchRecords: 0,
      conflictingMatchRecords: 0,
    },
  };
  const teamKeys = new Map<string, number>();
  const identity = new Map<number, string>();
  for (const value of Object.values(raw)) {
    const result = participant.safeParse(value),
      ref = result.success ? result.data.o?.['Team List'] : undefined;
    if (ref) teamKeys.set(ref, (teamKeys.get(ref) ?? 0) + 1);
  }
  for (const [key, value] of Object.entries(raw)) {
    const result = participant.safeParse(value);
    if (!result.success) {
      e.accounting!.malformedRegistrations++;
      const histories =
        value &&
        typeof value === 'object' &&
        'r' in value &&
        Array.isArray(value.r)
          ? value.r.length
          : 0;
      e.accounting!.matchRecords += histories;
      e.accounting!.malformedMatchRecords += histories;
      e.quarantine.push({
        kind: 'registration',
        reason: 'malformed-registration',
        evidence: { key, value },
      });
      continue;
    }
    const p = result.data;
    if (String(p.i) !== key || parsed.has(p.i))
      throw new Error('conflicting-participant-identity');
    if (p.o?.d && p.o.d !== 'M')
      throw new Error('contradictory-masters-division');
    parsed.set(p.i, p);
    let slots = null;
    try {
      const ref = p.o?.['Team List'];
      if (
        !ref ||
        !new RegExp(`^${original}/[A-Za-z0-9]+$`).test(ref) ||
        teamKeys.get(ref) !== 1 ||
        p.o?.n !== p.n ||
        p.o?.c !== p.c ||
        p.o?.d !== 'M'
      )
        throw new Error('unresolved-team-roster-join');
      if (p.o?.tl?.length !== 6) throw new Error('missing-complete-team');
      slots = p.o.tl.map((value) => {
        const s = teamSlot.parse(value);
        const slot = normalizeSlot({
          name: s[5],
          item: s[6] || null,
          ability: s[4] || null,
          nature: s[2] || null,
          attacks: s[7],
        });
        return { ...slot, originalId: `${s[0]}_${s[1]}`, originalForm: s[1] };
      });
      if (new Set(slots.map((s) => s.id)).size !== 6)
        throw new Error('duplicate-team-species');
    } catch (error) {
      slots = null;
      e.quarantine.push({
        kind: 'team',
        reason: error instanceof Error ? error.message : 'unresolved-team',
        evidence: { key, record: value },
      });
    }
    const ref = p.o?.['Team List'];
    const player =
      ref && ref.startsWith(`${original}/`) && teamKeys.get(ref) === 1
        ? ref
        : `unresolved:${p.i}`;
    identity.set(p.i, player);
    e.registrations.push({
      player,
      sourcePlayer: String(p.i),
      slots,
      drop: p.d,
    });
  }
  type History = {
    player: number;
    round: number;
    raw: unknown;
    opponent: number;
    result: number;
    table: number | null;
  };
  const groups = new Map<string, History[]>();
  const history = z.tuple([
    z.number().int(),
    z.number().int(),
    z.number().int().nullable(),
  ]);
  for (const p of parsed.values())
    p.r.forEach((record, i) => {
      e.accounting!.matchRecords++;
      const row = history.safeParse(record);
      if (!row.success) {
        e.accounting!.malformedMatchRecords++;
        e.quarantine.push({
          kind: 'match',
          reason: 'malformed-history',
          evidence: { player: p.i, round: i + 1, record },
        });
        return;
      }
      const [opponent, result, table] = row.data;
      const key = JSON.stringify([
        i + 1,
        opponent < 0 ? [p.i, opponent] : [p.i, opponent].sort((a, b) => a - b),
      ]);
      const group = groups.get(key) ?? [];
      group.push({
        player: p.i,
        round: i + 1,
        raw: record,
        opponent,
        result,
        table,
      });
      groups.set(key, group);
    });
  for (const rows of groups.values()) {
    const a = rows[0],
      b = rows[1];
    const reason =
      a.opponent < 0
        ? 'bye-or-automatic-loss'
        : a.opponent === a.player
          ? 'self-pairing'
          : !parsed.has(a.opponent)
            ? 'unresolved-opponent'
            : rows.length !== 2 ||
                !b ||
                b.player !== a.opponent ||
                b.opponent !== a.player ||
                b.table !== a.table
              ? 'unresolved-reciprocal-result'
              : a.result === 1 && b.result === 1
                ? 'tie'
                : a.result === 0 && b.result === 0
                  ? 'double-loss'
                  : ![0, 3].includes(a.result) || b.result !== 3 - a.result
                    ? 'ambiguous-outcome'
                    : parsed.get(a.player)?.q ||
                        parsed.get(a.opponent)?.q ||
                        (a.table ?? 0) <= 0
                      ? 'administrative-or-unknown-table'
                      : null;
    if (
      reason &&
      ![
        'bye-or-automatic-loss',
        'tie',
        'double-loss',
        'administrative-or-unknown-table',
      ].includes(reason)
    ) {
      e.accounting!.conflictingMatchRecords += rows.length;
      e.quarantine.push({ kind: 'match', reason, evidence: rows });
      continue;
    }
    e.accounting!.duplicateMatchRecords += rows.length - 1;
    const player1 = identity.get(a.player)!,
      player2 = identity.get(a.opponent) ?? null;
    const id = JSON.stringify([
      a.round,
      a.table,
      [player1, player2 ?? `bye:${a.opponent}`].sort(),
    ]);
    const winner = !reason
      ? identity.get(a.result === 3 ? a.player : a.opponent)!
      : reason === 'tie'
        ? 0
        : reason === 'double-loss'
          ? -1
          : null;
    e.matches.push({
      id,
      phase: a.round <= meta.swiss ? 1 : 2,
      round: a.round,
      player1,
      player2,
      winner,
      administrative: reason === 'administrative-or-unknown-table',
    });
    if (reason) e.quarantine.push({ kind: 'match', reason, evidence: rows });
    else if (
      !e.registrations.find((r) => r.player === player1)?.slots ||
      !e.registrations.find((r) => r.player === player2)?.slots
    )
      e.quarantine.push({
        kind: 'match',
        reason: 'missing-complete-team',
        evidence: rows,
      });
  }
  const finalRound = Math.max(
    0,
    ...e.matches
      .filter((m) => m.phase === 2 && m.player2 && typeof m.winner === 'string')
      .map((m) => m.round),
  );
  e.phases[1].rounds = Math.max(0, finalRound - meta.swiss);
  // A single decisive final plus a published champion corroborates completion, never supplies outcomes.
  const finals = e.matches.filter(
    (m) =>
      m.round === finalRound && m.phase === 2 && typeof m.winner === 'string',
  );
  const champion = z
    .array(z.object({ i: z.number(), r: z.number() }))
    .parse(literal(html, 'const rawPlayers'))
    .filter((p) => p.r === 1);
  e.completed =
    finals.length === 1 &&
    champion.length === 1 &&
    finals[0].winner === identity.get(champion[0].i) &&
    /column-header-title">Finals?<\//.test(html);
  if (!e.completed) throw new Error('not-confirmed-completed');
  reconcileRecords(e);
  return e;
}
export async function collectOfficial(
  store: Store,
  asOf: string,
  report: CollectionReport,
  options: CollectorOptions = {},
  fetcher: typeof fetch = fetch,
) {
  const regulation = options.regulation ?? store.activeRegulation();
  const { season } = requireRegulation(regulation, store.config);
  const checkpoint = `official:${season}:${regulation}:masters:${NORMALIZATION_VERSION}${options.finalJob ? ':' + options.finalJob : ''}`;
  const savedProgress = store.state<{ asOf: string; completed: string[] }>(
    `${checkpoint}:progress`,
  );
  const progress =
    savedProgress && Date.parse(asOf) >= Date.parse(savedProgress.asOf)
      ? savedProgress
      : { asOf, completed: [] as string[] };
  let retryNeeded = false;
  let reads = 0;
  const read = async (url: string, form?: string) => {
    options.signal?.throwIfAborted();
    options.heartbeat?.();
    if (++reads > (options.maxReads ?? 100))
      throw new Error('Official request budget reached; progress saved');
    const rateAware = (async (
      input: string | URL | Request,
      init?: RequestInit,
    ) => {
      const cooldownKey =
        new URL(url).hostname === 'pokedata.ovh'
          ? 'pokedata-next-request'
          : 'victory-road-next-request';
      const until = store.state<number>(cooldownKey) ?? 0;
      if (until > Date.now()) throw new Error('Pokedata cooldown; retry later');
      await store.checkpoint();
      const response = await fetcher(input, {
        ...init,
        ...(form
          ? {
              method: 'POST',
              headers: {
                ...init?.headers,
                'Content-Type': 'application/x-www-form-urlencoded',
              },
              body: form,
            }
          : {}),
      });
      if (response.status === 429) {
        const value = response.headers.get('retry-after');
        const seconds = Number(value);
        const duration = value
          ? Number.isFinite(seconds)
            ? seconds * 1000
            : Date.parse(value) - Date.now()
          : 300000;
        store.saveState(
          cooldownKey,
          Date.now() +
            Math.max(300000, Number.isFinite(duration) ? duration : 300000),
        );
      }
      await store.checkpoint();
      return response;
    }) as typeof fetch;
    const body = await fetchBounded(url, rateAware, options.signal);
    const ref = store.snapshot(
      form ? `${url}?${form}` : url,
      body,
      new Date().toISOString(),
    );
    report.snapshots.push(ref);
    return { body, ref };
  };
  const interval = coverageInterval(regulation, asOf, store.config);
  const end = Date.parse(interval.cutoff),
    start = Date.parse(interval.start);
  const surviving = (
    store.forRegulation(regulation, options.stage)?.events ?? []
  ).filter(
    (e) =>
      e.regulation === regulation &&
      provenance(e).official === 'verified' &&
      Date.parse(e.date) >= start &&
      Date.parse(e.date) <= end,
  );
  const events = new Map(surviving.map((e) => [e.id, e]));
  const refreshed = new Set<string>();
  try {
    const index = await read(origin);
    const candidates = discoverOfficial(index.body, season);
    const calendar = await read(
      `https://victoryroad.pro/${season}-season-calendar/`,
    );
    const links = [
      ...calendar.body.matchAll(
        /href="(https:\/\/victoryroad\.pro\/[a-z0-9-]+\/)"/g,
      ),
    ].map((m) => m[1]);
    for (const listing of candidates) {
      const location = listing.name
        .replace(/^20\d{2} /, '')
        .replace(/ Pokémon VGC.*$/, '');
      const label =
        listing.type === 'international'
          ? location
              .split(' ')
              .map((v) => v[0])
              .join('')
              .toLowerCase() + 'ic'
          : location;
      const slug =
        listing.type === 'worlds'
          ? `${season}-worlds`
          : `${season}-${label
              .toLowerCase()
              .normalize('NFKD')
              .replace(/[\u0300-\u036f]/g, '')
              .replace(/[^a-z0-9]+/g, '-')}`;
      const url = `https://victoryroad.pro/${slug}/`;
      listing.article = links.includes(url) ? url : null;
    }
    store.saveState(`${checkpoint}:listing`, {
      asOf,
      candidates,
      snapshot: index.ref,
      coverage: 'exhausted-public-listing-not-worldwide-census',
    });
    for (const listing of candidates) {
      const key = `pokedata:${listing.id}:masters:${regulation}:${NORMALIZATION_VERSION}`;
      if (!listing.article) {
        report.excluded.push({
          id: listing.id,
          reason: 'unaudited-official-event-contract',
          evidence: listing,
        });
        continue;
      }
      const cached = store.cache(key),
        age = Date.parse(asOf) - Date.parse(cached?.retrievedAt ?? '');
      if (
        (!options.force || progress.completed.includes(listing.id)) &&
        cached?.event &&
        cached.event.name === listing.name &&
        cached.event.regulation === regulation &&
        age >= 0 &&
        age <
          (end - Date.parse(cached.event.date) > 7 * 86400000
            ? 7 * 86400000
            : 86400000) &&
        Date.parse(cached.event.date) >= start &&
        Date.parse(cached.event.date) <= end
      ) {
        events.set(cached.event.id, cached.event);
        report.cached++;
        continue;
      }
      const workKey = `${checkpoint}:article:${listing.id}`;
      let article = store.state<{ body: string; ref: Snapshot }>(workKey);
      try {
        article ??= await read(listing.article);
        store.saveState(workKey, article);
        const meta = officialMetadata(listing, article.body);
        if (meta.regulation !== regulation) {
          report.excluded.push({
            id: listing.id,
            reason: 'unsupported-or-inactive-regulation',
            evidence: { metadata: meta, snapshot: article.ref },
          });
          continue;
        }
        if (Date.parse(meta.date) < start || Date.parse(meta.date) > end) {
          report.excluded.push({
            id: listing.id,
            reason: 'outside-window',
            evidence: meta,
          });
          continue;
        }
        const page = await read(origin, `id=${listing.id}&division=Masters`);
        const event = normalizeOfficial(listing, article.body, page.body, [
          index.ref,
          article.ref,
          page.ref,
        ]);
        store.saveCache(key, asOf, event);
        store.clearState(workKey);
        events.set(event.id, event);
        refreshed.add(event.id);
        report.refreshed++;
        progress.completed.push(listing.id);
        store.saveState(`${checkpoint}:progress`, progress);
      } catch (error) {
        const kind = failureClass(error);
        if (options.signal?.aborted || kind === 'lease-contention') throw error;
        retryNeeded ||= [
          'request-budget',
          'rate-limit',
          'transient-failure',
          'access-denied',
        ].includes(kind);
        if (retryNeeded) report.discovery = 'partial';
        if (
          ![
            'request-budget',
            'rate-limit',
            'transient-failure',
            'access-denied',
          ].includes(kind)
        ) {
          store.saveCache(
            key,
            asOf,
            null,
            error instanceof Error ? error.message : kind,
          );
          store.clearState(workKey);
        }
        report.excluded.push({
          id: listing.id,
          reason: kind,
          evidence: {
            snapshot: article?.ref ?? listing,
            message: error instanceof Error ? error.message : kind,
          },
        });
        if (kind === 'request-budget' || kind === 'rate-limit') break;
      }
    }
  } catch (error) {
    retryNeeded = true;
    report.discovery = 'partial';
    report.excluded.push({
      id: 'official-provider',
      reason:
        error instanceof Error ? error.message : 'official-source-failure',
      evidence: { checkpoint },
    });
  }
  if (retryNeeded) store.saveState(`${checkpoint}:progress`, progress);
  else store.clearState(`${checkpoint}:progress`);
  report.carriedForward.push(
    ...surviving.filter((e) => !refreshed.has(e.id)).map((e) => e.id),
  );
  store.saveState(`${checkpoint}:report`, report);
  return [...events.values()];
}
