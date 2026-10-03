import type { Store } from '../store';
import { dailySlot, type Run } from '../operations';
import { nextLadderRefresh } from '../ladder-refresh';
import { datasetRegulation } from '../../domain/regulations';

const DAY = 86400000;
export function nextTournamentWork(store: Store, now = Date.now()) {
  const due: number[] = [];
  const current = store.current();
  const active = current ? datasetRegulation(current) : null;
  for (const [id, rule] of Object.entries(store.config.cohorts)) {
    if (!rule.enabled || !rule.reviewed || !rule.startsAt || !rule.endsAt)
      continue;
    const start = Date.parse(rule.startsAt),
      end = Date.parse(rule.endsAt);
    if (now < start) {
      due.push(start);
      continue;
    }
    if (now < end) {
      if (active !== id && !store.state(`retired:${id}`)) due.push(now);
      due.push(end);
      if (active === id) {
        const slot = dailySlot(now, process.env.MONSTATS_DAILY_UTC ?? '06:00');
        const run = store.state<Run>(
          `run:daily:${id}:${new Date(slot).toISOString()}`,
        );
        due.push(
          run?.state === 'complete' || (run?.attempts ?? 0) >= 3
            ? slot + DAY
            : Math.max(now, run?.retryAt ?? now),
        );
      }
    } else {
      if (active === id) due.push(now);
      const final = store.state<Run>(`final:${id}`);
      if (!final || !['complete', 'failed', 'missed'].includes(final.state))
        due.push(Math.max(now, end + 7 * DAY));
    }
  }
  return due.length ? Math.min(...due) : Number.MAX_SAFE_INTEGER;
}

export function nextCloudWork(store: Store, now = Date.now()) {
  const tasks = [
    { kind: 'tournament' as const, at: nextTournamentWork(store, now) },
    ...(['showdown', 'champions'] as const).map((kind) => ({
      kind,
      at: nextLadderRefresh(store, kind, now),
    })),
  ];
  return tasks.sort((a, b) => a.at - b.at)[0];
}
