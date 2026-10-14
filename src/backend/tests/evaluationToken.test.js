const test = require('node:test');
const assert = require('node:assert/strict');
const {
  generateEvaluationToken,
  isLinkActive,
  isTokenExpired,
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

test('a token with a future expiry is not expired', () => {
  const student = { evaluation_token: 'a', evaluation_token_expires_at: new Date(NOW.getTime() + 1000) };
  assert.equal(isTokenExpired(student, NOW), false);
});

test('a token past its expiry is expired', () => {
  const student = { evaluation_token: 'a', evaluation_token_expires_at: new Date(NOW.getTime() - 1000) };
  assert.equal(isTokenExpired(student, NOW), true);
});

// Links sent before deadlines existed have no date. They are treated as expired, and
// the professor re-sends to issue a new one.
test('a token with no expiry date is expired', () => {
  assert.equal(isTokenExpired({ evaluation_token: 'a', evaluation_token_expires_at: null }, NOW), true);
  assert.equal(isTokenExpired({ evaluation_token: 'a' }, NOW), true);
});

// Fails closed: a value that isn't a real date never keeps a link alive.
test('a token with an unreadable expiry date is expired', () => {
  assert.equal(isTokenExpired({ evaluation_token: 'a', evaluation_token_expires_at: 'not a date' }, NOW), true);
});

test('TC-10-57: a link is active when it has a token and its deadline is still ahead', () => {
  assert.equal(isLinkActive({ evaluation_token: 'tok', evaluation_token_expires_at: new Date(NOW.getTime() + 1000) }, NOW), true);
});

test('TC-10-58: a link is not active with no token, a past or missing deadline, or an unreadable date', () => {
  const ahead = new Date(NOW.getTime() + DAY_MS);
  assert.equal(isLinkActive({ evaluation_token: null, evaluation_token_expires_at: ahead }, NOW), false);
  assert.equal(isLinkActive({ evaluation_token_expires_at: ahead }, NOW), false);
  assert.equal(isLinkActive({ evaluation_token: 'tok', evaluation_token_expires_at: new Date(NOW.getTime() - 1) }, NOW), false);
  assert.equal(isLinkActive({ evaluation_token: 'tok', evaluation_token_expires_at: NOW }, NOW), false, 'exactly at the deadline is over');
  assert.equal(isLinkActive({ evaluation_token: 'tok', evaluation_token_expires_at: null }, NOW), false);
  assert.equal(isLinkActive({ evaluation_token: 'tok', evaluation_token_expires_at: 'not a date' }, NOW), false);
});
