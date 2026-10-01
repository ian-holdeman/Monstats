import { resolve } from 'node:path';
// Runtime data is maintained independently; never bundle the owner's evidence into Next output.
export const dataDirectory = () =>
  resolve(
    /* turbopackIgnore: true */ process.env.MONSTATS_DATA_DIR ?? '.monstats',
  );
export const databasePath = () => resolve(dataDirectory(), 'monstats.sqlite');
