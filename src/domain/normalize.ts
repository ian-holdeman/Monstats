import { Dex } from '@pkmn/dex';
import { z } from 'zod';
import { rejection } from './analytics';
import type { NormalizedEvent, Sheet, Slot, Snapshot } from './types';
export const NORMALIZATION_VERSION = 'limitless-champions-v1';
const nullableText = z.string().nullish();
const rawSlot = z
  .object({
    id: nullableText,
    name: z.string().min(1),
    item: nullableText,
    ability: nullableText,
    attacks: z.array(z.string()).nullish(),
    nature: nullableText,
    stats: z.record(z.string(), z.unknown()).nullish(),
  })
  .passthrough();
const rawRegistration = z
  .object({
    player: z.string().min(1),
    decklist: z.array(z.unknown()).nullish(),
    drop: z.number().int().nullish(),
  })
  .passthrough();
const rawMatch = z
  .object({
    phase: z.number().int().positive(),
    round: z.number().int().positive(),
    table: z.number().int().nullish(),
    match: nullableText,
    player1: z.string().min(1),
    player2: nullableText,
    winner: z.union([z.string(), z.number()]).nullish(),
    administrative: z.boolean().optional(),
  })
  .passthrough();
export const detailsSchema = z
  .object({
    id: z.string().regex(/^[a-f0-9]{24}$/),
    game: z.literal('VGC'),
    format: z.string().regex(/^M-[A-Z]$/),
    name: z.string(),
    date: z.iso.datetime(),
    players: z.number().int().nonnegative(),
    platform: z.string(),
    decklists: z.boolean(),
    isPublic: z.boolean(),
    phases: z.array(
      z.object({
        phase: z.number().int().positive(),
        type: z.string(),
        rounds: z.number().int().nonnegative(),
        mode: z.string(),
      }),
    ),
    specialRules: z.array(z.string()).optional(),
    bannedCards: z.array(z.unknown()).optional(),
  })
  .passthrough();
const aliases: Record<string, string> = {
  'Eternal Flower Floette': 'Floette-Eternal',
  'Alolan Ninetales': 'Ninetales-Alola',
  'Hisuian Arcanine': 'Arcanine-Hisui',
  'Hisuian Goodra': 'Goodra-Hisui',
  'Hisuian Typhlosion': 'Typhlosion-Hisui',
  'Hisuian Decidueye': 'Decidueye-Hisui',
  'Heat Rotom': 'Rotom-Heat',
  'Indeedee ♀': 'Indeedee-F',
  'Basculegion ♀': 'Basculegion-F',
  'Meowstic ♀': 'Meowstic-F',
};
export function normalizeSlot(input: unknown): Slot {
  const raw = rawSlot.parse(input);
  const fromName = Dex.species.get(aliases[raw.name] ?? raw.name),
    fromId = raw.id ? Dex.species.get(raw.id) : null;
  if (
    !fromName.exists ||
    (fromId && (!fromId.exists || fromId.id !== fromName.id))
  )
    throw new Error(`Unresolved or conflicting identity: ${raw.name}`);
  let canonical = fromName;
  let derivedForm: string | null = null;
  if (raw.item) {
    const item = Dex.items.get(raw.item);
    if (item.exists && item.megaStone) {
      const target = Object.entries(item.megaStone).find(
        ([holder]) =>
          Dex.species.get(holder).baseSpecies === fromName.baseSpecies,
      )?.[1];
      const derived = Dex.species.get(target ?? '');
      if (derived.exists && derived.baseSpecies === fromName.baseSpecies) {
        canonical = derived;
        derivedForm = derived.name;
      } else throw new Error('Conflicting Mega stone holder');
    }
  }
  return {
    id: canonical.id,
    name: canonical.name,
    originalName: raw.name,
    originalId: raw.id ?? null,
    derivedForm,
    item: raw.item ?? null,
    ability: raw.ability ?? null,
    moves: raw.attacks ?? null,
    nature: raw.nature ?? null,
    stats: raw.stats ?? null,
  };
}
export function classifySheet(html: string, url: string): Sheet {
  // Restrict classification to the organizer's description, not unrelated navigation.
  const description =
    html.match(/<div class="description[^\"]*">([\s\S]*?)<\/div>/i)?.[1] ?? '';
  const text = description.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');
  const open = /\b(open\s+team\s*sheets?|OTS)\b/i.test(text),
    closed = /\b(closed\s+team\s*sheets?|CTS)\b/i.test(text);
  if (open !== closed)
    return {
      visibility: open ? 'open' : 'closed',
      basis: 'verified',
      evidence: `Organizer description at ${url}`,
    };
  return {
    visibility: 'unknown',
    basis: 'unknown',
    evidence: open
      ? 'Conflicting organizer description'
      : 'No explicit sheet visibility in organizer description',
  };
}
export function completedIds(html: string): Set<string> {
  if (!html.includes('<title>Completed Tournaments | Limitless</title>'))
    throw new Error('Unrecognized completed-events response');
  return new Set(
    [...html.matchAll(/href="\/tournament\/([a-f0-9]{24})\/standings"/g)].map(
      (x) => x[1],
    ),
  );
}
export function normalizeEvent(
  details: unknown,
  standings: unknown,
  pairings: unknown,
  sheet: Sheet,
  snapshots: Snapshot[],
  completed: boolean,
): NormalizedEvent {
  const d = detailsSchema.parse(details);
  if (
    !d.isPublic ||
    !d.decklists ||
    d.platform !== 'SWITCH' ||
    (d.specialRules?.length ?? 0) > 0 ||
    (d.bannedCards?.length ?? 0) > 0
  )
    throw new Error(
      'Event is not a public, standard Champions cartridge event with submitted teams',
    );
  const e: NormalizedEvent = {
    id: d.id,
    name: d.name,
    regulation: d.format,
    date: d.date,
    players: d.players,
    platform: d.platform,
    phases: d.phases,
    completed,
    sheet,
    snapshots,
    registrations: [],
    matches: [],
    quarantine: [],
  };
  const registrations = z.array(z.unknown()).parse(standings),
    matches = z.array(z.unknown()).parse(pairings);
  const players = new Set<string>();
  for (const input of registrations) {
    const parsed = rawRegistration.safeParse(input);
    if (!parsed.success) {
      e.quarantine.push({
        kind: 'registration',
        reason: 'malformed-registration',
        evidence: input,
      });
      continue;
    }
    const r = parsed.data;
    if (players.has(r.player))
      throw new Error('Duplicate registration identity');
    players.add(r.player);
    let slots: Slot[] | null = null;
    try {
      if (r.decklist?.length !== 6)
        throw new Error('Missing or incomplete six-slot team');
      slots = r.decklist.map(normalizeSlot);
      if (new Set(slots.map((s) => s.id)).size !== 6)
        throw new Error('Duplicate team species');
    } catch (error) {
      e.quarantine.push({
        kind: 'team',
        reason: error instanceof Error ? error.message : 'unresolved-team',
        evidence: input,
      });
    }
    e.registrations.push({ player: r.player, slots, drop: r.drop ?? null });
  }
  const seen = new Map<string, string>();
  for (const input of matches) {
    const parsed = rawMatch.safeParse(input);
    if (!parsed.success) {
      e.quarantine.push({
        kind: 'match',
        reason: 'malformed-match',
        evidence: input,
      });
      continue;
    }
    const m = parsed.data;
    // Round/phase + source bracket label or unordered participants preserves rematches.
    const id = `${m.phase}:${m.round}:${m.match ?? [m.player1, m.player2 ?? 'bye'].sort().join('|')}`;
    const encoded = JSON.stringify(m);
    if (seen.has(id)) {
      if (seen.get(id) !== encoded) {
        e.matches = e.matches.filter((x) => x.id !== id);
        e.quarantine.push({
          kind: 'match',
          reason: 'conflicting-duplicate',
          evidence: [JSON.parse(seen.get(id)!), input],
        });
      }
      continue;
    }
    seen.set(id, encoded);
    const match = {
      id,
      phase: m.phase,
      round: m.round,
      player1: m.player1,
      player2: m.player2 ?? null,
      winner: m.winner ?? null,
      administrative: m.administrative,
    };
    const reason = rejection(match, e);
    if (reason) e.quarantine.push({ kind: 'match', reason, evidence: input });
    e.matches.push(match);
  }
  return e;
}
