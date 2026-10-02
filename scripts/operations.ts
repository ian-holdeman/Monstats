import { resolve } from 'node:path';
import { Store } from '../src/server/store';
import { operationalHealth } from '../src/server/operations';
import {
  createBackup,
  restoreBackup,
  checkDatabase,
} from '../src/server/backup';
import { databasePath, dataDirectory } from '../src/server/paths';
const [command = 'health', argument] = process.argv.slice(2);
if (command === 'restore') {
  const destination = process.argv[4];
  if (!argument || !destination)
    throw new Error('restore BACKUP NEW_DATA_DIRECTORY');
  console.log(
    JSON.stringify(
      await restoreBackup(resolve(argument), resolve(destination)),
    ),
  );
} else {
  const store = new Store(databasePath(), command !== 'upgrade');
  try {
    if (command === 'health')
      console.log(JSON.stringify(operationalHealth(store), null, 2));
    else if (command === 'backup') {
      if (!argument) throw new Error('backup NEW_BACKUP_DIRECTORY');
      console.log(
        JSON.stringify(
          await createBackup(store, dataDirectory(), resolve(argument)),
        ),
      );
    } else if (command === 'verify' || command === 'upgrade')
      console.log(JSON.stringify(checkDatabase(databasePath())));
    else if (command === 'retention')
      console.log(
        JSON.stringify(
          {
            policy:
              'Dry run only. Pin every pointer, final archive, evidence snapshot, event cache and artwork. Keep last 7 unpinned derived publications; review older versions after backup.',
            unpinned: store.db
              .prepare(
                'SELECT id,published_at FROM versions WHERE id NOT IN (SELECT version_id FROM pointers) ORDER BY published_at DESC',
              )
              .all()
              .slice(7),
          },
          null,
          2,
        ),
      );
    else
      throw new Error(
        'Use health, backup, restore, verify, upgrade or retention',
      );
  } finally {
    store.close();
  }
}
