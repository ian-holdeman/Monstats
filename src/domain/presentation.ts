import { Dex } from '@pkmn/dex';
const typeColors: Record<string, string> = {
  Grass: '64 176 100',
  Fire: '226 77 66',
  Water: '65 142 225',
  Dragon: '65 142 225',
  Poison: '156 104 208',
  Ghost: '156 104 208',
  Psychic: '221 108 162',
  Fairy: '221 108 162',
  Electric: '226 187 61',
  Steel: '143 157 172',
  Normal: '143 157 172',
  Flying: '143 157 172',
  Bug: '155 178 57',
  Fighting: '180 103 72',
  Ground: '180 103 72',
  Dark: '92 98 114',
  Ice: '99 192 204',
  Rock: '178 155 99',
};
export function pokemonColor(id: string) {
  return typeColors[Dex.species.get(id).types?.[0]] ?? typeColors.Normal;
}
export const monthLabel = (date: string) =>
  /^\d{4}-\d{2}/.test(date) ? `${date.slice(5, 7)}/${date.slice(2, 4)}` : date;
export function formatDifference(n: number | null, unavailable = '—') {
  if (n === null || !Number.isFinite(n)) return unavailable;
  const sign = n > 0 ? '+' : n < 0 && Math.abs(n) >= 0.05 ? '−' : '';
  return `${sign}${Math.abs(n).toFixed(1)} points`;
}
export function spreadParts(raw: string) {
  const match = /^(?:([A-Za-z]+):)?(\d+\/\d+\/\d+\/\d+\/\d+\/\d+)$/.exec(raw);
  if (!match) return null;
  const nature = match[1] ? Dex.natures.get(match[1]) : undefined;
  const stats = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'];
  return {
    values: match[2].split('/'),
    nature: nature?.exists ? nature.name : undefined,
    plus: stats.indexOf(nature?.plus ?? ''),
    minus: stats.indexOf(nature?.minus ?? ''),
  };
}
