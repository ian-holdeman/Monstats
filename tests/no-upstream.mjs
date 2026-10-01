// Installed only in the isolated browser-test server. Any attempted upstream read
// fails and leaves evidence even if application code catches the error.
import fs from 'node:fs';
import http from 'node:http';
import https from 'node:https';
function guard(target) {
  const value =
    target instanceof URL
      ? target
      : typeof target === 'string'
        ? new URL(target)
        : target;
  const host = value.hostname || value.host || '';
  if (
    !['localhost', '127.0.0.1', '::1', '[::1]'].includes(
      host.replace(/:\d+$/, ''),
    )
  ) {
    fs.appendFileSync('.monstats/e2e/upstream-attempts.log', `${host}\n`);
    throw new Error('Browser-test server attempted upstream access');
  }
}
const originalFetch = globalThis.fetch;
globalThis.fetch = function (target, options) {
  guard(target instanceof Request ? target.url : target);
  return originalFetch(target, options);
};
for (const transport of [http, https])
  for (const name of ['get', 'request']) {
    const original = transport[name];
    transport[name] = function (target, ...args) {
      guard(target);
      return original.call(this, target, ...args);
    };
  }
