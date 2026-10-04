import { parentPort } from 'node:worker_threads';
import { existsSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { Store } from '../src/server/store';
import { publicDataset, readAppData } from '../src/server/reader';
import { EVIDENCE_VERSION } from '../src/domain/evidence';
import {
  ServingCohortCache,
  storageGeneration,
  selectDetail,
} from '../src/server/serving-cache';
import type {
  ServingCommand,
  ServingResponse,
} from '../src/server/serving-reader';

const cohorts = new ServingCohortCache();
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
    const key = JSON.stringify([
      command.path,
      storageGeneration(command.path),
      command.id,
      command.source,
      command.sheet,
      command.minPlayers,
      command.official,
    ]);
    const cohort = cohorts.read(key, () => {
      const dataset = store.version(command.id);
      if (!dataset) return null;
      return publicDataset(
        dataset,
        command.source,
        command.sheet,
        command.minPlayers,
        command.official,
        store.db,
      );
    });
    if (!cohort) return absent();
    const output = selectDetail(cohort, command.detail);
    const cacheable = Object.values(output.views).every((view) =>
      view.pokemon.every((row) => row.evidence?.version === EVIDENCE_VERSION),
    );
    const json = JSON.stringify(output);
    return {
      kind: 'dataset',
      status: 200,
      body: command.gzip
        ? new Uint8Array(gzipSync(json))
        : new TextEncoder().encode(json),
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
