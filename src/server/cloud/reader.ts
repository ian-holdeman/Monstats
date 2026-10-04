import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { resolve, join, dirname } from 'node:path';
import { z } from 'zod';
import { PinnedReader } from './pinned-reader';
import {
  cloudStorage,
  GcsControlStorage,
  artifactSchema,
  downloadFile,
} from './storage';
import { checkDatabase } from '../backup';
import { cloudRuntime, readScope } from './read-scope';
import { resourceUsage } from './resource-usage';
import { DatabaseSync } from 'node:sqlite';

const manifestSchema = z.object({
  protocol: z.literal(1),
  database: artifactSchema,
  workingSet: artifactSchema.optional(),
  sprites: artifactSchema,
  validation: z.literal('full-serving-v1').optional(),
});
const spritesSchema = z.record(
  z.string().regex(/^[a-z0-9]+\.png$/),
  z.string().max(2 * 1024 * 1024),
);
function getReader(
  kind: 'reader' | 'historyReader' | 'spriteReader' = 'reader',
) {
  if (cloudRuntime[kind]) return cloudRuntime[kind];
  const controlBucket = process.env.MONSTATS_CONTROL_BUCKET;
  const servingBucket = process.env.MONSTATS_SERVING_BUCKET;
  if (!controlBucket || !servingBucket)
    throw new Error('Cloud reader configuration missing');
  const storage = cloudStorage();
  const control = new GcsControlStorage(storage.bucket(controlBucket));
  const bucket = storage.bucket(servingBucket);
  const root = resolve(
    /* turbopackIgnore: true */ process.env.MONSTATS_DATA_DIR ??
      '/tmp/monstats',
  );
  const reader = new PinnedReader(
    async () => {
      const { state } = await control.read();
      if (!state.serving) throw new Error('Cloud publication missing');
      return JSON.stringify(state.serving);
    },
    async (id) => {
      const started = Date.now();
      const descriptor = artifactSchema.parse(JSON.parse(id));
      if (descriptor.bytes > 1024 * 1024)
        throw new Error('Serving manifest too large');
      await mkdir(root, { recursive: true });
      const directory = await mkdtemp(join(root, 'read-'));
      try {
        await downloadFile(
          bucket,
          descriptor,
          join(directory, 'manifest.json'),
        );
        const manifest = manifestSchema.parse(
          JSON.parse(await readFile(join(directory, 'manifest.json'), 'utf8')),
        );
        const database =
          kind === 'reader'
            ? (manifest.workingSet ?? manifest.database)
            : manifest.database;
        if (
          database.bytes > 2 * 1024 ** 3 ||
          manifest.sprites.bytes > 16 * 1024 ** 2
        )
          throw new Error('Materialization capacity exceeded');
        if (kind !== 'spriteReader')
          await downloadFile(
            bucket,
            database,
            join(directory, 'monstats.sqlite'),
          );
        await downloadFile(
          bucket,
          manifest.sprites,
          join(directory, 'sprites.json'),
        );
        const sprites = spritesSchema.parse(
          JSON.parse(await readFile(join(directory, 'sprites.json'), 'utf8')),
        );
        await mkdir(join(directory, 'sprites'));
        for (const [name, encoded] of Object.entries(sprites)) {
          const bytes = Buffer.from(encoded, 'base64');
          if (
            !bytes
              .subarray(0, 8)
              .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
          )
            throw new Error('Invalid sprite artifact');
          await writeFile(join(directory, 'sprites', name), bytes, {
            flag: 'wx',
          });
        }
        if (kind !== 'spriteReader')
          checkDatabase(join(directory, 'monstats.sqlite'), {
            sealed: manifest.validation === 'full-serving-v1',
          });
        console.info(
          JSON.stringify({
            event: 'publication-ready',
            artifact: descriptor.key,
            generation: descriptor.generation,
            databaseBytes: kind === 'spriteReader' ? 0 : database.bytes,
            kind,
            materializeMs: Date.now() - started,
            ...(await resourceUsage()),
          }),
        );
        return join(directory, 'monstats.sqlite');
      } catch (error) {
        await rm(directory, { recursive: true, force: true });
        throw error;
      }
    },
    async (path) => {
      const directory = dirname(path);
      if (
        dirname(directory) !== root ||
        !directory.startsWith(join(root, 'read-'))
      )
        throw new Error('Invalid materialized directory');
      await rm(directory, { recursive: true, force: true });
    },
  );
  cloudRuntime[kind] = reader;
  return reader;
}

export type PublicationSelection = {
  kind: 'tournament' | 'ladder';
  id: string;
};
export function needsHistory(path: string, publication: PublicationSelection) {
  const db = new DatabaseSync(path, { readOnly: true });
  try {
    return (
      !!db
        .prepare("SELECT 1 FROM sqlite_master WHERE name='serving_history'")
        .get() &&
      !!db
        .prepare('SELECT 1 FROM serving_history WHERE kind=? AND id=?')
        .get(publication.kind, publication.id)
    );
  } finally {
    db.close();
  }
}
export async function withReadSnapshot<T>(
  task: () => Promise<T>,
  publication?: PublicationSelection | 'sprites',
): Promise<T> {
  if (!process.env.MONSTATS_CONTROL_BUCKET || readScope.getStore())
    return task();
  let pin = await getReader(
    publication === 'sprites' ? 'spriteReader' : 'reader',
  ).acquire();
  try {
    if (
      publication &&
      publication !== 'sprites' &&
      needsHistory(pin.path, publication)
    ) {
      // The hot snapshot may be newer than the independently cached history.
      // Recheck its pointer so a newly superseded ID does not get a false 404.
      const historical = await getReader('historyReader').acquire(true);
      await pin.release();
      pin = historical;
    }
    return await readScope.run(dirname(pin.path), task);
  } finally {
    await pin.release();
  }
}
