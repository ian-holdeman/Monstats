import { parentPort } from 'node:worker_threads';
import { existsSync } from 'node:fs';
import { Store } from '../src/server/store';
import { publicDataset, readAppData } from '../src/server/reader';
import { EVIDENCE_VERSION } from '../src/domain/evidence';
import type {
  ServingCommand,
  ServingResponse,
} from '../src/server/serving-reader';

function execute(command: ServingCommand): ServingResponse {
  if (command.kind === 'app')
    return { kind: 'app', data: readAppData(command.path) };
  const absent = (): ServingResponse => ({
    kind: 'dataset',
    status: 404,
    body: new Uint8Array(),
    cacheable: false,
  });
  if (!existsSync(command.path)) return absent();
  const store = new Store(command.path, true);
  try {
    const dataset = store.version(command.id);
    if (!dataset) return absent();
    const output = publicDataset(
      dataset,
      command.source,
      command.sheet,
      command.minPlayers,
      command.official,
      store.db,
    );
    const cacheable = Object.values(output.views).every((view) =>
      view.pokemon.every((row) => row.evidence?.version === EVIDENCE_VERSION),
    );
    return {
      kind: 'dataset',
      status: 200,
      body: new TextEncoder().encode(JSON.stringify(output)),
      cacheable,
    };
  } finally {
    store.close();
  }
}
parentPort!.on(
  'message',
  ({ id, command }: { id: number; command: ServingCommand }) => {
    try {
      const result = execute(command);
      parentPort!.postMessage(
        { id, result },
        result.kind === 'dataset' ? [result.body.buffer] : [],
      );
    } catch {
      parentPort!.postMessage({ id, error: true });
    }
  },
);
