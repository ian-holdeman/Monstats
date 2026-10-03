import { readFile } from 'node:fs/promises';

export async function resourceUsage() {
  for (const path of [
    '/sys/fs/cgroup/memory.peak',
    '/sys/fs/cgroup/memory/memory.max_usage_in_bytes',
  ]) {
    try {
      const peakBytes = Number(
        await readFile(/* turbopackIgnore: true */ path, 'utf8'),
      );
      if (Number.isFinite(peakBytes)) return { peakBytes };
    } catch {
      /* Windows/local runtimes may not expose cgroup counters. */
    }
  }
  return { peakRssKiB: process.resourceUsage().maxRSS };
}
