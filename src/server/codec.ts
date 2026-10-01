import { gzipSync, gunzipSync } from 'node:zlib';
import type { Aggregate, PublishedDataset } from '../domain/types';
type Packed = Omit<PublishedDataset, 'views'> & {
  storageVersion: 1;
  viewKeys: Record<string, string>;
  packedViews: Record<string, string>;
};
export function encodePublication(dataset: PublishedDataset) {
  const { views, ...facts } = dataset;
  const identities = new Map<Aggregate, string>();
  const packedViews: Record<string, string> = {};
  const viewKeys: Record<string, string> = {};
  for (const [key, view] of Object.entries(views)) {
    let id = identities.get(view);
    if (!id) {
      id = String(identities.size);
      identities.set(view, id);
      packedViews[id] = gzipSync(JSON.stringify(view)).toString('base64');
    }
    viewKeys[key] = id;
  }
  return gzipSync(
    JSON.stringify({
      ...facts,
      storageVersion: 1,
      viewKeys,
      packedViews,
    } satisfies Packed),
  );
}
export function decodePublication(payload: unknown): PublishedDataset {
  if (typeof payload === 'string')
    return JSON.parse(payload) as PublishedDataset;
  if (!(payload instanceof Uint8Array))
    throw new Error('Invalid publication storage');
  const decoded = JSON.parse(gunzipSync(payload).toString('utf8')) as Packed;
  if (decoded.storageVersion !== 1)
    throw new Error('Unsupported publication storage version');
  const { storageVersion, viewKeys, packedViews, ...facts } = decoded;
  void storageVersion;
  const views: Record<string, Aggregate> = {};
  const cache = new Map<string, Aggregate>();
  for (const [key, id] of Object.entries(viewKeys))
    Object.defineProperty(views, key, {
      enumerable: true,
      get() {
        if (!cache.has(id))
          cache.set(
            id,
            JSON.parse(
              gunzipSync(Buffer.from(packedViews[id], 'base64')).toString(
                'utf8',
              ),
            ) as Aggregate,
          );
        return cache.get(id)!;
      },
    });
  return { ...facts, views };
}
