const test = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Professor = require('../models/Professor');
const emailUtils = require('../utils/emailUtils');

const SECRET = 'auth-controller-test-secret-at-least-32-characters';
const originalSecret = process.env.JWT_SECRET;
process.env.JWT_SECRET = SECRET;
// The controller captures this function when it is required.
const sendEmail = test.mock.method(emailUtils, 'sendPasswordResetEmail', async () => {});
const log = test.mock.method(console, 'log', () => {});
const warn = test.mock.method(console, 'warn', () => {});
const controller = require('../controllers/authController');
test.after(() => {
  sendEmail.mock.restore();
  log.mock.restore();
  warn.mock.restore();
  if (originalSecret === undefined) delete process.env.JWT_SECRET;
  else process.env.JWT_SECRET = originalSecret;
});
test.beforeEach(() => sendEmail.mock.resetCalls());

const fields = { email: 'professor@example.com', password: 'test-password', name: 'Test Professor', department: 'Computing' };
const resetMessage = { message: 'If the email is registered, a reset link will be sent.' };

async function call(action, body) {
  const res = {
    statusCode: undefined,
    body: undefined,
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return this; }
  };
  const errors = [];
  await controller[action]({ body }, res, (err) => errors.push(err));
  return { res, errors };
}

function error(result, status, code) {
  assert.equal(result.errors.length, 1);
  assert.equal(result.errors[0].status, status);
  assert.equal(result.errors[0].code, code);
  assert.equal(result.res.statusCode, undefined);
  assert.equal(result.res.body, undefined);
}

function success(result, status, body) {
  assert.deepEqual(result.errors, []);
  assert.equal(result.res.statusCode, status);
  if (body !== undefined) assert.deepEqual(result.res.body, body);
}

function stubSave(t) {
  return t.mock.method(Professor.prototype, 'save', async function () {
    await this.validate();
    return this;
  });
}

for (const [action, required] of [
  ['login', ['email', 'password']],
  ['register', Object.keys(fields)],
  ['resetPassword', ['email']],
  ['updatePassword', ['token', 'password']]
]) {
  for (const field of required) {
    test(`${action}: missing ${field} returns 400`, async (t) => {
      const find = t.mock.method(Professor, 'findOne', async () => null);
      const body = { ...fields, token: 'reset-token' };
      delete body[field];
      error(await call(action, body), 400, 'VALIDATION_ERROR');
      assert.equal(find.mock.callCount(), 0);
      assert.equal(sendEmail.mock.callCount(), 0);
    });
  }
}

test('login: unknown email returns 401', async (t) => {
  const find = t.mock.method(Professor, 'findOne', async () => null);
  error(await call('login', fields), 401, 'AUTH_ERROR');
  assert.deepEqual(find.mock.calls[0].arguments, [{ email: fields.email }]);
});

test('login: wrong password returns 401', async (t) => {
  const professor = new Professor({ ...fields, password: await bcrypt.hash(fields.password, 4) });
  t.mock.method(Professor, 'findOne', async () => professor);
  const save = stubSave(t);
  error(await call('login', { ...fields, password: 'wrong-password' }), 401, 'AUTH_ERROR');
  assert.equal(save.mock.callCount(), 0);
});

test('login: returns a signed access token containing the professor id', async (t) => {
  const professor = new Professor({ ...fields, password: await bcrypt.hash(fields.password, 4) });
  t.mock.method(Professor, 'findOne', async () => professor);
  const save = stubSave(t);
  const result = await call('login', fields);
  success(result, 200);
  const payload = jwt.verify(result.res.body.access_token, SECRET);
  assert.equal(payload.id, professor.id);
  assert.equal(payload.email, fields.email);
  assert.equal(payload.exp - payload.iat, 3600);
  assert.equal(result.res.body.professor.id, professor._id);
  assert.equal(result.res.body.professor.password, undefined);
  assert.ok(professor.last_login instanceof Date);
  assert.equal(save.mock.callCount(), 1);
});

test('login: MFA enabled requires verification', async (t) => {
  const professor = new Professor({ ...fields, password: await bcrypt.hash(fields.password, 4), mfa_enabled: true });
  t.mock.method(Professor, 'findOne', async () => professor);
  const save = stubSave(t);
  success(await call('login', fields), 200, { mfa_required: true, professor_id: professor._id });
  assert.equal(save.mock.callCount(), 0);
});

test('register: existing email returns 409', async (t) => {
  t.mock.method(Professor, 'findOne', async () => new Professor(fields));
  const save = stubSave(t);
  error(await call('register', fields), 409, 'DUPLICATE');
  assert.equal(save.mock.callCount(), 0);
});

test('register: saves a bcrypt hash and returns 201', async (t) => {
  const find = t.mock.method(Professor, 'findOne', async () => null);
  const save = stubSave(t);
  const result = await call('register', fields);
  assert.equal(save.mock.callCount(), 1);
  const saved = save.mock.calls[0].this;
  success(result, 201, { message: 'Registration successful.', professor_id: saved._id });
  assert.deepEqual(find.mock.calls[0].arguments, [{ email: fields.email }]);
  assert.notEqual(saved.password, fields.password);
  assert.match(saved.password, /^\$2[aby]\$/);
  assert.ok(await bcrypt.compare(fields.password, saved.password));
});

test('resetPassword: unknown email returns the generic message without sending email', async (t) => {
  t.mock.method(Professor, 'findOne', async () => null);
  const save = stubSave(t);
  success(await call('resetPassword', { email: fields.email }), 200, resetMessage);
  assert.equal(save.mock.callCount(), 0);
  assert.equal(sendEmail.mock.callCount(), 0);
});

test('resetPassword: saves a one-hour token and emails it once', async (t) => {
  const professor = new Professor(fields);
  const find = t.mock.method(Professor, 'findOne', async () => professor);
  const save = stubSave(t);
  const before = Date.now();
  success(await call('resetPassword', { email: fields.email }), 200, resetMessage);
  const after = Date.now();
  assert.deepEqual(find.mock.calls[0].arguments, [{ email: fields.email }]);
  assert.equal(save.mock.callCount(), 1);
  assert.match(professor.securityToken, /^[a-f0-9]{64}$/);
  assert.ok(+professor.securityTokenExpires >= before + 3600000);
  assert.ok(+professor.securityTokenExpires <= after + 3600000);
  assert.equal(sendEmail.mock.callCount(), 1);
  assert.deepEqual(sendEmail.mock.calls[0].arguments, [fields.email, professor.securityToken, process.env.FRONTEND_URL]);
});

for (const state of ['unknown', 'expired']) {
  test(`updatePassword: ${state} token returns 400`, async (t) => {
    const professor = state === 'unknown' ? null : new Professor({
      ...fields, securityToken: 'reset-token', securityTokenExpires: new Date(Date.now() - 1000)
    });
    const find = t.mock.method(Professor, 'findOne', async () => professor);
    const save = stubSave(t);
    error(await call('updatePassword', { token: 'reset-token', password: 'new-password' }), 400, 'TOKEN_ERROR');
    assert.deepEqual(find.mock.calls[0].arguments, [{ securityToken: 'reset-token' }]);
    assert.equal(save.mock.callCount(), 0);
  });
}

test('updatePassword: hashes the new password and clears reset credentials', async (t) => {
  const professor = new Professor({ ...fields, securityToken: 'reset-token', securityTokenExpires: new Date(Date.now() + 3600000) });
  t.mock.method(Professor, 'findOne', async () => professor);
  const save = stubSave(t);
  success(await call('updatePassword', { token: 'reset-token', password: 'new-password' }), 200, { message: 'Password updated successfully.' });
  assert.equal(save.mock.callCount(), 1);
  assert.notEqual(professor.password, 'new-password');
  assert.match(professor.password, /^\$2[aby]\$/);
  assert.ok(await bcrypt.compare('new-password', professor.password));
  assert.equal(professor.securityToken, undefined);
  assert.equal(professor.securityTokenExpires, undefined);
});

for (const action of ['refreshToken', 'verifyMfa']) {
  test(`${action}: returns 501 NOT_IMPLEMENTED`, async () => {
    error(await call(action, {}), 501, 'NOT_IMPLEMENTED');
  });
}
