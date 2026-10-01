import { randomUUID } from 'node:crypto';
import { collect, type CollectorOptions } from './collector';
import { Store, publish } from './store';
import { selectEvents } from '../domain/analytics';
import type { CollectionReport, NormalizedEvent } from '../domain/types';
import { collectVictoryRoad } from './victory-road';
import { collectOfficial } from './official';
import { requireRegulation } from '../domain/regulations';
import { provenance, recordProviders } from '../domain/sources';
export async function refresh(
  store: Store,
  asOf = new Date().toISOString(),
  options: CollectorOptions = {},
  fetcher: typeof fetch = fetch,
) {
  const regulation = options.regulation ?? store.activeRegulation();
  requireRegulation(regulation, store.config);
  if (store.state<boolean>(`retired:${regulation}`))
    throw new Error(
      `Regulation ${regulation} is archived; collection disabled`,
    );
  options = { ...options, regulation };
  const owner = randomUUID();
  const heartbeat = () => {
    if (!store.acquireLease(owner, Date.now()))
      throw new Error('Ingestion lease lost');
  };
  if (!store.acquireLease(owner, Date.now()))
    throw new Error('Another ingestion process is running');
  try {
    let report: CollectionReport = {
      asOf,
      discovery: 'complete',
      apiPages: 0,
      completedPages: 0,
      listed: 0,
      completed: 0,
      refreshed: 0,
      cached: 0,
      excluded: [],
      carriedForward: [],
      snapshots: [],
    };
    const combined: NormalizedEvent[] = [];
    const failures: unknown[] = [];
    let successes = 0;
    const previous = store.current();
    const fallback = (provider: string) => {
      const saved = selectEvents(previous?.events ?? [], {
        regulation,
        asOf,
        days: 30,
        sheet: 'all',
        minPlayers: 0,
      }).filter((e) =>
        provider === 'official'
          ? provenance(e).official === 'verified'
          : provenance(e).official !== 'verified' &&
            recordProviders(e).includes(provider),
      );
      report.carriedForward.push(...saved.map((e) => e.id));
      return saved;
    };
    if (options.officialOnly) {
      report.discovery = 'partial';
      combined.push(...fallback('limitless'), ...fallback('victory-road'));
    } else {
      try {
        combined.push(
          ...(await collect(store, asOf, { ...options, heartbeat }, fetcher)),
        );
        report = store.state<CollectionReport>('collection-report')!;
        successes++;
      } catch (error) {
        report = store.state<CollectionReport>('collection-report') ?? report;
        failures.push(error);
        combined.push(...fallback('limitless'));
      }
      try {
        combined.push(
          ...(await collectVictoryRoad(
            store,
            asOf,
            report,
            { ...options, heartbeat },
            fetcher,
          )),
        );
        successes++;
      } catch (error) {
        failures.push(error);
        combined.push(...fallback('victory-road'));
        report.excluded.push({
          id: 'victory-road-provider',
          reason: error instanceof Error ? error.message : 'provider-failure',
          evidence: null,
        });
      }
    }
    const before = report.excluded.length;
    combined.push(
      ...(await collectOfficial(
        store,
        asOf,
        report,
        { ...options, heartbeat },
        fetcher,
      )),
    );
    const officialFailures = report.excluded
      .slice(before)
      .filter(
        (e) =>
          ![
            'outside-window',
            'unsupported-or-inactive-regulation',
            'unaudited-official-event-contract',
            'not-confirmed-completed',
            'below-entrant-floor',
          ].includes(e.reason),
      );
    if (!officialFailures.some((e) => e.id === 'official-provider'))
      successes++;
    failures.push(...officialFailures.map((e) => new Error(e.reason)));
    if (failures.length) report.discovery = 'partial';
    if (!successes && failures.length) throw failures[0];
    options.signal?.throwIfAborted();
    store.saveState('collection-report', report);
    heartbeat();
    const d = publish(
      store,
      combined,
      asOf,
      `Public Limitless, Victory Road and official Masters ${regulation} discovery; available registered teams and competitive round results`,
      report,
      { regulation, stage: options.stage },
    );
    store.clearState(`limitless:${regulation}:progress`);
    if (regulation === 'M-C') store.clearState('limitless-progress');
    store.saveState(`last-success:${regulation}`, asOf);
    if (!options.stage) {
      store.saveState(
        'worker-retry-at',
        failures.length
          ? Math.max(
              Date.now() + 5 * 60000,
              store.state<number>('pokedata-next-request') ?? 0,
              store.state<number>('limitless-next-request') ?? 0,
              store.state<number>('victory-road-next-request') ?? 0,
            )
          : 0,
      );
      if (failures.length)
        store.refreshFailure(
          asOf,
          'Partial provider failure; surviving coverage retained',
        );
    }
    return d;
  } catch (error) {
    // A process that lost its lease must not overwrite another collector's status or pointer.
    if (!store.acquireLease(owner, Date.now())) throw error;
    const message = error instanceof Error ? error.message : 'Refresh failed';
    const previous = store.current();
    // Local expiry is independent of provider availability. Retain all surviving facts.
    if (
      previous &&
      !options.stage &&
      previous.views['all:0'].options.regulation === regulation
    ) {
      const surviving = selectEvents(previous.events, {
        regulation,
        asOf,
        days: 30,
        sheet: 'all',
        minPlayers: 0,
      });
      if (surviving.length !== previous.events.length) {
        heartbeat();
        const report: CollectionReport = {
          ...(previous.collection ?? {
            apiPages: 0,
            completedPages: 0,
            listed: 0,
            completed: 0,
            refreshed: 0,
            cached: 0,
            excluded: [],
            snapshots: [],
          }),
          asOf,
          discovery: 'partial',
          carriedForward: surviving.map((e) => e.id),
        };
        publish(
          store,
          surviving,
          asOf,
          'Saved source coverage; local window advanced during provider failure',
          report,
          { regulation },
        );
      }
    }
    store.refreshFailure(asOf, message);
    store.saveState(
      'worker-retry-at',
      Math.max(
        Date.now() + 5 * 60000,
        store.state<number>('limitless-next-request') ?? 0,
        store.state<number>('pokedata-next-request') ?? 0,
        store.state<number>('victory-road-next-request') ?? 0,
      ),
    );
    throw error;
  } finally {
    store.releaseLease(owner);
  }
}
export function nextRefresh(
  store: Store,
  intervalHours: number,
  now = Date.now(),
) {
  if (
    !Number.isFinite(intervalHours) ||
    intervalHours < 1 ||
    intervalHours > 24
  )
    throw new Error('Interval must be between 1 and 24 hours');
  const retry = store.state<number>('worker-retry-at');
  if (retry) return retry;
  const regulation = store.activeRegulation();
  const success =
    store.state<string>(`last-success:${regulation}`) ??
    (regulation === 'M-C' ? store.state<string>('last-success') : null);
  return success ? Date.parse(success) + intervalHours * 3600000 : now;
}
