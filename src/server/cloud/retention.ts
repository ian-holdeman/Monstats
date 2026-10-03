import type { Bucket } from '@google-cloud/storage';
import { randomUUID } from 'node:crypto';
import type { Artifact } from './control';
import { uploadBytes } from './storage';

export async function copyArtifact(
  source: Bucket,
  target: Bucket,
  artifact: Artifact,
) {
  const key = `objects/${randomUUID()}`;
  const [file] = await source
    .file(artifact.key, { generation: artifact.generation })
    .copy(target.file(key), { preconditionOpts: { ifGenerationMatch: 0 } });
  const [metadata] = await file.getMetadata();
  if (Number(metadata.size) !== artifact.bytes)
    throw new Error('Backup copy size mismatch');
  return { ...artifact, key, generation: String(metadata.generation) };
}

export async function backupPublication(
  operational: Bucket,
  serving: Bucket,
  destination: Bucket,
  base: Artifact,
  sprites: Artifact,
) {
  const database = await copyArtifact(operational, destination, base);
  const artwork = await copyArtifact(serving, destination, sprites);
  const createdAt = Date.now();
  await uploadBytes(
    destination,
    Buffer.from(
      JSON.stringify({ protocol: 1, createdAt, database, sprites: artwork }),
    ),
  );
  return createdAt;
}

// Only redundant objects in dedicated artifact namespaces are eligible. The
// current base contains all historical publications and original source bodies.
// Control objects and separately pinned imported evidence are never candidates.
export async function removeOldArtifacts(
  bucket: Bucket,
  keep: Set<string>,
  before: number,
) {
  const [files] = await bucket.getFiles({ prefix: 'objects/' });
  for (const file of files) {
    if (keep.has(file.name)) continue;
    const created = Date.parse(String(file.metadata.timeCreated));
    if (!Number.isFinite(created) || created >= before) continue;
    await file.delete({
      ifGenerationMatch: String(file.metadata.generation),
      ignoreNotFound: true,
    });
  }
}
