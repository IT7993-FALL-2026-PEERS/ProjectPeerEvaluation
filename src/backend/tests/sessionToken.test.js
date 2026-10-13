const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');

const SECRET = 'session-token-test-secret-at-least-32-characters';
const originalSecret = process.env.JWT_SECRET;
process.env.JWT_SECRET = SECRET;
const {
  getSessionSettings,
  signSessionToken,
  renewSessionToken,
  isPastTotalLimit,
} = require('../utils/sessionToken');
test.after(() => {
  if (originalSecret === undefined) delete process.env.JWT_SECRET;
  else process.env.JWT_SECRET = originalSecret;
});

// FR-04: a professor's session ends after a period of inactivity, not a fixed time after login.
// The token's own expiry is the inactivity limit, and each request that is more than a minute
// after the last renewal hands back a fresh token, so activity pushes the expiry forward.
const MIN = 60 * 1000;
const T0 = Date.UTC(2026, 9, 12, 14, 0, 0);
const claims = { id: 'prof-1', email: 'ada@example.edu', name: 'Ada' };
const verifyAt = (token, ms) => jwt.verify(token, SECRET, { clockTimestamp: Math.floor(ms / 1000) });

test('TC-04-12: the idle limit is 60 minutes and the total limit 8 hours unless the environment says otherwise', () => {
  assert.deepEqual(getSessionSettings({}), { idleSeconds: 60 * 60, maxSeconds: 8 * 60 * 60 });
  assert.deepEqual(
    getSessionSettings({ SESSION_IDLE_MINUTES: '30', SESSION_MAX_HOURS: '2' }),
    { idleSeconds: 30 * 60, maxSeconds: 2 * 60 * 60 }
  );
});

test('TC-04-13: a missing, zero, negative or unreadable setting falls back to the default', () => {
  for (const bad of ['', '0', '-5', 'abc', 'NaN', 'Infinity']) {
    assert.deepEqual(
      getSessionSettings({ SESSION_IDLE_MINUTES: bad, SESSION_MAX_HOURS: bad }),
      { idleSeconds: 60 * 60, maxSeconds: 8 * 60 * 60 },
      `value ${JSON.stringify(bad)}`
    );
  }
});

test('TC-04-14: a login token carries the professor, expires after the idle limit and records the login time', () => {
  const token = signSessionToken(claims, { now: T0 });
  const payload = verifyAt(token, T0);
  assert.equal(payload.id, 'prof-1');
  assert.equal(payload.email, 'ada@example.edu');
  assert.equal(payload.name, 'Ada');
  assert.equal(payload.auth_at, T0 / 1000);
  assert.equal(payload.exp, T0 / 1000 + 60 * 60);
  assert.throws(() => verifyAt(token, T0 + 61 * MIN), /expired/);
});

test('TC-04-15: no new token is issued for a request within a minute of the last one', () => {
  const payload = verifyAt(signSessionToken(claims, { now: T0 }), T0);
  assert.equal(renewSessionToken(payload, { now: T0 }), null);
  assert.equal(renewSessionToken(payload, { now: T0 + 59 * 1000 }), null);
});

test('TC-04-16: a request a minute or more after the last token gets a fresh one, valid for a full idle period', () => {
  const payload = verifyAt(signSessionToken(claims, { now: T0 }), T0);
  const fresh = renewSessionToken(payload, { now: T0 + 5 * MIN });
  assert.ok(fresh, 'a renewed token');
  const renewed = verifyAt(fresh, T0 + 5 * MIN);
  assert.equal(renewed.id, 'prof-1');
  assert.equal(renewed.email, 'ada@example.edu');
  assert.equal(renewed.exp, (T0 + 5 * MIN) / 1000 + 60 * 60);
  assert.equal(renewed.auth_at, T0 / 1000, 'the original login time is kept');
});

test('TC-04-17: someone who keeps working stays logged in past the first hour', () => {
  let token = signSessionToken(claims, { now: T0 });
  // One request every 20 minutes for three hours; each answer's token is used for the next request.
  for (let minute = 20; minute <= 180; minute += 20) {
    const now = T0 + minute * MIN;
    const payload = verifyAt(token, now);
    const fresh = renewSessionToken(payload, { now });
    if (fresh) token = fresh;
  }
  assert.doesNotThrow(() => verifyAt(token, T0 + 180 * MIN), 'still logged in after 3 hours of use');
});

test('TC-04-18: someone who stops for more than an hour is logged out, even if they were active before', () => {
  const first = verifyAt(signSessionToken(claims, { now: T0 }), T0);
  const lastToken = renewSessionToken(first, { now: T0 + 50 * MIN });
  assert.doesNotThrow(() => verifyAt(lastToken, T0 + 50 * MIN + 59 * MIN), 'still valid 59 minutes after the last request');
  assert.throws(() => verifyAt(lastToken, T0 + 50 * MIN + 61 * MIN), /expired/);
});

test('TC-04-19: a session cannot be kept alive past the total limit', () => {
  const payload = verifyAt(signSessionToken(claims, { now: T0 }), T0);
  const lateButInside = T0 + 7 * 60 * MIN;
  const stillInside = { ...payload, iat: lateButInside / 1000 - 120, exp: lateButInside / 1000 + 3480 };
  assert.ok(renewSessionToken(stillInside, { now: lateButInside }), 'renewed inside the 8 hours');
  const afterLimit = T0 + 8 * 60 * MIN + 1000;
  const stale = { ...payload, iat: afterLimit / 1000 - 120, exp: afterLimit / 1000 + 3480 };
  assert.equal(renewSessionToken(stale, { now: afterLimit }), null, 'not renewed after 8 hours since login');
});

test('TC-04-28: the total limit is exact: renewed one second before 8 hours, not at 8 hours', () => {
  const payload = verifyAt(signSessionToken(claims, { now: T0 }), T0);
  const at = (ms) => ({ ...payload, iat: ms / 1000 - 120, exp: ms / 1000 + 3480 });
  const limit = T0 + 8 * 60 * MIN;
  assert.ok(renewSessionToken(at(limit - 1000), { now: limit - 1000 }), 'one second before the limit');
  assert.equal(renewSessionToken(at(limit), { now: limit }), null, 'exactly at the limit');
});

// Codex review, 13 Oct: stopping renewal at the cap is not enough. A token renewed at 7h54m used to be
// valid until 8h54m, so the cap was really 8 hours plus one idle period.
test('TC-04-31: a token renewed near the total limit expires at the limit, not an idle period later', () => {
  const payload = verifyAt(signSessionToken(claims, { now: T0 }), T0);
  const now = T0 + (7 * 60 + 54) * MIN;
  const nearLimit = { ...payload, iat: now / 1000 - 120, exp: now / 1000 + 3480 };
  const fresh = renewSessionToken(nearLimit, { now });
  assert.ok(fresh, 'renewed: the limit has not been reached');
  const renewed = verifyAt(fresh, now);
  assert.equal(renewed.exp, T0 / 1000 + 8 * 60 * 60, 'cut to the limit');
  assert.doesNotThrow(() => verifyAt(fresh, T0 + 8 * 60 * MIN - 1000));
  assert.throws(() => verifyAt(fresh, T0 + 8 * 60 * MIN + 1000), /expired/);
});

test('TC-04-32: a login token never outlives the total limit either, even when that limit is shorter than the idle period', () => {
  const token = signSessionToken(claims, { now: T0, env: { SESSION_IDLE_MINUTES: '60', SESSION_MAX_HOURS: '0.5' } });
  assert.equal(verifyAt(token, T0).exp, T0 / 1000 + 30 * 60);
});

test('TC-04-33: isPastTotalLimit: true from exactly the limit after login; a token without a login time counts from when it was issued', () => {
  const at = (ms) => ({ auth_at: T0 / 1000, iat: ms / 1000 - 60, exp: ms / 1000 + 3000 });
  const limit = T0 + 8 * 60 * MIN;
  assert.equal(isPastTotalLimit(at(limit - 1000), { now: limit - 1000 }), false);
  assert.equal(isPastTotalLimit(at(limit), { now: limit }), true);
  assert.equal(isPastTotalLimit({ iat: T0 / 1000, exp: T0 / 1000 + 3600 }, { now: T0 + 30 * MIN }), false);
  assert.equal(isPastTotalLimit({ iat: T0 / 1000, exp: T0 / 1000 + 3600 }, { now: T0 + 9 * 60 * MIN }), true);
  assert.equal(isPastTotalLimit({}, { now: T0 }), false, 'nothing to measure from');
});

test('TC-04-20: a token issued before this change has no login time; its issue time stands in for it', () => {
  const old = jwt.sign(claims, SECRET, { expiresIn: '1h' });
  const payload = jwt.verify(old, SECRET);
  assert.equal(payload.auth_at, undefined);
  const later = payload.iat * 1000 + 10 * MIN;
  const fresh = renewSessionToken(payload, { now: later });
  assert.ok(fresh, 'renewed');
  assert.equal(verifyAt(fresh, later).auth_at, payload.iat);
});

test('TC-04-21: the renewed token does not copy the old issue and expiry times', () => {
  const payload = verifyAt(signSessionToken(claims, { now: T0 }), T0);
  const now = T0 + 10 * MIN;
  const renewed = verifyAt(renewSessionToken(payload, { now }), now);
  assert.equal(renewed.iat, now / 1000);
  assert.equal(renewed.exp, now / 1000 + 60 * 60);
});

test('TC-04-22: the idle limit is read from the environment when a token is signed', () => {
  const token = signSessionToken(claims, { now: T0, env: { SESSION_IDLE_MINUTES: '30' } });
  assert.equal(verifyAt(token, T0).exp, T0 / 1000 + 30 * 60);
});
