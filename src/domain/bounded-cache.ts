/** Immutable keys isolate publications. Failures and misses are never cached. */
export class BoundedCache<T> {
  private entries = new Map<string, T>();
  constructor(private limit: number) {}
  get(key: string) {
    const value = this.entries.get(key);
    if (value !== undefined) {
      this.entries.delete(key);
      this.entries.set(key, value);
    }
    return value;
  }
  set(key: string, value: T) {
    this.entries.delete(key);
    this.entries.set(key, value);
    while (this.entries.size > this.limit)
      this.entries.delete(this.entries.keys().next().value!);
    return value;
  }
}
