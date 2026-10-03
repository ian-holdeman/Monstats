import test from 'node:test';
import assert from 'node:assert/strict';
import { acceptsGzip } from '../src/server/response-encoding';
test('gzip negotiation honors explicit refusal, quality and wildcard fallback', () => {
  assert.equal(acceptsGzip(null), false);
  assert.equal(acceptsGzip('br, gzip, deflate'), true);
  assert.equal(acceptsGzip('gzip;q=0, *;q=1'), false);
  assert.equal(acceptsGzip('gzip;q=0.5'), true);
  assert.equal(acceptsGzip('*;q=0.2'), true);
  assert.equal(acceptsGzip('gzip;q=wat'), false);
});
