import { gzipSync, gunzipSync } from 'node:zlib';
import type { Aggregate, PublishedDataset } from '../domain/types';
type Packed = Omit<PublishedDataset, 'views'> & {
  storageVersion: 1 | 2;
  viewKeys: Record<string, string>;
  packedViews: Record<string, string>;
  cohortOptions?: Record<string, Aggregate['options']>;
};
export function encodePublication(dataset: PublishedDataset) {
  const { views, ...facts } = dataset;
  const identities = new Map<Aggregate, string>();
  const shared: Aggregate[] = [];
  const packedViews: Record<string, string> = {};
  const viewKeys: Record<string, string> = {};
  const cohortOptions: Record<string, Aggregate['options']> = {};
  for (const [key, view] of Object.entries(views)) {
    let id = identities.get(view);
    const reuse = shared.find(
      (v) =>
        v.pokemon === view.pokemon &&
        v.matchups === view.matchups &&
        v.coverage === view.coverage &&
        v.builds === view.builds,
    );
    if (reuse) id = identities.get(reuse);
    if (!id) {
      id = String(identities.size);
      identities.set(view, id);
      shared.push(view);
      const { options, ...metrics } = view;
      void options;
      packedViews[id] = gzipSync(JSON.stringify(metrics)).toString('base64');
    }
    viewKeys[key] = id;
    cohortOptions[key] = view.options;
  }
  return gzipSync(
    JSON.stringify({
      ...facts,
      storageVersion: 2,
      viewKeys,
      packedViews,
      cohortOptions,
    } satisfies Packed),
  );
}
export function decodePublication(payload: unknown): PublishedDataset {
  if (typeof payload === 'string')
    return JSON.parse(payload) as PublishedDataset;
  if (!(payload instanceof Uint8Array))
    throw new Error('Invalid publication storage');
  const decoded = JSON.parse(gunzipSync(payload).toString('utf8')) as Packed;
  if (decoded.storageVersion !== 1 && decoded.storageVersion !== 2)
    throw new Error('Unsupported publication storage version');
  const { storageVersion, viewKeys, packedViews, cohortOptions, ...facts } =
    decoded;
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
        return storageVersion === 2
          ? { ...cache.get(id)!, options: cohortOptions![key] }
          : cache.get(id)!;
      },
    });
  return { ...facts, views };
}
