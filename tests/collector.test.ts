import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fetchBounded } from '../src/server/collector';
test('provider boundaries reject nonretryable errors and respect long cooldown', async () => {
  let calls = 0;
  const provider = (async () => {
    calls++;
    return new Response('private', { status: 403 });
  }) as typeof fetch;
  await assert.rejects(
    () => fetchBounded('https://example.test', provider),
    /HTTP 403/,
  );
  assert.equal(calls, 1);
  await assert.rejects(
    () =>
      fetchBounded(
        'https://example.test',
        (async () =>
          new Response('', {
            status: 429,
            headers: { 'retry-after': '3600' },
          })) as typeof fetch,
      ),
    /cooldown/,
  );
});
