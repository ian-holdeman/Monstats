import { existsSync } from 'node:fs';
import type { DatabaseSync } from 'node:sqlite';
import { databasePath } from './paths';
import { provenance, recordProviders } from '../domain/sources';
import { datasetRegulation, cohortKey } from '../domain/regulations';
import { Store } from './store';
import type { PublishedDataset, RefreshState } from '../domain/types';
import { aggregate, selectEvents } from '../domain/analytics';
import { sourceSelection } from '../domain/filters';
import { withEvidence } from './evidence-reader';
import { LadderStore } from './ladder-store';
import type { LadderSummary, LadderEnvironment } from '../domain/ladder';
type PublicRefreshState = Pick<RefreshState, 'state' | 'attemptedAt'>;
const publicStatus = (
  status: RefreshState | null,
): PublicRefreshState | null =>
  status ? { state: status.state, attemptedAt: status.attemptedAt } : null;
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
  status: PublicRefreshState | null;
  readError: boolean;
  now: string;
  ladder?: {
    catalog: LadderSummary[];
    status: Partial<Record<LadderEnvironment, PublicRefreshState | null>>;
    readError: boolean;
  };
};
export function publicDataset(
  d: PublishedDataset,
  source = 'all',
  sheet = 'all',
  minPlayers = 0,
  official = false,
  db?: DatabaseSync,
): PublicDataset {
  const { events, collection, quarantine, views, ...rest } = d;
  source = sourceSelection(source);
  const providerIds = [...new Set(events.flatMap(recordProviders))];
  // Unknown saved selections stay visible, but must not create arbitrarily many
  // equivalent recalculations of a cohort that already has published metrics.
  const effectiveSource =
    source === 'all' || source === 'none'
      ? source
      : sourceSelection(
          source
            .split(',')
            .filter((id) => providerIds.includes(id))
            .join(',') || 'none',
        );
  const populationOptions = (views['all:0'] ?? Object.values(views)[0]).options;
  const population = populationOptions.interval
    ? selectEvents(events, {
        ...populationOptions,
        source: 'all',
        sheet: 'all',
        minPlayers: 0,
        official: false,
      })
    : events;
  void collection;
  void quarantine;
  return {
    ...rest,
    regulation: datasetRegulation(d),
    views: (() => {
      const key = cohortKey(source, sheet, minPlayers, official);
      const savedKey = cohortKey(effectiveSource, sheet, minPlayers, official);
      const view =
        views[key] ??
        views[savedKey] ??
        (effectiveSource === 'all' && !official
          ? views[`${sheet}:${minPlayers}`]
          : undefined);
      // Provider combinations are calculated from this version's saved facts, never averaged or collected live.
      // Keep legacy archived single-provider views intact; dynamic subsets retain the frozen window.
      const selected =
        view ??
        aggregate(effectiveSource === 'none' ? [] : events, {
          ...(views['all:0'] ?? Object.values(views)[0]).options,
          source: effectiveSource,
          sheet: sheet as 'all' | 'open' | 'closed' | 'unknown',
          minPlayers,
          official,
        });
      const ready = withEvidence(d.id, selected, db);
      return {
        [key]:
          source === effectiveSource
            ? ready
            : { ...ready, options: { ...ready.options, source } },
      };
    })(),
    providers: providerIds.map((id) => ({
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
    sources: population.map((e) => ({
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
export function readAppData(path = databasePath()): AppData {
  const now = new Date().toISOString();
  if (!existsSync(path))
    return { current: null, archives: [], status: null, readError: false, now };
  let store: Store | undefined;
  try {
    store = new Store(path, true);
    const current = store.current();
    let ladder: NonNullable<AppData['ladder']> = {
      catalog: [],
      status: {},
      readError: false,
    };
    try {
      const saved = new LadderStore(store);
      ladder = {
        catalog: saved.catalog(),
        status: {
          showdown: publicStatus(saved.status('showdown')),
          champions: publicStatus(saved.status('champions')),
        },
        readError: false,
      };
    } catch {
      ladder.readError = true;
    }
    const db = store.db;
    return {
      current: current
        ? publicDataset(current, 'all', 'all', 0, false, db)
        : null,
      archives: store
        .archives()
        .map((d) => publicDataset(d, 'all', 'all', 0, false, db)),
      status: publicStatus(store.status()),
      readError: false,
      now,
      ladder,
    };
  } catch {
    return { current: null, archives: [], status: null, readError: true, now };
  } finally {
    store?.close();
  }
}
