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

test('authenticateToken: expired token returns 401', () => {
  unauthorized('Bearer ' + jwt.sign({ id: 'professor', exp: 1 }, SECRET));
});

test('authenticateToken: valid token sets req.user and calls next without an error', () => {
  const token = jwt.sign({ id: 'professor', email: 'professor@example.com' }, SECRET, { expiresIn: '1h' });
  const { req, calls } = authenticate('Bearer ' + token);
  assert.deepEqual(calls, [[]]);
  assert.deepEqual(req.user, jwt.verify(token, SECRET));
});
