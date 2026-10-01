import { Store } from '../src/server/store';
import { databasePath } from '../src/server/paths';
import { randomUUID } from 'node:crypto';
const [regulation, id] = process.argv.slice(2);
if (!regulation || !id)
  throw new Error(
    'Usage: npm run regulation:activate -- M-X reviewed-publication-id',
  );
const store = new Store(databasePath()),
  owner = randomUUID();
try {
  if (!store.acquireLease(owner, Date.now()))
    throw new Error('Another ingestion process is running');
  store.activate(regulation, id);
  console.log(
    `Activated ${regulation} publication ${id}; outgoing coverage frozen`,
  );
} finally {
  store.releaseLease(owner);
  store.close();
}
