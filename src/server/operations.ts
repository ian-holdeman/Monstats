import { randomUUID } from 'node:crypto';
import { Store, publish } from './store';
import { refresh } from './refresh';
import type { CollectorOptions } from './collector';
import type { PublishedDataset } from '../domain/types';
import { datasetRegulation } from '../domain/regulations';

const DAY = 86400000;
export type Run = {
  id: string;
  regulation: string;
  kind: 'daily' | 'final';
  state: 'running' | 'complete' | 'failed' | 'missed';
  scheduledAt: number;
  deadline: number;
  attemptedAt?: string;
  finishedAt?: string;
  publication?: string;
  message?: string;
  attempts?: number;
  retryAt?: number;
};
export function dailySlot(now: number, utc = '06:00') {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(utc))
    throw new Error('UTC schedule must be HH:MM');
  const [hours, minutes] = utc.split(':').map(Number);
  const midnight = Math.floor(now / DAY) * DAY;
  const today = midnight + hours * 3600000 + minutes * 60000;
  return now < today ? today - DAY : today;
}
export function lifecycle(store: Store, now = Date.now()) {
  const entries = Object.entries(store.config.cohorts).filter(
    ([, c]) => c.enabled && c.reviewed && c.startsAt && c.endsAt,
  );
  const current = entries.filter(
    ([, r]) => now >= Date.parse(r.startsAt!) && now < Date.parse(r.endsAt!),
  );
  if (current.length > 1)
    throw new Error('Conflicting reviewed regulation intervals');
  const incoming = current[0]?.[0];
  if (
    incoming &&
    !store.state<boolean>(`retired:${incoming}`) &&
    (!store.current() || datasetRegulation(store.current()!) !== incoming)
  ) {
    const staged =
      store.staged(incoming) ??
      publish(
        store,
        [],
        new Date(now).toISOString(),
        'Reviewed automatic regulation transition; no eligible results yet',
        undefined,
        { regulation: incoming, stage: true, allowEmpty: true },
      );
    store.activate(incoming, staged.id, true);
  }
  for (const [id, rule] of entries) {
    if (now >= Date.parse(rule.endsAt!)) {
      const current = store.current();
      if (current && datasetRegulation(current) === id)
        store.archiveCurrent(id);
      if (
        store.state<boolean>(`retired:${id}`) &&
        !store.state(`final:${id}`)
      ) {
        const scheduledAt = Date.parse(rule.endsAt!) + 7 * DAY;
        store.saveState(`final:${id}`, {
          id: `final:${id}:${rule.endsAt}`,
          regulation: id,
          kind: 'final',
          state: 'pending',
          scheduledAt,
          deadline: scheduledAt + 3600000,
        });
      }
    }
  }
}
export async function runScheduled(
  store: Store,
  options: {
    now?: number;
    utc?: string;
    maxRuntimeMs?: number;
    signal?: AbortSignal;
    execute?: (
      store: Store,
      asOf: string,
      options: CollectorOptions,
    ) => Promise<PublishedDataset>;
  } = {},
) {
  const now = options.now ?? Date.now(),
    utc = options.utc ?? process.env.MONSTATS_DAILY_UTC ?? '06:00';
  const runtime = options.maxRuntimeMs ?? 45 * 60000;
  if (!Number.isFinite(runtime) || runtime < 1000 || runtime > 3600000)
    throw new Error('Job runtime must be 1 second to 1 hour');
  dailySlot(now, utc);
  const owner = randomUUID();
  const claimed = store.db
    .prepare(
      `INSERT INTO leases VALUES ('scheduler',?,?) ON CONFLICT(name) DO UPDATE SET owner=excluded.owner,expires=excluded.expires WHERE leases.expires<=? RETURNING owner`,
    )
    .get(owner, Date.now() + runtime + 60000, Date.now());
  if (!claimed) return { state: 'contention', runs: [] };
  const completed: Run[] = [];
  try {
    if (!store.acquireLease(owner, Date.now(), 300000))
      return { state: 'contention', runs: [] };
    lifecycle(store, now);
    const jobs: Run[] = [];
    for (const regulation of Object.keys(store.config.cohorts)) {
      const final = store.state<Run>(`final:${regulation}`);
      if (
        !final ||
        ['complete', 'failed', 'missed'].includes(final.state) ||
        now < final.scheduledAt
      )
        continue;
      if (now >= final.deadline) {
        const missed: Run = {
          ...final,
          state: final.state === 'running' ? 'failed' : 'missed',
          message:
            'Final opportunity expired; archive retained; no catch-up permitted',
        };
        store.saveState(`final:${regulation}`, missed);
        store.saveState(`run:${final.id}`, missed);
        completed.push(missed);
      } else jobs.push(final);
    }
    const regulation = store.current()
      ? datasetRegulation(store.current()!)
      : null;
    if (regulation && !store.state<boolean>(`retired:${regulation}`)) {
      const scheduledAt = dailySlot(now, utc);
      const id = `daily:${regulation}:${new Date(scheduledAt).toISOString()}`;
      const existing = store.state<Run>(`run:${id}`);
      if (
        existing?.state !== 'complete' &&
        (existing?.attempts ?? 0) < 3 &&
        (!existing?.retryAt || now >= existing.retryAt)
      )
        jobs.push({
          id,
          regulation,
          kind: 'daily',
          state: 'running',
          scheduledAt,
          deadline: now + runtime,
          attempts: (existing?.attempts ?? 0) + 1,
        });
    }
    for (const job of jobs) {
      options.signal?.throwIfAborted();
      const run: Run = {
        ...job,
        state: 'running',
        attemptedAt: new Date(now).toISOString(),
        deadline: Math.min(job.deadline, now + runtime),
      };
      store.saveState(`run:${run.id}`, run);
      if (run.kind === 'final') store.saveState(`final:${run.regulation}`, run);
      await store.checkpoint();
      const timeout = AbortSignal.timeout(Math.max(1, run.deadline - now));
      const signal = options.signal
        ? AbortSignal.any([options.signal, timeout])
        : timeout;
      try {
        const dataset = await (options.execute ?? refresh)(
          store,
          new Date(now).toISOString(),
          {
            regulation: run.regulation,
            signal,
            leaseOwner: owner,
            ...(run.kind === 'final' ? { finalJob: run.id, force: true } : {}),
          },
        );
        run.state =
          dataset.collection?.discovery === 'partial' && run.kind === 'daily'
            ? 'failed'
            : 'complete';
        run.publication = dataset.id;
      } catch (error) {
        // A hard process interruption leaves running state. Only it may resume during the final window.
        const committed =
          run.kind === 'final'
            ? store.state<Run>(`final:${run.regulation}`)
            : null;
        if (committed?.state === 'complete') Object.assign(run, committed);
        else {
          run.state = 'failed';
          run.message = error instanceof Error ? error.message : String(error);
        }
      }
      run.finishedAt = new Date().toISOString();
      if (run.kind === 'daily' && run.state === 'failed')
        run.retryAt = Math.max(
          now + 5 * 60000,
          store.state<number>('worker-retry-at') ?? 0,
        );
      store.saveState(`run:${run.id}`, run);
      if (run.kind === 'final') store.saveState(`final:${run.regulation}`, run);
      completed.push(run);
    }
    return {
      state: completed.some((r) => ['failed', 'missed'].includes(r.state))
        ? 'attention'
        : 'ok',
      runs: completed,
    };
  } finally {
    store.releaseLease(owner);
    store.db
      .prepare("DELETE FROM leases WHERE name='scheduler' AND owner=?")
      .run(owner);
  }
}
export function operationalHealth(store: Store) {
  const current = store.current();
  const states = store.db
    .prepare(
      "SELECT name,payload FROM collector_state WHERE name LIKE 'run:%' OR name LIKE 'final:%' OR name LIKE 'health:%' ORDER BY name",
    )
    .all()
    .map((r) => ({ key: r.name, ...JSON.parse(String(r.payload)) }));
  const progress = store.db
    .prepare(
      "SELECT name,payload FROM collector_state WHERE name LIKE '%:progress%'",
    )
    .all()
    .map((r) => {
      const p = JSON.parse(String(r.payload));
      return {
        key: r.name,
        startedAt: p.asOf,
        listed: p.candidates?.length,
        processed: p.processed?.length ?? p.completed?.length,
        apiPage: p.apiPage,
        completedPage: p.completedPage,
        finished: p.workDone,
      };
    });
  const health = states
    .filter((s) => String(s.key).startsWith('health:'))
    .map((s) => ({
      ...s,
      lagHours: s.observedAt
        ? (Date.now() - Date.parse(s.observedAt)) / 3600000
        : null,
    }));
  return {
    checkedAt: new Date().toISOString(),
    active: current?.regulation,
    publication: current?.id,
    discovery: current?.collection?.discovery,
    exclusions: current?.collection?.excluded ?? [],
    leases: store.db.prepare('SELECT name,expires FROM leases').all(),
    states,
    health,
    progress,
    alert: states.filter((r) =>
      ['failed', 'missed', 'partial'].includes(r.state),
    ),
    artwork: store.state('artwork-health'),
  };
}
