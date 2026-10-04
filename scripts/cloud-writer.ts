import { randomUUID } from 'node:crypto';
import { backup } from 'node:sqlite';
import { mkdtemp, mkdir, readFile, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { Store } from '../src/server/store';
import { LadderStore } from '../src/server/ladder-store';
import { matchupSchema } from '../src/server/matchup-index';
import { evidenceSchema } from '../src/server/evidence-index';
import { checkDatabase } from '../src/server/backup';
import { runScheduled } from '../src/server/operations';
import { refreshLadder } from '../src/server/ladder-refresh';
import { CloudControl } from '../src/server/cloud/control';
import {
  CheckpointJournal,
  replayCheckpoint,
} from '../src/server/cloud/journal';
import {
  cloudStorage,
  GcsControlStorage,
  uploadBytes,
  uploadFile,
  downloadFile,
  artifactSchema,
} from '../src/server/cloud/storage';
import {
  createServingArtifact,
  createWorkingSet,
} from '../src/server/cloud/serving-artifact';
import { nextCloudWork } from '../src/server/cloud/schedule';
import { correctSavedIdentities } from '../src/server/identity-correction';
import { resourceUsage } from '../src/server/cloud/resource-usage';
import {
  backupPublication,
  removeOldArtifacts,
} from '../src/server/cloud/retention';

const operationalName = process.env.MONSTATS_CONTROL_BUCKET;
const servingName = process.env.MONSTATS_SERVING_BUCKET;
const backupName = process.env.MONSTATS_BACKUP_BUCKET;
if (!operationalName || !servingName || !backupName)
  throw new Error('Cloud writer configuration missing');
const storage = cloudStorage(),
  operational = storage.bucket(operationalName),
  serving = storage.bucket(servingName);
const control = new CloudControl(new GcsControlStorage(operational));
const signal = new AbortController();
process.once('SIGTERM', () => signal.abort());
process.once('SIGINT', () => signal.abort());
const claimed = await control.claim(randomUUID(), 300000);
if (!claimed.base || !claimed.serving)
  throw new Error('Verified bootstrap artifacts required');
const root = resolve(process.env.MONSTATS_DATA_DIR ?? '/tmp/monstats');
await mkdir(root, { recursive: true });
const directory = await mkdtemp(join(root, 'write-'));
let store: Store | undefined;
let journal: CheckpointJournal | undefined;
let fatal: unknown;
// One promise chain orders heartbeat and checkpoint control writes.
let queued = Promise.resolve();
const serialize = (work: () => Promise<void>) => {
  const next = queued.then(async () => {
    if (fatal) throw fatal;
    await work();
  });
  queued = next.catch((error) => {
    fatal = error;
    signal.abort();
  });
  return next;
};
const timer = setInterval(() => {
  void serialize(() => control.renew(300000)).catch(() => {});
}, 60000);
try {
  const path = join(directory, 'monstats.sqlite');
  await downloadFile(operational, claimed.base, path);
  store = new Store(path);
  new LadderStore(store).initialize();
  matchupSchema(store.db);
  evidenceSchema(store.db);
  for (let i = 0; i < claimed.checkpoints.length; i++) {
    const delta = join(directory, `checkpoint-${i}`);
    await downloadFile(operational, claimed.checkpoints[i], delta);
    replayCheckpoint(store.db, await readFile(delta));
    await rm(delta);
  }
  journal = new CheckpointJournal(store.db);
  store.db.exec('DELETE FROM leases');
  store.checkpoint = () =>
    serialize(async () => {
      signal.signal.throwIfAborted();
      let checkpointed = false;
      await journal!.checkpoint(async (bytes) => {
        const artifact = await uploadBytes(operational, bytes);
        await control.checkpoint(artifact, 300000);
        checkpointed = true;
      });
      if (!checkpointed) await control.renew(300000);
    });
  const work = nextCloudWork(store);
  const correction = process.argv.includes('--correct-identities');
  const rebuildServing = process.argv.includes('--rebuild-serving');
  if (correction && rebuildServing)
    throw new Error('Choose one maintenance operation');
  const maintenance = correction || rebuildServing;
  const kind = correction
    ? 'identity-correction'
    : rebuildServing
      ? 'rebuild-serving'
      : work.kind;
  if (maintenance || work.at <= Date.now()) {
    await store.checkpoint();
    let outcome = 'ok';
    if (maintenance) {
      // Maintenance contacts no provider and preserves the collection/final ledger.
      // Do not checkpoint partial changes ahead of the serving pointer.
      journal.close();
      journal = undefined;
      console.info(
        JSON.stringify({
          state: kind,
          versions: correction
            ? correctSavedIdentities(store).map(({ kind, before, after }) => ({
                kind,
                before,
                after,
              }))
            : [],
        }),
      );
    } else if (work.kind === 'tournament') {
      const result = await runScheduled(store, { signal: signal.signal });
      outcome = result.state;
    } else {
      try {
        await refreshLadder(store, work.kind, { signal: signal.signal });
      } catch {
        outcome = 'attention';
        if (fatal)
          throw fatal; /* Failure state is retained in the sealed base. */
      }
    }
    await queued;
    if (fatal) throw fatal;
    // Publication/index mutations can be large. They are deliberately committed
    // only through the sealed base below, so their session capture is no longer
    // needed. Release it and checkpoint WAL before allocating immutable copies.
    journal?.close();
    journal = undefined;
    store.db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
    console.info(
      JSON.stringify({
        state: 'collected',
        kind,
        outcome,
        ...(await resourceUsage()),
      }),
    );
    // No changeset containing final completion is committed ahead of the
    // serving artifact. Seal both and commit them in one control transition.
    const basePath = join(directory, 'sealed.sqlite');
    await backup(store.db, basePath);
    checkDatabase(basePath);
    const servingPath = join(directory, 'serving.sqlite');
    await createServingArtifact(store, servingPath);
    const workingPath = join(directory, 'working.sqlite');
    await createWorkingSet(store, workingPath);
    await downloadFile(
      serving,
      claimed.serving,
      join(directory, 'prior-manifest.json'),
    );
    const prior = JSON.parse(
      await readFile(join(directory, 'prior-manifest.json'), 'utf8'),
    );
    const sprites = artifactSchema.parse(prior.sprites);
    const base = await uploadFile(operational, basePath);
    const database = await uploadFile(serving, servingPath);
    const workingSet = await uploadFile(serving, workingPath);
    const manifest = await uploadBytes(
      serving,
      Buffer.from(
        JSON.stringify({
          protocol: 1,
          database,
          workingSet,
          sprites,
          validation: 'full-serving-v1',
        }),
      ),
    );
    let backupAt = claimed.backupAt;
    if (maintenance || !backupAt || Date.now() - backupAt >= 86400000) {
      backupAt = await backupPublication(
        operational,
        serving,
        storage.bucket(backupName),
        base,
        sprites,
      );
      // Keep seven daily off-region copies plus bucket soft-delete recovery.
      await removeOldArtifacts(
        storage.bucket(backupName),
        new Set(),
        Date.now() - 7 * 86400000,
      );
    }
    // All removals occur while this execution still owns the global lease.
    // Keep both the old authoritative chain and the pending new publication.
    await removeOldArtifacts(
      operational,
      new Set([
        claimed.base.key,
        ...claimed.checkpoints.map((a) => a.key),
        base.key,
      ]),
      Date.now() - 2 * 86400000,
    );
    await removeOldArtifacts(
      serving,
      new Set([
        claimed.serving.key,
        artifactSchema.parse(prior.database).key,
        ...(prior.workingSet
          ? [artifactSchema.parse(prior.workingSet).key]
          : []),
        sprites.key,
        database.key,
        workingSet.key,
        manifest.key,
      ]),
      Date.now() - 2 * 86400000,
    );
    clearInterval(timer);
    await serialize(() =>
      control.publish(base, manifest, nextCloudWork(store!).at, backupAt),
    );
    console.log(
      JSON.stringify({
        state: 'committed',
        severity: outcome === 'ok' ? 'INFO' : 'WARNING',
        outcome,
        kind,
        manifest: manifest.key,
        ...(await resourceUsage()),
      }),
    );
  } else {
    clearInterval(timer);
    await serialize(() => control.release(work.at));
    console.log(JSON.stringify({ state: 'not-due' }));
  }
} finally {
  clearInterval(timer);
  await queued;
  journal?.close();
  store?.close();
  await rm(directory, { recursive: true, force: true });
}
