import { resolve } from 'node:path';
import { readScope } from './cloud/read-scope';
// Runtime data is maintained independently; never bundle the owner's evidence into Next output.
export const dataDirectory = () =>
  resolve(
    /* turbopackIgnore: true */ readScope.getStore() ??
      process.env.MONSTATS_DATA_DIR ??
      '.monstats',
  );
export const databasePath = () => resolve(dataDirectory(), 'monstats.sqlite');
