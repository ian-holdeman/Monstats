import { Worker } from 'node:worker_threads';
import { resolve } from 'node:path';
import { statSync } from 'node:fs';
import { databasePath } from './paths';
import type { AppData } from './reader';
import { EVIDENCE_VERSION } from '../domain/evidence';
import { withReadSnapshot } from './cloud/reader';

export type DatasetRead = {
  kind: 'dataset';
  path: string;
  id: string;
  source: string;
  sheet: string;
  minPlayers: number;
  official: boolean;
  gzip?: boolean;
  detail?: string;
};
export type ServingCommand = DatasetRead | { kind: 'app'; path: string };
export type DatasetResponse = {
  kind: 'dataset';
  status: 200 | 404;
  body: Uint8Array<ArrayBuffer>;
  cacheable: boolean;
};
export type ServingResponse = DatasetResponse | { kind: 'app'; data: AppData };

export class ServingCapacityError extends Error {}
export class ServingUnavailableError extends Error {}
type Job = {
  id: number;
  key: string;
  command: ServingCommand;
  promise: Promise<ServingResponse>;
  resolve: (result: ServingResponse) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};

// Local storage remains writable: backups and supplemental indexes can change
// the bytes behind a path. Include WAL commits as well as main-file replacement.
function storageGeneration(path: string) {
  return [path, `${path}-wal`].map((file) => {
    try {
      // Runtime database files are external to the release, never build inputs.
      const s = statSync(/* turbopackIgnore: true */ file, { bigint: true });
      return [s.dev, s.ino, s.size, s.mtimeNs, s.ctimeNs].map(String);
    } catch {
      return null;
    }
  });
}

// One cold reader, two queued distinct reads, and eight total subscribers.
// Only fully evidenced immutable JSON responses enter the byte-bounded cache.
export class ServingReader {
  private worker?: Worker;
  private active?: Job;
  private restarting = false;
  private closed = false;
  private sequence = 0;
  private subscribers = 0;
  private queued: Job[] = [];
  private pending = new Map<string, Job>();
  private cached = new Map<string, DatasetResponse>();
  private cachedBytes = 0;
  constructor(
    private workerFile = resolve('dist/workers/serving-reader.mjs'),
    private limits = {
      cacheBytes: 64 * 1024 * 1024,
      cacheEntries: 64,
      jobs: 3,
      subscribers: 8,
      deadlineMs: 30000,
    },
  ) {}

  read(command: ServingCommand): Promise<ServingResponse> {
    if (this.closed)
      return Promise.reject(new ServingUnavailableError('Reader closed'));
    const key = JSON.stringify([
      EVIDENCE_VERSION,
      storageGeneration(command.path),
      command,
    ]);
    const cached = this.cached.get(key);
    if (cached) {
      this.cached.delete(key);
      this.cached.set(key, cached);
      return Promise.resolve(cached);
    }
    if (this.subscribers >= this.limits.subscribers)
      return Promise.reject(
        new ServingCapacityError('Reader capacity reached'),
      );
    let job = this.pending.get(key);
    if (!job) {
      if (this.pending.size >= this.limits.jobs)
        return Promise.reject(
          new ServingCapacityError('Reader capacity reached'),
        );
      let resolve!: Job['resolve'];
      let reject!: Job['reject'];
      const promise = new Promise<ServingResponse>((yes, no) => {
        resolve = yes;
        reject = no;
      });
      const id = ++this.sequence;
      job = {
        id,
        key,
        command,
        promise,
        resolve,
        reject,
        timer: setTimeout(() => this.expire(id), this.limits.deadlineMs),
      };
      this.pending.set(key, job);
      this.queued.push(job);
    }
    this.subscribers++;
    this.dispatch();
    return job.promise.finally(() => {
      this.subscribers--;
    });
  }

  private finish(job: Job, result?: ServingResponse, error?: Error) {
    clearTimeout(job.timer);
    this.pending.delete(job.key);
    if (error) job.reject(error);
    else if (result) {
      if (
        result.kind === 'dataset' &&
        result.status === 200 &&
        result.cacheable &&
        result.body.byteLength <= this.limits.cacheBytes
      ) {
        this.cached.set(job.key, result);
        this.cachedBytes += result.body.byteLength;
        while (
          this.cachedBytes > this.limits.cacheBytes ||
          this.cached.size > this.limits.cacheEntries
        ) {
          const first = this.cached.keys().next().value!;
          this.cachedBytes -= this.cached.get(first)!.body.byteLength;
          this.cached.delete(first);
        }
      }
      job.resolve(result);
    }
  }

  private dispatch() {
    if (this.closed || this.restarting || this.active || !this.queued.length)
      return;
    if (!this.worker) {
      try {
        const worker = new Worker(this.workerFile, {
          execArgv: [],
          resourceLimits: { maxOldGenerationSizeMb: 512 },
        });
        this.worker = worker;
        worker.on(
          'message',
          (message: {
            id: number;
            result?: ServingResponse;
            error?: boolean;
          }) => {
            if (this.worker !== worker) return;
            const job = this.active;
            if (
              !job ||
              message.id !== job.id ||
              (!message.result && !message.error)
            ) {
              this.reset(worker);
              return;
            }
            this.active = undefined;
            worker.unref();
            this.finish(
              job,
              message.result,
              message.error
                ? new ServingUnavailableError('Saved data unavailable')
                : undefined,
            );
            this.dispatch();
          },
        );
        worker.on('error', () => this.reset(worker));
        worker.on('exit', () => this.reset(worker));
        worker.unref();
      } catch {
        for (const job of this.queued.splice(0))
          this.finish(
            job,
            undefined,
            new ServingUnavailableError('Reader unavailable'),
          );
        return;
      }
    }
    this.active = this.queued.shift()!;
    this.worker.ref();
    this.worker.postMessage({
      id: this.active.id,
      command: this.active.command,
    });
  }

  private expire(id: number) {
    if (this.active?.id === id && this.worker) {
      this.reset(this.worker);
      return;
    }
    const index = this.queued.findIndex((job) => job.id === id);
    if (index >= 0) {
      const [job] = this.queued.splice(index, 1);
      this.finish(
        job,
        undefined,
        new ServingUnavailableError('Read deadline exceeded'),
      );
    }
  }

  private reset(worker: Worker) {
    if (this.worker !== worker) return;
    this.worker = undefined;
    this.restarting = true;
    if (this.active) {
      this.finish(
        this.active,
        undefined,
        new ServingUnavailableError('Reader interrupted'),
      );
      this.active = undefined;
    }
    void worker
      .terminate()
      .catch(() => {})
      .finally(() => {
        this.restarting = false;
        this.dispatch();
      });
  }

  async close() {
    this.closed = true;
    if (this.active) {
      this.finish(
        this.active,
        undefined,
        new ServingUnavailableError('Reader closed'),
      );
      this.active = undefined;
    }
    for (const job of this.queued.splice(0))
      this.finish(job, undefined, new ServingUnavailableError('Reader closed'));
    this.cached.clear();
    this.cachedBytes = 0;
    const worker = this.worker;
    this.worker = undefined;
    if (worker) await worker.terminate();
  }
}

const shared = new ServingReader();
export async function readSavedDataset(
  input: Omit<DatasetRead, 'kind' | 'path'>,
) {
  return withReadSnapshot(async () => {
    const result = await shared.read({
      kind: 'dataset',
      path: databasePath(),
      ...input,
    });
    if (result.kind !== 'dataset')
      throw new ServingUnavailableError('Invalid reader response');
    return result;
  });
}
export async function readPageData(): Promise<AppData> {
  try {
    return await withReadSnapshot(async () => {
      const result = await shared.read({ kind: 'app', path: databasePath() });
      if (result.kind !== 'app')
        throw new ServingUnavailableError('Invalid reader response');
      return result.data;
    });
  } catch {
    return {
      current: null,
      archives: [],
      status: null,
      readError: true,
      now: new Date().toISOString(),
    };
  }
}
