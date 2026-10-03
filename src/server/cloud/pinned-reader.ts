type Loaded = { id: string; path: string; references: number };

// Refresh is request-driven, so scale-to-zero and throttled idle CPU do not
// affect convergence. Each queued/in-flight worker retains its exact path.
export class PinnedReader {
  private current?: Loaded;
  private refreshing?: Promise<void>;
  private checkedAt = -Infinity;
  constructor(
    private readVersion: () => Promise<string>,
    private materialize: (id: string) => Promise<string>,
    private remove: (path: string) => Promise<void>,
    private now = Date.now,
    private refreshMs = 30000,
  ) {}

  async acquire() {
    if (!this.current || this.now() - this.checkedAt >= this.refreshMs) {
      if (!this.refreshing) {
        this.refreshing = this.refresh().finally(() => {
          this.refreshing = undefined;
        });
      }
      await this.refreshing;
    }
    const selected = this.current;
    if (!selected) throw new Error('Cloud publication unavailable');
    selected.references++;
    let released = false;
    return {
      path: selected.path,
      release: async () => {
        if (released) return;
        released = true;
        selected.references--;
        if (selected !== this.current && selected.references === 0)
          await this.remove(selected.path);
      },
    };
  }

  private async refresh() {
    try {
      const id = await this.readVersion();
      if (id !== this.current?.id) {
        const path = await this.materialize(id);
        const old = this.current;
        this.current = { id, path, references: 0 };
        if (old && old.references === 0) await this.remove(old.path);
      }
      this.checkedAt = this.now();
    } catch {
      // Do not cache a cold failure. A warm instance retains complete old data
      // and retries after a bounded interval without deleting a pinned file.
      if (this.current) this.checkedAt = this.now();
    }
  }
}
