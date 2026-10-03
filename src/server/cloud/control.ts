import { randomUUID } from 'node:crypto';

export type Artifact = {
  key: string;
  generation: string;
  sha256: string;
  bytes: number;
};
export type ControlState = {
  protocol: 1;
  epoch: number;
  mutation: string;
  lease?: { owner: string; expiresAt: number };
  base?: Artifact;
  checkpoints: Artifact[];
  serving?: Artifact;
  nextDispatchAt: number;
  backupAt?: number;
};
export type ControlVersion = { generation: string; state: ControlState };
export interface ControlStorage {
  read(): Promise<ControlVersion>;
  compareAndSwap(generation: string, state: ControlState): Promise<string>;
}
export class ControlConflict extends Error {
  constructor() {
    super('Cloud control generation conflict; owner fenced');
  }
}

// A handle belongs to one execution. It never retries a mutation using a newly
// read generation: a competing owner must win, even after an ambiguous reply.
export class CloudControl {
  private version?: ControlVersion;
  private owner?: string;
  private busy = false;
  constructor(
    private storage: ControlStorage,
    private now = Date.now,
  ) {}

  async claim(owner: string, durationMs: number): Promise<ControlState> {
    if (this.version || this.busy || !owner)
      throw new Error('Invalid lease claim');
    this.duration(durationMs);
    this.busy = true;
    try {
      const version = await this.storage.read();
      if (version.state.protocol !== 1)
        throw new Error('Unsupported cloud protocol');
      if (version.state.lease && version.state.lease.expiresAt > this.now())
        throw new Error('Cloud lease occupied');
      this.owner = owner;
      this.version = version;
      const next = structuredClone(version.state);
      next.epoch++;
      next.lease = { owner, expiresAt: this.now() + durationMs };
      await this.write(next);
      return structuredClone(this.version!.state);
    } finally {
      this.busy = false;
    }
  }

  async renew(durationMs: number) {
    this.duration(durationMs);
    await this.mutate((state) => {
      state.lease!.expiresAt = this.now() + durationMs;
    });
  }

  async checkpoint(artifact: Artifact, durationMs?: number) {
    this.artifact(artifact);
    if (durationMs !== undefined) this.duration(durationMs);
    await this.mutate((state) => {
      state.checkpoints.push(artifact);
      if (durationMs !== undefined)
        state.lease!.expiresAt = this.now() + durationMs;
    });
  }

  async release(nextDispatchAt: number) {
    if (!Number.isFinite(nextDispatchAt) || nextDispatchAt < 0)
      throw new Error('Invalid dispatch time');
    await this.mutate((state) => {
      state.nextDispatchAt = nextDispatchAt;
      delete state.lease;
    });
    this.owner = undefined;
  }

  // Call only after artifacts are uploaded and verified. The operational base
  // includes final completion; this one CAS commits both views or neither.
  async publish(
    base: Artifact,
    serving: Artifact,
    nextDispatchAt: number,
    backupAt?: number,
  ) {
    this.artifact(base);
    this.artifact(serving);
    if (!Number.isFinite(nextDispatchAt) || nextDispatchAt < 0)
      throw new Error('Invalid dispatch time');
    await this.mutate((state) => {
      state.base = base;
      state.serving = serving;
      state.checkpoints = [];
      state.nextDispatchAt = nextDispatchAt;
      if (backupAt !== undefined) state.backupAt = backupAt;
      delete state.lease;
    });
    this.owner = undefined;
  }

  private duration(value: number) {
    if (!Number.isInteger(value) || value < 1000 || value > 3600000)
      throw new Error('Invalid lease duration');
  }
  private artifact(value: Artifact) {
    if (
      !/^objects\/[a-zA-Z0-9/_-]+$/.test(value.key) ||
      !/^\d+$/.test(value.generation) ||
      !/^[a-f0-9]{64}$/.test(value.sha256) ||
      !Number.isSafeInteger(value.bytes) ||
      value.bytes <= 0
    )
      throw new Error('Invalid artifact descriptor');
  }
  private async mutate(change: (state: ControlState) => void) {
    if (this.busy) throw new Error('Concurrent control mutation');
    this.busy = true;
    try {
      const lease = this.version?.state.lease;
      if (
        !lease ||
        !this.owner ||
        lease.owner !== this.owner ||
        lease.expiresAt <= this.now()
      )
        throw new Error('Cloud lease expired or owner fenced');
      const next = structuredClone(this.version!.state);
      change(next);
      await this.write(next);
    } finally {
      this.busy = false;
    }
  }
  private async write(next: ControlState) {
    next.mutation = randomUUID();
    try {
      const generation = await this.storage.compareAndSwap(
        this.version!.generation,
        next,
      );
      this.version = { generation, state: next };
    } catch (error) {
      try {
        const actual = await this.storage.read();
        if (actual.state.mutation === next.mutation) {
          this.version = actual;
          return;
        }
      } catch {
        /* Uncertain state fences this execution as well. */
      }
      this.owner = undefined;
      this.version = undefined;
      throw error;
    }
  }
}
