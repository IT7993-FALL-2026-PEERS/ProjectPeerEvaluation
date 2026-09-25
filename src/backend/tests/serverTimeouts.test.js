const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { applyServerTimeouts, KEEP_ALIVE_TIMEOUT_MS } = require('../config/serverTimeouts');

// Render's load balancer keeps idle connections open for a while. If Node closes them
// first (its default keep-alive is 5s), requests on a reused connection fail with 502s.
test('keep-alive timeout outlasts the load balancer', () => {
  const server = http.createServer();
  applyServerTimeouts(server);
  assert.equal(server.keepAliveTimeout, KEEP_ALIVE_TIMEOUT_MS);
  assert.ok(server.keepAliveTimeout >= 120 * 1000);
});

test('headers timeout is not shorter than keep-alive timeout', () => {
  const server = http.createServer();
  applyServerTimeouts(server);
  assert.ok(server.headersTimeout >= server.keepAliveTimeout);
});
