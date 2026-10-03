import { AsyncLocalStorage } from 'node:async_hooks';
import type { PinnedReader } from './pinned-reader';

type Runtime = { scope: AsyncLocalStorage<string>; reader?: PinnedReader };
// Next can instantiate modules separately for page and route bundles. Storage
// copies and request pins must have process-wide ownership across those bundles.
const key = Symbol.for('monstats.cloud.runtime.v1');
const processState = globalThis as typeof globalThis & {
  [key: symbol]: Runtime;
};
export const cloudRuntime = (processState[key] ??= {
  scope: new AsyncLocalStorage<string>(),
});
export const readScope = cloudRuntime.scope;
