const test = require('node:test');
const assert = require('node:assert/strict');
const { getHealth } = require('../config/health');

test('connected database (readyState 1) reports OK', () => {
  const h = getHealth({ readyState: 1 });
  assert.equal(h.status, 'OK');
  assert.equal(h.database, 'connected');
});

test('disconnected database (readyState 0) reports DEGRADED', () => {
  const h = getHealth({ readyState: 0 });
  assert.equal(h.status, 'DEGRADED');
  assert.equal(h.database, 'disconnected');
});

test('connecting database (readyState 2) is not treated as healthy', () => {
  const h = getHealth({ readyState: 2 });
  assert.equal(h.status, 'DEGRADED');
});

test('disconnecting database (readyState 3) is not treated as healthy', () => {
  const h = getHealth({ readyState: 3 });
  assert.equal(h.status, 'DEGRADED');
});

test('response includes a timestamp', () => {
  const h = getHealth({ readyState: 1 });
  assert.ok(h.timestamp);
  assert.doesNotThrow(() => new Date(h.timestamp).toISOString());
});
