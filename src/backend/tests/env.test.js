const test = require('node:test');
const assert = require('node:assert/strict');
const { loadConfig, DEV_JWT_SECRET } = require('../config/env');

const LONG_SECRET = 'x'.repeat(40);

test('without NODE_ENV and JWT_SECRET it uses the dev default and warns', () => {
  const c = loadConfig({});
  assert.equal(c.jwtSecret, DEV_JWT_SECRET);
  assert.equal(c.errors.length, 0);
  assert.equal(c.warnings.length, 1);
});

test('production without JWT_SECRET is an error', () => {
  const c = loadConfig({ NODE_ENV: 'production' });
  assert.ok(c.errors.some((e) => e.includes('JWT_SECRET')));
});

test('production with a short JWT_SECRET is an error', () => {
  const c = loadConfig({ NODE_ENV: 'production', JWT_SECRET: 'short' });
  assert.ok(c.errors.some((e) => e.includes('too short')));
});

test('production with a long JWT_SECRET has no errors', () => {
  const c = loadConfig({ NODE_ENV: 'production', JWT_SECRET: LONG_SECRET });
  assert.equal(c.errors.length, 0);
  assert.equal(c.jwtSecret, LONG_SECRET);
});
