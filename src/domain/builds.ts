import type { Builds, Distribution, NormalizedEvent } from './types';
import { setLabel } from './set-identities';
const fields = [
  'items',
  'abilities',
  'moves',
  'natures',
  'spreads',
  'teammates',
] as const;
function recordedStats(stats: Record<string, unknown> | null) {
  if (!stats || !Object.keys(stats).length) return null;
  const labels: Record<string, string> = {
    hp: 'HP',
    atk: 'Atk',
    def: 'Def',
    spa: 'SpA',
    spd: 'SpD',
    spe: 'Spe',
  };
  const entries = Object.entries(stats).sort(([a], [b]) => a.localeCompare(b));
  if (
    entries.some(
      ([key, value]) =>
        !labels[key.toLowerCase()] ||
        typeof value !== 'number' ||
        !Number.isFinite(value),
    )
  )
    return null;
  return entries
    .map(([key, value]) => `${value} ${labels[key.toLowerCase()]}`)
    .join(' · ');
}
export function buildSummaries(
  events: NormalizedEvent[],
): Record<string, Builds> {
  const identities = new Map<string, string>();
  const counters = new Map<
    string,
    Record<
      (typeof fields)[number],
      { total: number; known: number; values: Map<string, number> }
    >
  >();
  for (const event of events)
    for (const registration of event.registrations) {
      for (const slot of registration.slots ?? []) {
        identities.set(slot.id, slot.name);
        if (!counters.has(slot.id))
          counters.set(
            slot.id,
            Object.fromEntries(
              fields.map((f) => [
                f,
                { total: 0, known: 0, values: new Map<string, number>() },
              ]),
            ) as Record<
              (typeof fields)[number],
              { total: number; known: number; values: Map<string, number> }
            >,
          );
        const c = counters.get(slot.id)!;
        const stats = recordedStats(slot.stats);
        const values = {
          items: slot.item
            ? [setLabel('items', slot.item)].filter(Boolean)
            : [],
          abilities: slot.ability
            ? [setLabel('abilities', slot.ability)].filter(Boolean)
            : [],
          moves: [
            ...new Set(
              (slot.moves ?? [])
                .map((v) => setLabel('moves', v))
                .filter(Boolean),
            ),
          ],
          natures: slot.nature
            ? [setLabel('natures', slot.nature)].filter(Boolean)
            : [],
          spreads: stats ? [stats] : [],
          teammates: [
            ...new Set(
              (registration.slots ?? [])
                .filter((other) => other.id !== slot.id)
                .map((other) => other.id),
            ),
          ],
        };
        for (const field of fields) {
          c[field].total++;
          if (!values[field].length && field !== 'teammates') continue;
          c[field].known++;
          for (const value of values[field])
            c[field].values.set(value, (c[field].values.get(value) ?? 0) + 1);
        }
      }
    }
  return Object.fromEntries(
    [...counters].map(([id, c]) => [
      id,
      Object.fromEntries(
        fields.map((field) => {
          const d = c[field];
          const value: Distribution = {
            total: d.total,
            known: d.known,
            values: [...d.values]
              .map(([name, count]) => ({
                ...(field === 'teammates' ? { id: name } : {}),
                name:
                  field === 'teammates' ? (identities.get(name) ?? name) : name,
                count,
                percent: (count / d.known) * 100,
              }))
              .sort(
                (a, b) => b.count - a.count || a.name.localeCompare(b.name),
              ),
          };
          return [field, value];
        }),
      ) as Builds,
    ]),
  );
}
