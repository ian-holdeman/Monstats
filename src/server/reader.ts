import { existsSync } from 'node:fs';
import { databasePath } from './paths';
import { provenance, recordProviders } from '../domain/sources';
import { datasetRegulation, cohortKey } from '../domain/regulations';
import { Store } from './store';
import type { PublishedDataset, RefreshState } from '../domain/types';
import { aggregate } from '../domain/analytics';
import { sourceSelection } from '../domain/filters';
export type PublicDataset = Omit<
  PublishedDataset,
  'events' | 'collection' | 'quarantine'
> & {
  providers: { id: string; name: string }[];
  sources: {
    id: string;
    name: string;
    date: string;
    sheet: PublishedDataset['events'][number]['sheet'];
    teams: number;
    url: string;
    providers: string[];
    players: number;
    official: boolean;
    missingTeams: number;
    division?: string;
  }[];
};
export type AppData = {
  current: PublicDataset | null;
  archives: PublicDataset[];
  status: RefreshState | null;
  readError: boolean;
  now: string;
};
export function publicDataset(
  d: PublishedDataset,
  source = 'all',
  sheet = 'all',
  minPlayers = 0,
  official = false,
): PublicDataset {
  const { events, collection, quarantine, views, ...rest } = d;
  source = sourceSelection(source);
  void collection;
  void quarantine;
  return {
    ...rest,
    regulation: datasetRegulation(d),
    views: (() => {
      const key = cohortKey(source, sheet, minPlayers, official);
      const view =
        views[key] ??
        (source === 'all' && !official
          ? views[`${sheet}:${minPlayers}`]
          : undefined);
      // Provider combinations are calculated from this version's saved facts, never averaged or collected live.
      // Keep legacy archived single-provider views intact; dynamic subsets retain the frozen window.
      const selected =
        view ??
        aggregate(events, {
          ...(views['all:0'] ?? Object.values(views)[0]).options,
          source,
          sheet: sheet as 'all' | 'open' | 'closed' | 'unknown',
          minPlayers,
          official,
        });
      return { [key]: selected };
    })(),
    providers: [...new Set(events.flatMap(recordProviders))].map((id) => ({
      id,
      name:
        id === 'limitless'
          ? 'Limitless'
          : id === 'victory-road'
            ? 'Victory Road'
            : id === 'pokedata'
              ? 'RK9 (pokedata mirror)'
              : id,
    })),
    sources: events.map((e) => ({
      id: e.id,
      name: e.name,
      date: e.date,
      sheet: e.sheet,
      teams: e.registrations.filter((r) => r.slots).length,
      url: (
        provenance(e).sources.find((s) => s.role === 'original') ??
        provenance(e).sources[0]
      ).url,
      providers: recordProviders(e),
      players: e.players,
      official: provenance(e).official === 'verified',
      missingTeams: e.players - e.registrations.filter((r) => r.slots).length,
      division: provenance(e).division,
    })),
  };
}
export function readAppData(): AppData {
  const now = new Date().toISOString();
  const path = databasePath();
  if (!existsSync(path))
    return { current: null, archives: [], status: null, readError: false, now };
  let store: Store | undefined;
  try {
    store = new Store(path, true);
    const current = store.current();
    return {
      current: current ? publicDataset(current) : null,
      archives: store.archives().map((d) => publicDataset(d)),
      status: store.status(),
      readError: false,
      now,
    };
  } catch {
    return { current: null, archives: [], status: null, readError: true, now };
  } finally {
    store?.close();
  }
}
