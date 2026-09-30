const test = require('node:test');
const assert = require('node:assert/strict');
const {
  generateEvaluationToken,
  getTokenTtlDays,
  isTokenExpired,
  refreshEvaluationToken,
} = require('../utils/evaluationToken');

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = new Date('2026-10-01T12:00:00Z');

// API-1: links were built from Math.random(), about 128 bits at best and predictable.
test('tokens are 32 random bytes as hex', () => {
  const token = generateEvaluationToken();
  assert.match(token, /^[0-9a-f]{64}$/);
});

test('tokens do not repeat', () => {
  const tokens = new Set(Array.from({ length: 1000 }, generateEvaluationToken));
  assert.equal(tokens.size, 1000);
});

test('link lifetime defaults to 14 days', () => {
  assert.equal(getTokenTtlDays({}), 14);
});

test('link lifetime can be set with EVALUATION_TOKEN_TTL_DAYS', () => {
  assert.equal(getTokenTtlDays({ EVALUATION_TOKEN_TTL_DAYS: '30' }), 30);
});

test('an invalid link lifetime falls back to the default', () => {
  for (const value of ['0', '-3', 'abc', '']) {
    assert.equal(getTokenTtlDays({ EVALUATION_TOKEN_TTL_DAYS: value }), 14, `value ${JSON.stringify(value)}`);
  }
});

test('a token with a future expiry is not expired', () => {
  const student = { evaluation_token: 'a', evaluation_token_expires_at: new Date(NOW.getTime() + 1000) };
  assert.equal(isTokenExpired(student, NOW), false);
});

test('a token past its expiry is expired', () => {
  const student = { evaluation_token: 'a', evaluation_token_expires_at: new Date(NOW.getTime() - 1000) };
  assert.equal(isTokenExpired(student, NOW), true);
});

// Links sent before expiry existed have no date. They are treated as expired, and
// the professor re-sends to issue a new one.
test('a token with no expiry date is expired', () => {
  assert.equal(isTokenExpired({ evaluation_token: 'a', evaluation_token_expires_at: null }, NOW), true);
  assert.equal(isTokenExpired({ evaluation_token: 'a' }, NOW), true);
});

// Fails closed: a value that isn't a real date never keeps a link alive.
test('a token with an unreadable expiry date is expired', () => {
  assert.equal(isTokenExpired({ evaluation_token: 'a', evaluation_token_expires_at: 'not a date' }, NOW), true);
});

test('refresh issues a new token when the student has none', () => {
  const { token, expiresAt } = refreshEvaluationToken({ evaluation_token: null }, { now: NOW, env: {} });
  assert.match(token, /^[0-9a-f]{64}$/);
  assert.equal(expiresAt.getTime(), NOW.getTime() + 14 * DAY_MS);
});

test('refresh replaces an expired token', () => {
  const student = { evaluation_token: 'old', evaluation_token_expires_at: new Date(NOW.getTime() - 1000) };
  const { token } = refreshEvaluationToken(student, { now: NOW, env: {} });
  assert.notEqual(token, 'old');
  assert.match(token, /^[0-9a-f]{64}$/);
});

test('refresh replaces a token with no expiry date', () => {
  const { token } = refreshEvaluationToken({ evaluation_token: 'legacy' }, { now: NOW, env: {} });
  assert.notEqual(token, 'legacy');
});

// Re-sending must not break a link the student already has, only extend it.
test('refresh keeps a valid token and extends its expiry', () => {
  const student = { evaluation_token: 'current', evaluation_token_expires_at: new Date(NOW.getTime() + DAY_MS) };
  const { token, expiresAt } = refreshEvaluationToken(student, { now: NOW, env: { EVALUATION_TOKEN_TTL_DAYS: '7' } });
  assert.equal(token, 'current');
  assert.equal(expiresAt.getTime(), NOW.getTime() + 7 * DAY_MS);
});
