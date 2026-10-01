import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { Store } from './store';
import type { PublishedDataset, RefreshState } from '../domain/types';
export type PublicDataset = Omit<PublishedDataset, 'events'> & {
  sources: {
    id: string;
    name: string;
    date: string;
    sheet: PublishedDataset['events'][number]['sheet'];
    teams: number;
  }[];
};
export type AppData = {
  current: PublicDataset | null;
  archives: PublicDataset[];
  status: RefreshState | null;
  readError: boolean;
  now: string;
};
export function publicDataset(d: PublishedDataset): PublicDataset {
  const { events, ...rest } = d;
  return {
    ...rest,
    sources: events.map((e) => ({
      id: e.id,
      name: e.name,
      date: e.date,
      sheet: e.sheet,
      teams: e.registrations.filter((r) => r.slots).length,
    })),
  };
}
export function readAppData(): AppData {
  const now = new Date().toISOString();
  const path = resolve(
    process.env.MONSTATS_DATA_DIR ?? '.monstats',
    'monstats.sqlite',
  );
  if (!existsSync(path))
    return { current: null, archives: [], status: null, readError: false, now };
  let store: Store | undefined;
  try {
    store = new Store(path, true);
    const current = store.current();
    return {
      current: current ? publicDataset(current) : null,
      archives: store.archives().map(publicDataset),
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
