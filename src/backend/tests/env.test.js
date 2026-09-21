const test = require('node:test');
const assert = require('node:assert/strict');
const { loadConfig, DEV_JWT_SECRET } = require('../config/env');

const LONG_SECRET = 'x'.repeat(40);

test('development without JWT_SECRET uses the dev default and warns', () => {
  const c = loadConfig({});
  assert.equal(c.jwtSecret, DEV_JWT_SECRET);
  assert.equal(c.errors.length, 0);
  assert.equal(c.warnings.length, 1);
});

test('production without JWT_SECRET is an error', () => {
  const c = loadConfig({ NODE_ENV: 'production', MONGODB_URI: 'mongodb://db/x' });
  assert.ok(c.errors.some((e) => e.includes('JWT_SECRET')));
});

test('production with a short JWT_SECRET is an error', () => {
  const c = loadConfig({ NODE_ENV: 'production', JWT_SECRET: 'short', MONGODB_URI: 'mongodb://db/x' });
  assert.ok(c.errors.some((e) => e.includes('too short')));
});

test('production without a Mongo URI is an error', () => {
  const c = loadConfig({ NODE_ENV: 'production', JWT_SECRET: LONG_SECRET });
  assert.ok(c.errors.some((e) => e.includes('MONGODB_URI')));
});

test('production with everything set has no errors', () => {
  const c = loadConfig({ NODE_ENV: 'production', JWT_SECRET: LONG_SECRET, MONGODB_URI: 'mongodb://db/x' });
  assert.equal(c.errors.length, 0);
  assert.equal(c.jwtSecret, LONG_SECRET);
  assert.equal(c.mongoUri, 'mongodb://db/x');
});

test('MONGO_URI is still accepted as a fallback name', () => {
  const c = loadConfig({ MONGO_URI: 'mongodb://old/name' });
  assert.equal(c.mongoUri, 'mongodb://old/name');
});
