import { sourceMatches } from './filters';
import { optionBounds } from './regulations';
import type { Aggregate } from './types';
import type { PublicDataset } from '../server/reader';
export function contributingProviders(dataset: PublicDataset, view: Aggregate) {
  const options = view.options;
  const ids = new Set(
    dataset.sources
      .filter(
        (e) =>
          e.players >= Math.max(20, options.minPlayers) &&
          Date.parse(e.date) <= Date.parse(options.asOf) &&
          Date.parse(e.date) >= optionBounds(options).start &&
          (!options.official || e.official) &&
          sourceMatches(options.source, e.providers) &&
          (options.sheet === 'all' || e.sheet.visibility === options.sheet),
      )
      .flatMap((e) => e.providers),
  );
  return dataset.providers.filter((p) => ids.has(p.id));
}
export const providerUrl = (id: string) =>
  id === 'limitless'
    ? 'https://play.limitlesstcg.com/'
    : id === 'victory-road'
      ? 'https://victoryroad.pro/'
      : id === 'pokedata'
        ? 'https://www.pokedata.ovh/'
        : null;
