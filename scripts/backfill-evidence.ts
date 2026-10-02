import { Store } from '../src/server/store';
import { databasePath } from '../src/server/paths';
import { backfillEvidence } from '../src/server/evidence-index';
const store = new Store(databasePath());
try {
  const argument = process.argv[2];
  const datasets = (
    argument === '--all'
      ? [store.current(), ...store.archives()]
      : [argument ? store.version(argument) : store.current()]
  ).filter((d) => d !== null);
  if (!datasets.length) throw new Error('Saved publication unavailable');
  for (const d of datasets) {
    if (!d) throw new Error('Saved publication unavailable');
    const start = performance.now();
    backfillEvidence(store.db, d);
    console.log(
      `Evidence ready for ${d.id} (${Math.round(performance.now() - start)} ms); source publication and pointers preserved.`,
    );
  }
} finally {
  store.close();
}
