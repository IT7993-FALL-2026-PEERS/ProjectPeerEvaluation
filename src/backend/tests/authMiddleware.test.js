const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');

const SECRET = 'auth-middleware-test-secret-at-least-32-characters';
const originalSecret = process.env.JWT_SECRET;
process.env.JWT_SECRET = SECRET;
const { authenticateToken } = require('../middleware/auth');
test.after(() => {
  if (originalSecret === undefined) delete process.env.JWT_SECRET;
  else process.env.JWT_SECRET = originalSecret;
});

function authenticate(authorization) {
  const req = { headers: authorization === undefined ? {} : { authorization } };
  const calls = [];
  authenticateToken(req, {}, (...args) => calls.push(args));
  return { req, calls };
}

function unauthorized(authorization) {
  const { req, calls } = authenticate(authorization);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].length, 1);
  assert.equal(calls[0][0].status, 401);
  assert.equal(calls[0][0].code, 'UNAUTHORIZED');
  assert.equal(req.user, undefined);
}

test('authenticateToken: missing Authorization header returns 401', () => {
  unauthorized(undefined);
});

test('authenticateToken: Bearer without a token returns 401', () => {
  unauthorized('Bearer');
});

test('authenticateToken: wrong signing secret returns 401', () => {
  unauthorized('Bearer ' + jwt.sign({ id: 'professor' }, 'wrong-secret'));
});

test('TC-04-10: authenticateToken: an expired token returns 401', () => {
  unauthorized('Bearer ' + jwt.sign({ id: 'professor', exp: 1 }, SECRET));
});

test('authenticateToken: valid token sets req.user and calls next without an error', () => {
  const token = jwt.sign({ id: 'professor', email: 'professor@example.com' }, SECRET, { expiresIn: '1h' });
  const { req, calls } = authenticate('Bearer ' + token);
  assert.deepEqual(calls, [[]]);
  assert.deepEqual(req.user, jwt.verify(token, SECRET));
});

// FR-04: the session ends after a period of inactivity, so a request that comes a while after the
// last token was issued is answered with a fresh one in the X-Access-Token header.
function authenticateWithResponse(token) {
  const headers = {};
  const res = { setHeader: (name, value) => { headers[name] = value; } };
  const calls = [];
  authenticateToken({ headers: { authorization: 'Bearer ' + token } }, res, (...args) => calls.push(args));
  return { headers, calls };
}

const issuedMinutesAgo = (minutes) => {
  const iat = Math.floor(Date.now() / 1000) - minutes * 60;
  return jwt.sign({ id: 'professor', email: 'professor@example.com', iat }, SECRET, { expiresIn: '1h' });
};

test('TC-04-23: a request with a token more than a minute old gets a fresh token in X-Access-Token', () => {
  const { headers, calls } = authenticateWithResponse(issuedMinutesAgo(10));
  assert.deepEqual(calls, [[]]);
  assert.ok(headers['X-Access-Token'], 'a header with the new token');
  const fresh = jwt.verify(headers['X-Access-Token'], SECRET);
  assert.equal(fresh.id, 'professor');
  assert.ok(fresh.exp - Math.floor(Date.now() / 1000) > 59 * 60, 'valid for a new full idle period');
});

test('TC-04-24: a request right after login gets no new token', () => {
  const { headers, calls } = authenticateWithResponse(issuedMinutesAgo(0));
  assert.deepEqual(calls, [[]]);
  assert.equal(headers['X-Access-Token'], undefined);
});

// Codex review, second pass (13 Oct): the browser compares the token's expiry with its own clock, which can
// be minutes off. Every authenticated answer carries the server's time so the browser can correct for that.
test('TC-04-36: every authenticated answer carries the server time in X-Server-Time (milliseconds)', () => {
  for (const minutesAgo of [0, 10]) {
    const before = Date.now();
    const { headers, calls } = authenticateWithResponse(issuedMinutesAgo(minutesAgo));
    assert.deepEqual(calls, [[]]);
    const serverTime = Number(headers['X-Server-Time']);
    assert.ok(Number.isInteger(serverTime));
    assert.ok(serverTime >= before && serverTime <= Date.now(), 'the current time');
  }
});

test('TC-04-37: a refused token gets no server time', () => {
  const headers = {};
  const res = { setHeader: (name, value) => { headers[name] = value; } };
  authenticateToken({ headers: { authorization: 'Bearer not-a-token' } }, res, () => {});
  assert.equal(headers['X-Server-Time'], undefined);
});

test('TC-04-34: a token whose login is more than 8 hours old is refused, even if its own expiry is still ahead', () => {
  const now = Math.floor(Date.now() / 1000);
  const token = jwt.sign({ id: 'professor', auth_at: now - 9 * 3600, iat: now - 600, exp: now + 3000 }, SECRET);
  const headers = {};
  const res = { setHeader: (name, value) => { headers[name] = value; } };
  const calls = [];
  authenticateToken({ headers: { authorization: 'Bearer ' + token } }, res, (...args) => calls.push(args));
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0].status, 401);
  assert.equal(calls[0][0].code, 'UNAUTHORIZED');
  assert.equal(headers['X-Access-Token'], undefined);
});

test('TC-04-25: an expired token is refused and no new token is offered', () => {
  const headers = {};
  const res = { setHeader: (name, value) => { headers[name] = value; } };
  const calls = [];
  authenticateToken({ headers: { authorization: 'Bearer ' + issuedMinutesAgo(61) } }, res, (...args) => calls.push(args));
  assert.equal(calls[0][0].status, 401);
  assert.equal(headers['X-Access-Token'], undefined);
});
