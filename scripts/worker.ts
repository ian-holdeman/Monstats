import { mkdir } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { Store } from '../src/server/store';
import { refresh, nextRefresh } from '../src/server/refresh';
import { dataDirectory, databasePath } from '../src/server/paths';
const index = process.argv.indexOf('--interval-hours');
const interval = index < 0 ? 24 : Number(process.argv[index + 1]);
await mkdir(dataDirectory(), { recursive: true });
const store = new Store(databasePath());
const controller = new AbortController();
process.once('SIGINT', () => controller.abort());
process.once('SIGTERM', () => controller.abort());
try {
  nextRefresh(store, interval);
  console.log(
    `Local ingestion worker: ${interval}-hour interval. Data: ${dataDirectory()}`,
  );
  while (!controller.signal.aborted) {
    if (store.state<boolean>(`retired:${store.activeRegulation()}`)) {
      console.log(`${store.activeRegulation()} is archived. Worker stopped.`);
      break;
    }
    const due = nextRefresh(store, interval);
    if (due <= Date.now()) {
      try {
        const d = await refresh(store, new Date().toISOString(), {
          signal: controller.signal,
        });
        console.log(
          JSON.stringify({
            publication: d.id,
            coverage: d.views['all:0'].coverage,
          }),
        );
      } catch (error) {
        if (controller.signal.aborted) break;
        console.error(error instanceof Error ? error.message : error);
        if (!store.state<number>('worker-retry-at'))
          store.saveState('worker-retry-at', Date.now() + 5 * 60000);
      }
    }
    if (process.argv.includes('--once')) break;
    await delay(
      Math.max(1, Math.min(60000, nextRefresh(store, interval) - Date.now())),
      undefined,
      { signal: controller.signal },
    );
  }
} catch (error) {
  if (!controller.signal.aborted) throw error;
} finally {
  store.close();
}
