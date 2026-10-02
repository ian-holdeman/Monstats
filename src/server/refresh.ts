import { randomUUID } from 'node:crypto';
import { collect, type CollectorOptions } from './collector';
import { Store, publish } from './store';
import { selectEvents } from '../domain/analytics';
import type { CollectionReport, NormalizedEvent } from '../domain/types';
import { collectVictoryRoad } from './victory-road';
import { collectOfficial } from './official';
import { coverageInterval, requireRegulation } from '../domain/regulations';
import { provenance, recordProviders } from '../domain/sources';
export async function refresh(
  store: Store,
  asOf = new Date().toISOString(),
  options: CollectorOptions = {},
  fetcher: typeof fetch = fetch,
) {
  const regulation = options.regulation ?? store.activeRegulation();
  const rule = requireRegulation(regulation, store.config);
  if (
    rule.endsAt &&
    Date.parse(asOf) >= Date.parse(rule.endsAt) &&
    !options.finalJob
  )
    throw new Error(
      `Regulation ${regulation} ended; daily collection disabled`,
    );
  if (
    store.state<boolean>(`retired:${regulation}`) &&
    !store.finalAuthorized(regulation, options.finalJob)
  )
    throw new Error(
      `Regulation ${regulation} is archived; collection disabled`,
    );
  options = { ...options, regulation };
  const owner = options.leaseOwner ?? randomUUID();
  const heartbeat = () => {
    if (!store.renewLease(owner, Date.now(), 300000))
      throw new Error('Ingestion lease lost');
  };
  if (!store.acquireLease(owner, Date.now(), 300000))
    throw new Error('Another ingestion process is running');
  const attemptedProviders = new Set<string>();
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
    const checks: Record<string, 'ok' | 'partial'> = {};
    let successes = 0;
    const previous = store.forRegulation(regulation, options.stage);
    const fallback = (provider: string, record = true) => {
      const saved = selectEvents(previous?.events ?? [], {
        regulation,
        asOf,
        days: 30,
        interval: coverageInterval(regulation, asOf, store.config),
        sheet: 'all',
        minPlayers: 0,
      }).filter((e) =>
        provider === 'official'
          ? provenance(e).official === 'verified'
          : provenance(e).official !== 'verified' &&
            recordProviders(e).includes(provider),
      );
      if (record) report.carriedForward.push(...saved.map((e) => e.id));
      return saved;
    };
    if (options.officialOnly) {
      report.discovery = 'partial';
      combined.push(...fallback('limitless'), ...fallback('victory-road'));
    } else {
      attemptedProviders.add('limitless');
      try {
        combined.push(
          ...(await collect(store, asOf, { ...options, heartbeat }, fetcher)),
        );
        report = store.state<CollectionReport>('collection-report')!;
        checks.limitless = report.discovery === 'complete' ? 'ok' : 'partial';
        successes++;
      } catch (error) {
        report = store.state<CollectionReport>('collection-report') ?? report;
        failures.push(error);
        checks.limitless = 'partial';
        combined.push(...fallback('limitless'));
      }
      const vrBefore = report.excluded.length;
      attemptedProviders.add('victory-road');
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
        checks['victory-road'] = report.excluded
          .slice(vrBefore)
          .some((e) =>
            [
              'request-budget',
              'rate-limit',
              'transient-failure',
              'access-denied',
            ].includes(e.reason),
          )
          ? 'partial'
          : 'ok';
      } catch (error) {
        failures.push(error);
        checks['victory-road'] = 'partial';
        combined.push(...fallback('victory-road'));
        report.excluded.push({
          id: 'victory-road-provider',
          reason: error instanceof Error ? error.message : 'provider-failure',
          evidence: null,
        });
      }
    }
    const before = report.excluded.length;
    attemptedProviders.add('official');
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
            'unsupported-evidence',
            'terminal-validation',
          ].includes(e.reason),
      );
    checks.official = officialFailures.length ? 'partial' : 'ok';
    if (!officialFailures.some((e) => e.id === 'official-provider'))
      successes++;
    failures.push(...officialFailures.map((e) => new Error(e.reason)));
    if (failures.length) report.discovery = 'partial';
    if (!successes && failures.length) throw failures[0];
    if (options.finalJob && (failures.length || report.discovery === 'partial'))
      throw new Error(
        'Final poll incomplete; archive retained and opportunity closed',
      );
    options.signal?.throwIfAborted();
    store.saveState('collection-report', report);
    heartbeat();
    const prior = fallback('limitless', false).concat(
      fallback('victory-road', false),
      fallback('official', false),
    );
    const missing = prior.filter((e) => !combined.some((n) => n.id === e.id));
    if (
      missing.some(
        (e) =>
          !report.excluded.some(
            (x) =>
              x.id === e.id &&
              [
                'incompatible-format',
                'unsupported-event',
                'contradictory-entrant-count',
              ].includes(x.reason),
          ),
      )
    )
      throw new Error('Unexpected coverage loss; prior publication retained');
    const knownBefore = prior.reduce(
      (n, e) => n + e.registrations.filter((r) => r.slots).length,
      0,
    );
    const knownAfter = combined.reduce(
      (n, e) => n + e.registrations.filter((r) => r.slots).length,
      0,
    );
    if (knownBefore > 0 && knownAfter < knownBefore * 0.9)
      throw new Error(
        'Unexpected registration coverage loss; review source corrections',
      );
    const d = publish(
      store,
      combined,
      asOf,
      `Public Limitless, Victory Road and official Masters ${regulation} discovery; available registered teams and competitive round results`,
      report,
      { regulation, stage: options.stage, owner, finalJob: options.finalJob },
    );
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
    for (const provider of ['limitless', 'victory-road', 'official']) {
      const old =
        store.state<Record<string, unknown>>('health:' + provider) ?? {};
      if (!checks[provider]) continue;
      const failed = checks[provider] === 'partial';
      const events = d.events.filter((e) =>
        provider === 'official'
          ? provenance(e).official === 'verified'
          : provenance(e).official !== 'verified' &&
            recordProviders(e).includes(provider),
      );
      const unchanged = (values: NormalizedEvent[]) =>
        JSON.stringify(values.map((e) => ({ ...e, snapshots: [] })));
      store.saveState('health:' + provider, {
        ...old,
        attemptedAt: asOf,
        state: failed ? 'partial' : 'ok',
        ...(failed ? {} : { checkedAt: asOf }),
        observedAt:
          events
            .flatMap((e) => e.snapshots)
            .map((s) => s.retrievedAt)
            .sort()
            .at(-1) ??
          old.observedAt ??
          null,
        changedAt:
          previous?.events &&
          unchanged(
            previous.events.filter((e) => events.some((n) => n.id === e.id)),
          ) === unchanged(events)
            ? (old.changedAt ?? null)
            : asOf,
        publishedAt: d.publishedAt,
        publication: d.id,
        events: events.length,
        carriedForward: [
          ...new Set(
            report.carriedForward.filter((id) =>
              events.some((e) => e.id === id),
            ),
          ),
        ],
        failures: report.excluded.filter(
          (e) =>
            e.id === provider + '-provider' ||
            (provider === 'official' && /^\d+$/.test(e.id)) ||
            (provider === 'victory-road' && e.id.startsWith('victory-road:')),
        ),
      });
    }
    return d;
  } catch (error) {
    // A process that lost its lease must not overwrite another collector's status or pointer.
    if (!store.renewLease(owner)) throw error;
    const message = error instanceof Error ? error.message : 'Refresh failed';
    for (const provider of attemptedProviders) {
      const key = 'health:' + provider;
      store.saveState(key, {
        ...(store.state<Record<string, unknown>>(key) ?? {}),
        attemptedAt: asOf,
        state: 'failed',
        message,
      });
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
