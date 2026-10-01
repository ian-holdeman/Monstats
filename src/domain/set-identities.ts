import { Dex } from '@pkmn/dex';
export const SET_IDENTITY_VERSION = 'dex-set-labels-v1';
/** Raw slot fields remain evidence. These identities are only for build grouping/display. */
export function setLabel(
  field: 'items' | 'abilities' | 'moves' | 'natures',
  raw: string,
): string {
  const text = raw.trim().replace(/\s+/g, ' ');
  if (!text) return '';
  const lookup = {
    items: Dex.items,
    abilities: Dex.abilities,
    moves: Dex.moves,
    natures: Dex.natures,
  }[field];
  const value = lookup.get(text);
  if (value.exists) return value.name;
  // Unknown evidence is matched only by case and whitespace, never guessed as a known identity.
  return text.toLowerCase();
}
