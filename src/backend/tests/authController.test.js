const test = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Professor = require('../models/Professor');
const emailUtils = require('../utils/emailUtils');
const { createVerificationToken, hashVerificationToken } = require('../utils/emailVerification');

const SECRET = 'auth-controller-test-secret-at-least-32-characters';
const originalSecret = process.env.JWT_SECRET;
process.env.JWT_SECRET = SECRET;
// Registration is limited to these domains (CW-11); the test addresses use example.com.
const originalDomains = process.env.ALLOWED_EMAIL_DOMAINS;
process.env.ALLOWED_EMAIL_DOMAINS = 'example.com';
// The controller captures these functions when it is required.
const sendEmail = test.mock.method(emailUtils, 'sendPasswordResetEmail', async () => {});
const sendConfirmation = test.mock.method(emailUtils, 'sendVerificationEmail', async () => ({ success: true }));
const log = test.mock.method(console, 'log', () => {});
const warn = test.mock.method(console, 'warn', () => {});
const controller = require('../controllers/authController');
test.after(() => {
  sendEmail.mock.restore();
  sendConfirmation.mock.restore();
  log.mock.restore();
  warn.mock.restore();
  if (originalSecret === undefined) delete process.env.JWT_SECRET;
  else process.env.JWT_SECRET = originalSecret;
  if (originalDomains === undefined) delete process.env.ALLOWED_EMAIL_DOMAINS;
  else process.env.ALLOWED_EMAIL_DOMAINS = originalDomains;
});
test.beforeEach(() => {
  sendEmail.mock.resetCalls();
  sendConfirmation.mock.resetCalls();
  sendConfirmation.mock.mockImplementation(async () => ({ success: true }));
});

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
  ['register', ['email', 'name', 'department']],
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

test('TC-04-11: login: returns a signed access token containing the professor id, valid for the 60-minute idle period (FR-04)', async (t) => {
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

// ---- CW-11: registration limited to instructors, password chosen only after the mailbox is proven ----
// Codex review (13 Oct): a password set at registration would let whoever registers an address first
// choose the password of the person who owns it. Registration therefore takes no password; the emailed
// link leads to choosing one.
const MIN = 60 * 1000;

test('TC-01-49: register: an address outside the allowed domains is refused before any lookup, save or email', async (t) => {
  const find = t.mock.method(Professor, 'findOne', async () => null);
  const save = stubSave(t);
  error(await call('register', { ...fields, email: 'someone@gmail.com' }), 403, 'EMAIL_NOT_ALLOWED');
  assert.equal(find.mock.callCount(), 0);
  assert.equal(save.mock.callCount(), 0);
  assert.equal(sendConfirmation.mock.callCount(), 0);
});

test('TC-01-50: register: the refusal names the allowed domains so the person knows what to use', async (t) => {
  t.mock.method(Professor, 'findOne', async () => null);
  const result = await call('register', { ...fields, email: 'someone@gmail.com' });
  assert.match(result.errors[0].message, /example\.com/);
});

// The database calls a registration makes, recorded. Codex review, second pass (13 Oct): every state change is
// one conditional database operation, so two requests at the same moment cannot undo each other.
function mockRegistrationDb(t, { existing = null, claim = undefined, createError = null } = {}) {
  const calls = { create: [], claim: [], update: [] };
  t.mock.method(Professor, 'findOne', async () => existing);
  t.mock.method(Professor, 'create', async (doc) => {
    if (createError) throw createError;
    calls.create.push(doc);
    return new Professor(doc);
  });
  t.mock.method(Professor, 'findOneAndUpdate', async (filter, update, options) => {
    calls.claim.push({ filter, update, options });
    return claim === undefined ? existing : claim;
  });
  t.mock.method(Professor, 'updateOne', async (filter, update) => {
    calls.update.push({ filter, update });
    return { modifiedCount: 1 };
  });
  return calls;
}

test('TC-01-51: register: a new account is created pending and with no password, the token is emailed once, and only its hash is published', async (t) => {
  const calls = mockRegistrationDb(t);
  const before = Date.now();
  const result = await call('register', fields);
  success(result, 201);
  assert.equal(calls.create.length, 1);
  const created = calls.create[0];
  assert.equal(created.email_verified, false);
  assert.equal(created.password, undefined, 'a password sent with the registration is not kept');
  assert.ok(created.email_verification_sent_at.getTime() >= before, 'the send slot is taken before the email goes out');
  assert.equal(created.email_verification_token_hash, undefined, 'no link exists until it has been sent');
  assert.equal(sendConfirmation.mock.callCount(), 1);
  const [to, token] = sendConfirmation.mock.calls[0].arguments;
  assert.equal(to, fields.email);
  assert.match(token, /^[0-9a-f]{64}$/);
  assert.equal(calls.update.length, 1);
  const { filter, update } = calls.update[0];
  assert.equal(filter.email_verified, false, 'published only while the account is still pending');
  assert.equal(filter.email_verification_sent_at.getTime(), created.email_verification_sent_at.getTime(), 'and only by the request that took the slot');
  assert.equal(update.$set.email_verification_token_hash, hashVerificationToken(token));
  assert.notEqual(update.$set.email_verification_token_hash, token, 'the plain token is never stored');
  const lifetime = update.$set.email_verification_expires.getTime() - before;
  assert.ok(lifetime > 47.9 * 3600 * 1000 && lifetime < 48.1 * 3600 * 1000, 'expires in about 48 hours');
  assert.equal(result.res.body.verification_email_sent, true);
  assert.ok(result.res.body.professor_id);
  assert.match(result.res.body.message, /password/i, 'tells the person the password is chosen from the link');
});

test('TC-01-52: register: if the email cannot be sent the account stays, holds no link, and a new try is allowed at once', async (t) => {
  const calls = mockRegistrationDb(t);
  sendConfirmation.mock.mockImplementation(async () => ({ success: false, error: 'SMTP down' }));
  const result = await call('register', fields);
  success(result, 201);
  assert.equal(calls.update.length, 1);
  assert.equal(calls.update[0].update.$set, undefined, 'no link published');
  assert.ok('email_verification_sent_at' in calls.update[0].update.$unset, 'the send slot is given back');
  assert.equal(calls.update[0].filter.email_verification_sent_at.getTime(), calls.create[0].email_verification_sent_at.getTime(), 'but only by the request that took it');
  assert.equal(result.res.body.verification_email_sent, false);
});

function pendingProfessor(overrides = {}) {
  const { token, hash, expiresAt } = createVerificationToken();
  const professor = new Professor({
    email: fields.email,
    name: 'First Name',
    department: 'Computing',
    email_verified: false,
    email_verification_token_hash: hash,
    email_verification_expires: expiresAt,
    email_verification_sent_at: new Date(Date.now() - 16 * MIN),
    ...overrides,
  });
  return { token, hash, professor };
}

test('TC-01-53: register: an unconfirmed address registered again after the wait takes the send slot, gets a new link, and nothing else changes', async (t) => {
  const { hash: oldHash, professor } = pendingProfessor();
  const calls = mockRegistrationDb(t, { existing: professor });
  const result = await call('register', { ...fields, name: 'Someone Else', department: 'Elsewhere' });
  success(result, 201);
  assert.equal(calls.create.length, 0);
  assert.equal(calls.claim.length, 1);
  const { filter, update } = calls.claim[0];
  assert.equal(filter._id, professor._id);
  assert.equal(filter.email_verified, false, 'only while pending');
  assert.ok(JSON.stringify(filter).includes('email_verification_sent_at'), 'only if the wait is over');
  assert.ok(update.$set.email_verification_sent_at instanceof Date);
  assert.equal(sendConfirmation.mock.callCount(), 1);
  const [, token] = sendConfirmation.mock.calls[0].arguments;
  assert.equal(calls.update.length, 1);
  assert.equal(calls.update[0].filter.email_verified, false);
  assert.equal(calls.update[0].filter.email_verification_sent_at, update.$set.email_verification_sent_at, 'only by the request that took the slot');
  assert.equal(calls.update[0].update.$set.email_verification_token_hash, hashVerificationToken(token));
  assert.notEqual(calls.update[0].update.$set.email_verification_token_hash, oldHash);
  assert.equal(calls.update[0].update.$set.password, undefined);
  assert.equal(calls.update[0].update.$set.name, undefined);
  assert.equal(result.res.body.professor_id, undefined, 'the id of a pending account is not given out');
});

test('TC-01-66: register: registering an unconfirmed address again within the wait changes nothing and sends nothing', async (t) => {
  const { professor } = pendingProfessor({ email_verification_sent_at: new Date(Date.now() - 1 * MIN) });
  const calls = mockRegistrationDb(t, { existing: professor });
  const result = await call('register', fields);
  success(result, 201);
  assert.equal(calls.claim.length + calls.update.length + calls.create.length, 0);
  assert.equal(sendConfirmation.mock.callCount(), 0);
  assert.match(result.res.body.message, /recently/i);
});

test('TC-01-67: register: if the new link cannot be sent, the send slot is given back and the link already in the mailbox stays valid', async (t) => {
  const { professor } = pendingProfessor();
  const calls = mockRegistrationDb(t, { existing: professor });
  sendConfirmation.mock.mockImplementation(async () => ({ success: false, error: 'SMTP down' }));
  const result = await call('register', fields);
  success(result, 201);
  assert.equal(calls.update.length, 1);
  assert.equal(calls.update[0].update.$set.email_verification_token_hash, undefined, 'the old link was not replaced');
  assert.deepEqual(calls.update[0].update.$set, { email_verification_sent_at: professor.email_verification_sent_at });
  assert.equal(calls.update[0].filter.email_verification_sent_at, calls.claim[0].update.$set.email_verification_sent_at, 'given back only by the request that took it');
  assert.equal(result.res.body.verification_email_sent, false);
});

test('TC-01-68: register: an unconfirmed address whose link was never delivered (no sent time) can be sent a link at once', async (t) => {
  const { professor } = pendingProfessor({
    email_verification_token_hash: undefined,
    email_verification_expires: undefined,
    email_verification_sent_at: undefined,
  });
  const calls = mockRegistrationDb(t, { existing: professor });
  success(await call('register', fields), 201);
  assert.equal(sendConfirmation.mock.callCount(), 1);
  assert.ok(calls.update[0].update.$set.email_verification_token_hash);
});

test('TC-01-70: register: if another request took the send slot first, nothing is sent (two requests at once send one email)', async (t) => {
  const { professor } = pendingProfessor();
  const calls = mockRegistrationDb(t, { existing: professor, claim: null });
  const result = await call('register', fields);
  success(result, 201);
  assert.equal(sendConfirmation.mock.callCount(), 0);
  assert.equal(calls.update.length, 0);
  assert.match(result.res.body.message, /recently/i);
});

test('TC-01-71: register: if another request created the account first (duplicate key), nothing is sent', async (t) => {
  const calls = mockRegistrationDb(t, { createError: Object.assign(new Error('E11000 duplicate key'), { code: 11000 }) });
  const result = await call('register', fields);
  success(result, 201);
  assert.equal(sendConfirmation.mock.callCount(), 0);
  assert.equal(calls.update.length, 0);
  assert.match(result.res.body.message, /recently/i);
});

test('TC-01-72: register: an unexpected database error is not swallowed', async (t) => {
  mockRegistrationDb(t, { createError: new Error('disk on fire') });
  error(await call('register', fields), 500, 'SERVER_ERROR');
  assert.equal(sendConfirmation.mock.callCount(), 0);
});

test('TC-01-54: register: a confirmed account with the same email still gets 409 and no email', async (t) => {
  t.mock.method(Professor, 'findOne', async () => new Professor({ ...fields, email_verified: true }));
  const save = stubSave(t);
  error(await call('register', fields), 409, 'DUPLICATE');
  assert.equal(save.mock.callCount(), 0);
  assert.equal(sendConfirmation.mock.callCount(), 0);
});

test('TC-01-55: login: an unconfirmed account gets 403 whatever password is sent, because it has none yet', async (t) => {
  const { professor } = pendingProfessor();
  t.mock.method(Professor, 'findOne', async () => professor);
  const save = stubSave(t);
  error(await call('login', fields), 403, 'EMAIL_NOT_VERIFIED');
  error(await call('login', { ...fields, password: 'anything-at-all' }), 403, 'EMAIL_NOT_VERIFIED');
  assert.equal(save.mock.callCount(), 0);
});

test('TC-01-57: login: an account created before confirmation existed has no flag and can still log in', async (t) => {
  const professor = new Professor({ ...fields, password: await bcrypt.hash(fields.password, 4) });
  assert.equal(professor.email_verified, true, 'the schema default');
  t.mock.method(Professor, 'findOne', async () => professor);
  stubSave(t);
  success(await call('login', fields), 200);
});

test('TC-01-58: verifyEmail: a valid link and a chosen password confirm the account in one conditional update, keeping only the password hash', async (t) => {
  const { token, professor } = pendingProfessor();
  const find = t.mock.method(Professor, 'findOne', async () => professor);
  const update = t.mock.method(Professor, 'findOneAndUpdate', async () => professor);
  success(await call('verifyEmail', { token, password: 'my-chosen-password' }), 200);
  assert.deepEqual(find.mock.calls[0].arguments[0].email_verification_token_hash, hashVerificationToken(token));
  assert.equal(update.mock.callCount(), 1);
  const [filter, change] = update.mock.calls[0].arguments;
  assert.equal(filter.email_verification_token_hash, hashVerificationToken(token));
  assert.equal(filter.email_verified, false, 'only a pending account can be confirmed');
  assert.ok(filter.email_verification_expires.$gt instanceof Date, 'only while the link has not expired');
  assert.equal(change.$set.email_verified, true);
  assert.notEqual(change.$set.password, 'my-chosen-password');
  assert.match(change.$set.password, /^\$2[aby]\$/);
  assert.ok(await bcrypt.compare('my-chosen-password', change.$set.password));
  for (const field of ['email_verification_token_hash', 'email_verification_expires', 'email_verification_sent_at']) {
    assert.ok(field in change.$unset, field + ' is cleared in the same update');
  }
});

test('TC-01-59: verifyEmail: an unknown or expired link is refused and changes nothing', async (t) => {
  const update = t.mock.method(Professor, 'findOneAndUpdate', async () => { throw new Error('must not be updated'); });
  t.mock.method(Professor, 'findOne', async () => null);
  error(await call('verifyEmail', { token: 'f'.repeat(64), password: 'my-chosen-password' }), 400, 'TOKEN_ERROR');

  const { token, professor } = pendingProfessor({ email_verification_expires: new Date(Date.now() - 1000) });
  Professor.findOne.mock.mockImplementation(async () => professor);
  error(await call('verifyEmail', { token, password: 'my-chosen-password' }), 400, 'TOKEN_ERROR');
  assert.equal(update.mock.callCount(), 0);
});

test('TC-01-73: verifyEmail: if another request used the link between the lookup and the update, this one is refused (one link, one use)', async (t) => {
  const { token, professor } = pendingProfessor();
  t.mock.method(Professor, 'findOne', async () => professor);
  t.mock.method(Professor, 'findOneAndUpdate', async () => null);
  error(await call('verifyEmail', { token, password: 'my-chosen-password' }), 400, 'TOKEN_ERROR');
});

test('TC-01-60: verifyEmail: a missing or non-text token or password is a 400 before any lookup, so the link is not used up', async (t) => {
  const find = t.mock.method(Professor, 'findOne', async () => { throw new Error('must not be queried'); });
  for (const body of [
    {},
    { token: 'a'.repeat(64) },
    { password: 'my-chosen-password' },
    { token: 'a'.repeat(64), password: '' },
    { token: { $ne: null }, password: 'my-chosen-password' },
    { token: 12345, password: 'my-chosen-password' },
    { token: 'a'.repeat(64), password: { $ne: null } },
    { token: 'a'.repeat(64), password: 12345678 },
  ]) {
    error(await call('verifyEmail', body), 400, 'VALIDATION_ERROR');
  }
  assert.equal(find.mock.callCount(), 0);
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

test('verifyMfa: returns 501 NOT_IMPLEMENTED', async () => {
  error(await call('verifyMfa', {}), 501, 'NOT_IMPLEMENTED');
});

// FR-04: the keep-alive the browser calls while the professor is active. The middleware has already
// checked the token and puts a fresh one in X-Access-Token; the handler only has to answer.
test('TC-04-29: refreshToken: answers 200 with the idle period, so the browser knows the session was extended', async () => {
  const result = await call('refreshToken', {});
  success(result, 200);
  assert.equal(result.res.body.expires_in_seconds, 60 * 60);
  assert.match(result.res.body.message, /extended/i);
});
