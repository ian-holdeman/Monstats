import { randomUUID } from 'node:crypto';
import type { ControlStorage } from './control';

export async function dispatchDue(
  storage: ControlStorage,
  launch: () => Promise<void>,
  now = Date.now(),
) {
  const { generation, state } = await storage.read();
  if ((state.lease?.expiresAt ?? 0) > now || state.nextDispatchAt > now)
    return false;
  // Reserve a bounded launch window before invoking Jobs. Lost acknowledgements
  // may cause duplicate executions after two minutes; writer fencing is separate.
  await storage.compareAndSwap(generation, {
    ...state,
    mutation: randomUUID(),
    nextDispatchAt: now + 120000,
  });
  await launch();
  return true;
}
