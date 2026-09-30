const test = require('node:test');
const assert = require('node:assert/strict');
const { requestLogger, redactUrl } = require('../middleware/requestLogger');

// A student's link token is their only credential, and request logs end up in
// Render's log stream, so the token must never be written there.
test('evaluation tokens are redacted from logged URLs', () => {
  assert.equal(redactUrl('/api/evaluate/abc123'), '/api/evaluate/[redacted]');
  assert.equal(redactUrl('/api/evaluate/abc123/status'), '/api/evaluate/[redacted]/status');
  assert.equal(redactUrl('/api/evaluate/abc123?x=1'), '/api/evaluate/[redacted]?x=1');
  // Express routes case-insensitively, so this still reaches the evaluate handler.
  assert.equal(redactUrl('/API/Evaluate/abc123'), '/API/Evaluate/[redacted]');
});

test('other URLs are logged unchanged', () => {
  assert.equal(redactUrl('/api/courses/42/students'), '/api/courses/42/students');
  assert.equal(redactUrl('/api/health'), '/api/health');
});

test('the middleware logs method and redacted URL, then continues', (t) => {
  const lines = [];
  t.mock.method(console, 'log', (line) => lines.push(line));
  let nextCalled = false;

  requestLogger({ method: 'POST', originalUrl: '/api/evaluate/secret-token' }, {}, () => { nextCalled = true; });

  assert.equal(nextCalled, true);
  assert.equal(lines.length, 1);
  assert.match(lines[0], /POST \/api\/evaluate\/\[redacted\]$/);
  assert.doesNotMatch(lines[0], /secret-token/);
});
