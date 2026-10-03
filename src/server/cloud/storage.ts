import { Storage, type Bucket } from '@google-cloud/storage';
import { createHash, randomUUID } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import { Transform } from 'node:stream';
import { setTimeout as delay } from 'node:timers/promises';
import { z } from 'zod';
import {
  ControlConflict,
  type Artifact,
  type ControlState,
  type ControlStorage,
} from './control';

export const artifactSchema = z.object({
  key: z.string().regex(/^objects\/[a-zA-Z0-9/_-]+$/),
  generation: z.string().regex(/^\d+$/),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  bytes: z
    .number()
    .int()
    .positive()
    .max(8 * 1024 ** 3),
});
const controlSchema = z.object({
  protocol: z.literal(1),
  epoch: z.number().int().nonnegative(),
  mutation: z.string().min(1),
  lease: z
    .object({ owner: z.string().min(1), expiresAt: z.number().finite() })
    .optional(),
  base: artifactSchema.optional(),
  checkpoints: z.array(artifactSchema).max(20000),
  serving: artifactSchema.optional(),
  nextDispatchAt: z.number().finite().nonnegative(),
  backupAt: z.number().finite().nonnegative().optional(),
});

export function cloudStorage() {
  // ADC resolves attached service identity in Cloud Run. Never ship a key file.
  return new Storage({ retryOptions: { autoRetry: false }, timeout: 120000 });
}

export class GcsControlStorage implements ControlStorage {
  private nextWriteAt = 0;
  constructor(
    private bucket: Bucket,
    private key = 'control.json',
  ) {}
  async read() {
    const file = this.bucket.file(this.key);
    const [metadata] = await file.getMetadata();
    const updated = Date.parse(String(metadata.updated));
    if (Number.isFinite(updated))
      this.nextWriteAt = Math.max(this.nextWriteAt, updated + 1100);
    if (Number(metadata.size) > 8 * 1024 * 1024)
      throw new Error('Control size exceeded');
    const generation = String(metadata.generation);
    // Metadata and bytes must refer to the SAME generation across a writer CAS.
    const [bytes] = await this.bucket
      .file(this.key, { generation })
      .download({ validation: 'crc32c' });
    return {
      generation,
      state: controlSchema.parse(JSON.parse(bytes.toString('utf8'))),
    };
  }
  async compareAndSwap(generation: string, state: ControlState) {
    const file = this.bucket.file(this.key);
    const body = JSON.stringify(controlSchema.parse(state));
    // GCS permits one mutation per object name per second. Every retry keeps
    // the original generation and mutation ID; a newer owner still fences us.
    for (let attempt = 0; ; attempt++) {
      const wait = this.nextWriteAt - Date.now();
      if (wait > 0) await delay(wait);
      try {
        await file.save(body, {
          resumable: false,
          validation: 'crc32c',
          preconditionOpts: { ifGenerationMatch: generation },
          metadata: {
            contentType: 'application/json',
            cacheControl: 'no-store',
          },
        });
        break;
      } catch (error) {
        const code = Number((error as { code?: number }).code);
        if (code === 412) throw new ControlConflict();
        if (code !== 429 || attempt >= 3) throw error;
        this.nextWriteAt = Date.now() + 1100 * 2 ** attempt;
      } finally {
        this.nextWriteAt = Math.max(this.nextWriteAt, Date.now() + 1100);
      }
    }
    // A fresh metadata read cannot be adopted blindly: another mutation may
    // already have won. CloudControl reconciles only its exact mutation ID.
    const actual = await this.read();
    if (actual.state.mutation !== state.mutation) throw new ControlConflict();
    return actual.generation;
  }
}

export async function uploadBytes(
  bucket: Bucket,
  bytes: Uint8Array,
): Promise<Artifact> {
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const key = `objects/${randomUUID()}`;
  const file = bucket.file(key);
  await file.save(Buffer.from(bytes), {
    resumable: false,
    validation: 'crc32c',
    preconditionOpts: { ifGenerationMatch: 0 },
  });
  const [metadata] = await file.getMetadata();
  if (Number(metadata.size) !== bytes.byteLength)
    throw new Error('Uploaded size mismatch');
  return {
    key,
    generation: String(metadata.generation),
    sha256,
    bytes: bytes.byteLength,
  };
}

export async function uploadFile(
  bucket: Bucket,
  path: string,
): Promise<Artifact> {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  const bytes = (await stat(path)).size;
  const key = `objects/${randomUUID()}`;
  const [file] = await bucket.upload(path, {
    destination: key,
    validation: 'crc32c',
    preconditionOpts: { ifGenerationMatch: 0 },
  });
  const [metadata] = await file.getMetadata();
  if (Number(metadata.size) !== bytes)
    throw new Error('Uploaded size mismatch');
  return {
    key,
    generation: String(metadata.generation),
    sha256: hash.digest('hex'),
    bytes,
  };
}

export async function downloadFile(
  bucket: Bucket,
  artifact: Artifact,
  path: string,
) {
  artifactSchema.parse(artifact);
  const hash = createHash('sha256');
  let bytes = 0;
  const verify = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      bytes += chunk.length;
      if (bytes > artifact.bytes) {
        callback(new Error('Artifact size exceeded'));
        return;
      }
      hash.update(chunk);
      callback(null, chunk);
    },
  });
  await pipeline(
    bucket
      .file(artifact.key, { generation: artifact.generation })
      .createReadStream({ validation: 'crc32c', decompress: false }),
    verify,
    createWriteStream(path, { flags: 'wx' }),
  );
  if (bytes !== artifact.bytes || hash.digest('hex') !== artifact.sha256)
    throw new Error('Artifact checksum mismatch');
}
