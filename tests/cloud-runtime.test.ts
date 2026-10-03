import test from 'node:test';
import assert from 'node:assert/strict';
import { cloudRuntime, readScope } from '../src/server/cloud/read-scope';

test('independently loaded route modules share the request pin scope', async () => {
  const replica = await import(
    new URL('../src/server/cloud/read-scope.ts?route-copy', import.meta.url)
      .href
  );
  assert.equal(replica.cloudRuntime, cloudRuntime);
  await readScope.run('/immutable/publication', async () => {
    assert.equal(replica.readScope.getStore(), '/immutable/publication');
  });
});
