import { Dex } from '@pkmn/dex';

export const ARTWORK_VERSION = 'mega-coverage-v2';
export const spriteUrl = (id: string) => `/sprites/${id}?v=${ARTWORK_VERSION}`;
// Acquisition IDs do not change statistical identities. Source contribution/credit:
// https://github.com/PokeAPI/sprites/pull/236#issuecomment-4722684098
const megaSprites: Record<string, number> = {
  clefablemega: 10278,
  victreebelmega: 10279,
  starmiemega: 10280,
  dragonitemega: 10281,
  meganiummega: 10282,
  feraligatrmega: 10283,
  skarmorymega: 10284,
  froslassmega: 10285,
  emboarmega: 10286,
  excadrillmega: 10287,
  scolipedemega: 10288,
  scraftymega: 10289,
  eelektrossmega: 10290,
  chandeluremega: 10291,
  chesnaughtmega: 10292,
  delphoxmega: 10293,
  greninjamega: 10294,
  pyroarmega: 10295,
  floettemega: 10296,
  malamarmega: 10297,
  barbaraclemega: 10298,
  dragalgemega: 10299,
  hawluchamega: 10300,
  zygardemega: 10301,
  drampamega: 10302,
  falinksmega: 10303,
  raichumegax: 10304,
  raichumegay: 10305,
  chimechomega: 10306,
  absolmegaz: 10307,
  staraptormega: 10308,
  garchompmegaz: 10309,
  lucariomegaz: 10310,
  heatranmega: 10311,
  darkraimega: 10312,
  golurkmega: 10313,
  meowsticmmega: 10314,
  crabominablemega: 10315,
  golisopodmega: 10316,
  magearnamega: 10317,
  magearnaoriginalmega: 10318,
  zeraoramega: 10319,
  scovillainmega: 10320,
  glimmoramega: 10321,
  tatsugiricurlymega: 10322,
  tatsugiridroopymega: 10323,
  tatsugiristretchymega: 10324,
  baxcaliburmega: 10325,
  meowsticfmega: 10326,
};
export function artworkSource(id: string) {
  const number = megaSprites[id];
  if (number)
    return {
      url: `https://raw.githubusercontent.com/PokeAPI/sprites/bfb75391935310368065096fa08c51e8970bc43e/sprites/pokemon/${number}.png`,
      credit: 'Kyledove / PokeAPI sprites',
      terms:
        'https://github.com/PokeAPI/sprites/pull/236#issuecomment-4722684098',
    };
  const s = Dex.species.get(id);
  // Original game sprites only. Unreviewed community work needs an explicit mapping.
  if (!s.exists || s.gen > 5 || s.isMega) return null;
  const filename =
    s.baseSpecies.toLowerCase().replace(/[^a-z0-9]/g, '') +
    (s.forme ? `-${s.forme.toLowerCase().replace(/[^a-z0-9]/g, '')}` : '');
  return {
    url: `https://play.pokemonshowdown.com/sprites/gen5/${filename}.png`,
    credit:
      'Nintendo / Game Freak / The Pokémon Company; Pokémon Showdown cache',
    terms: 'https://github.com/smogon/sprites#license',
  };
}
