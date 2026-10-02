import { mkdir } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { Store } from '../src/server/store';
import { runScheduled } from '../src/server/operations';
import { dataDirectory, databasePath } from '../src/server/paths';
await mkdir(dataDirectory(), { recursive: true });
const store = new Store(databasePath());
const controller = new AbortController();
process.once('SIGINT', () => controller.abort());
process.once('SIGTERM', () => controller.abort());
if (process.argv.includes('--interval-hours'))
  throw new Error(
    'Use MONSTATS_DAILY_UTC=HH:MM for a fixed daily UTC schedule',
  );
try {
  do {
    const result = await runScheduled(store, { signal: controller.signal });
    console.log(JSON.stringify(result));
    if (result.state === 'attention') process.exitCode = 1;
    if (process.argv.includes('--once')) break;
    await delay(30000, undefined, { signal: controller.signal });
  } while (!controller.signal.aborted);
} catch (error) {
  if (!controller.signal.aborted) throw error;
} finally {
  store.close();
}
