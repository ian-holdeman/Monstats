import { mkdir } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { Store } from '../src/server/store';
import { nextLadderRefresh, refreshLadder } from '../src/server/ladder-refresh';
import { dataDirectory, databasePath } from '../src/server/paths';
await mkdir(dataDirectory(), { recursive: true });
const store = new Store(databasePath()),
  controller = new AbortController(),
  owner = `ladder-worker:${process.pid}`;
process.once('SIGINT', () => controller.abort());
process.once('SIGTERM', () => controller.abort());
console.log(
  'Local ladder worker: daily source discovery/capture checks; five-minute retry after failure.',
);
try {
  while (!controller.signal.aborted) {
    for (const environment of ['showdown', 'champions'] as const) {
      if (nextLadderRefresh(store, environment) > Date.now()) continue;
      try {
        const datasets = await refreshLadder(store, environment, {
          signal: controller.signal,
          progress: (n, total) => {
            if (n % 25 === 0)
              console.log(`${n}/${total} Champions details saved`);
          },
        });
        console.log(
          `${environment}: ${datasets.length} validated cohorts published`,
        );
      } catch (error) {
        if (!controller.signal.aborted)
          console.error(error instanceof Error ? error.message : error);
      } finally {
        store.releaseLease(owner);
      }
    }
    if (process.argv.includes('--once')) break;
    const due = Math.min(
      ...(['showdown', 'champions'] as const).map((e) =>
        nextLadderRefresh(store, e),
      ),
    );
    await delay(Math.max(1000, Math.min(60000, due - Date.now())), undefined, {
      signal: controller.signal,
    });
  }
} catch (error) {
  if (!controller.signal.aborted) throw error;
} finally {
  store.releaseLease(owner);
  store.close();
}
