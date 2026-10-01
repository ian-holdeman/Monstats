import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { dataDirectory } from '../src/server/paths';
import { normalizeVictoryRoad } from '../src/server/victory-road';
import { reconcileRecords } from '../src/domain/reconciliation';
const directory = resolve(dataDirectory(), 'source-audit');
const event = normalizeVictoryRoad(
  'vr-sep26-2',
  await readFile(resolve(directory, 'victory-road-september.html'), 'utf8'),
  await readFile(resolve(directory, 'victory-road-details.html'), 'utf8'),
  [],
);
console.log(
  JSON.stringify(
    {
      ...reconcileRecords(event),
      quarantine: event.quarantine.reduce<Record<string, number>>((a, q) => {
        a[q.reason] = (a[q.reason] ?? 0) + 1;
        return a;
      }, {}),
    },
    null,
    2,
  ),
);
