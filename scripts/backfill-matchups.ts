import { Store } from '../src/server/store';
import { databasePath } from '../src/server/paths';
import { backfillMatchups, indexMetadata } from '../src/server/matchup-index';

const args = process.argv.slice(2);
const store = new Store(databasePath());
try {
  const ids = args.includes('--all')
    ? store.db
        .prepare('SELECT id FROM versions ORDER BY published_at')
        .all()
        .map((r) => String(r.id))
    : [args[0] ?? store.current()?.id];
  if (!ids.length || ids.some((id) => !id))
    throw new Error('No saved publication');
  for (const id of ids) {
    const d = store.version(id!);
    if (!d) throw new Error(`Unknown publication ${id}`);
    const start = performance.now();
    backfillMatchups(store.db, d);
    const meta = indexMetadata(store.db, d.id)!;
    console.log({
      publication: d.id,
      asOf: d.asOf,
      results: meta.physicalResults,
      teams: meta.teams,
      elapsedMs: Math.round(performance.now() - start),
    });
  }
} finally {
  store.close();
}
