import { statSync } from 'node:fs';
import type { PublicDataset } from './reader';

export function storageGeneration(path: string) {
  return [path, `${path}-wal`].map((file) => {
    try {
      const s = statSync(/* turbopackIgnore: true */ file, { bigint: true });
      return [s.dev, s.ino, s.size, s.mtimeNs, s.ctimeNs].map(String);
    } catch {
      return null;
    }
  });
}

// Keep only the last complete cohort, not all lazily decoded source views.
// The byte ceiling also bounds large historical cohorts; misses are not cached.
export class ServingCohortCache {
  private saved?: { key: string; value: PublicDataset };
  read(key: string, load: () => PublicDataset | null) {
    if (this.saved?.key === key) return this.saved.value;
    this.saved = undefined;
    const value = load();
    if (value && Buffer.byteLength(JSON.stringify(value)) <= 32 * 1024 ** 2)
      this.saved = { key, value };
    return value;
  }
}

export function selectDetail(
  dataset: PublicDataset,
  detail?: string,
): PublicDataset {
  if (!detail) return dataset;
  return {
    ...dataset,
    detail,
    views: Object.fromEntries(
      Object.entries(dataset.views).map(([key, view]) => [
        key,
        {
          ...view,
          matchups:
            detail === 'table' ? {} : { [detail]: view.matchups[detail] ?? [] },
          builds:
            detail !== 'table' && view.builds?.[detail]
              ? { [detail]: view.builds[detail] }
              : {},
        },
      ]),
    ),
  };
}
