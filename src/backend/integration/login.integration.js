const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const Professor = require('../models/Professor');
const { startDatabase, stopDatabase, clearDatabase } = require('./helpers/db');
const { startApp } = require('./helpers/app');
const { seed, PASSWORDS } = require('./helpers/seed');

// FR-01 professor login, against a real MongoDB: the stored hash, the saved last_login and the
// unique email index are what the mocked unit tests cannot see.
let replSet;
let app;

test.before(async () => {
  replSet = await startDatabase();
  app = await startApp();
});
test.after(async () => {
  await app.close();
  await stopDatabase(replSet);
});
test.beforeEach(async (t) => {
  t.mock.method(console, 'log', () => {});
  t.mock.method(console, 'error', () => {});
  await clearDatabase();
  await seed();
});

test('TC-01-20: a seeded professor logs in and last_login is saved in the database', async () => {
  const res = await app.request('POST', '/api/auth/login', {
    body: { email: 'ada@example.edu', password: PASSWORDS.ada },
  });
  assert.equal(res.status, 200);
  assert.ok(res.body.access_token);
  assert.equal(res.body.professor.email, 'ada@example.edu');
  assert.equal(res.body.professor.password, undefined, 'the hash is never returned');

  const stored = await Professor.findOne({ email: 'ada@example.edu' });
  assert.ok(stored.last_login instanceof Date);
});

test('TC-01-21: a wrong password and an unknown email get the same 401', async () => {
  const wrong = await app.request('POST', '/api/auth/login', {
    body: { email: 'ada@example.edu', password: 'not-the-password' },
  });
  const unknown = await app.request('POST', '/api/auth/login', {
    body: { email: 'nobody@example.edu', password: PASSWORDS.ada },
  });
  assert.equal(wrong.status, 401);
  assert.equal(unknown.status, 401);
  assert.equal(wrong.body.error.message, unknown.body.error.message);
});

test('TC-01-22: a query operator in the email field is rejected, not matched against the database', async () => {
  const res = await app.request('POST', '/api/auth/login', {
    body: { email: { $ne: null }, password: PASSWORDS.ada },
  });
  assert.equal(res.status, 400);
});

test('TC-01-23: register stores a bcrypt hash, then the new professor can log in', async () => {
  const reg = await app.request('POST', '/api/auth/register', {
    body: { email: 'New@Example.edu', password: 'brand-new-password', name: 'New Prof', department: 'Math' },
  });
  assert.equal(reg.status, 201);

  const stored = await Professor.findById(reg.body.professor_id);
  assert.equal(stored.email, 'new@example.edu', 'the email is lower-cased on save');
  assert.match(stored.password, /^\$2[aby]\$/);
  assert.notEqual(stored.password, 'brand-new-password');

  const login = await app.request('POST', '/api/auth/login', {
    body: { email: 'new@example.edu', password: 'brand-new-password' },
  });
  assert.equal(login.status, 200);
});

test('TC-01-24: registering an existing email gets 409 and leaves one professor with that email', async () => {
  const res = await app.request('POST', '/api/auth/register', {
    body: { email: 'ada@example.edu', password: 'another-password', name: 'Other Ada', department: 'Math' },
  });
  assert.equal(res.status, 409);
  assert.equal(await Professor.countDocuments({ email: 'ada@example.edu' }), 1);
});

test('TC-01-25: the unique index on email rejects a duplicate that skips the controller check', async () => {
  await assert.rejects(
    Professor.create({ name: 'Dup', email: 'ada@example.edu', password: 'x', department: 'Math' }),
    (err) => err.code === 11000
  );
});

// FR-04 against the real routers: a session that is still being used is renewed, a login is not.
test('TC-04-26: login gives a token that lasts 60 minutes, and a request right after it is not renewed', async () => {
  const login = await app.request('POST', '/api/auth/login', { body: { email: 'ada@example.edu', password: PASSWORDS.ada } });
  const claims = jwt.verify(login.body.access_token, process.env.JWT_SECRET);
  assert.equal(claims.exp - claims.iat, 60 * 60);
  assert.equal(claims.auth_at, claims.iat);
  const res = await app.request('GET', '/api/courses', { token: login.body.access_token });
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('x-access-token'), null);
});

test('TC-04-27: a professor who is still working is handed a renewed token that works, and an idle one is refused', async () => {
  const professor = await Professor.findOne({ email: 'ada@example.edu' });
  const now = Math.floor(Date.now() / 1000);
  const tenMinutesOld = jwt.sign(
    { id: String(professor._id), email: professor.email, auth_at: now - 600, iat: now - 600 },
    process.env.JWT_SECRET,
    { expiresIn: '60m' }
  );
  const used = await app.request('GET', '/api/courses', { token: tenMinutesOld });
  assert.equal(used.status, 200);
  const renewed = used.headers.get('x-access-token');
  assert.ok(renewed, 'a renewed token is returned');
  assert.equal((await app.request('GET', '/api/courses', { token: renewed })).status, 200, 'the renewed token works');

  const idle = jwt.sign(
    { id: String(professor._id), email: professor.email, iat: now - 61 * 60 },
    process.env.JWT_SECRET,
    { expiresIn: '60m' }
  );
  const refused = await app.request('GET', '/api/courses', { token: idle });
  assert.equal(refused.status, 401);
  assert.equal(refused.headers.get('x-access-token'), null);
});

test('TC-04-35: a session past the 8-hour total limit is refused by protected routes and by the keep-alive', async () => {
  const professor = await Professor.findOne({ email: 'ada@example.edu' });
  const now = Math.floor(Date.now() / 1000);
  const tooOld = jwt.sign(
    { id: String(professor._id), email: professor.email, auth_at: now - 9 * 3600, iat: now - 600, exp: now + 3000 },
    process.env.JWT_SECRET
  );
  assert.equal((await app.request('GET', '/api/courses', { token: tooOld })).status, 401);
  const refresh = await app.request('POST', '/api/auth/refresh', { token: tooOld, body: {} });
  assert.equal(refresh.status, 401);
  assert.equal(refresh.headers.get('x-access-token'), null);
});

// Behaviour today, not decisions: logout does nothing on the server, and a professor with MFA
// switched on cannot finish logging in (D-17). Replace these if they are built.
test('TC-01-26: logout needs a valid token and answers 200, but the token keeps working (no server-side logout)', async () => {
  const login = await app.request('POST', '/api/auth/login', { body: { email: 'ada@example.edu', password: PASSWORDS.ada } });
  const token = login.body.access_token;
  assert.equal((await app.request('POST', '/api/auth/logout', {})).status, 401);
  assert.equal((await app.request('POST', '/api/auth/logout', { token })).status, 200);
  assert.equal((await app.request('GET', '/api/courses', { token })).status, 200, 'the token still works after logout');
});

test('TC-01-27: the keep-alive needs a valid token; with one it answers 200 and a token that is a minute old gets renewed', async () => {
  assert.equal((await app.request('POST', '/api/auth/refresh', { body: {} })).status, 401, 'no token');
  assert.equal((await app.request('POST', '/api/auth/refresh', { token: 'not-a-token', body: {} })).status, 401);

  const professor = await Professor.findOne({ email: 'ada@example.edu' });
  const now = Math.floor(Date.now() / 1000);
  const old = jwt.sign({ id: String(professor._id), email: professor.email, iat: now - 600 }, process.env.JWT_SECRET, { expiresIn: '60m' });
  const res = await app.request('POST', '/api/auth/refresh', { token: old, body: {} });
  assert.equal(res.status, 200);
  assert.equal(res.body.expires_in_seconds, 3600);
  const renewed = res.headers.get('x-access-token');
  assert.ok(renewed, 'a renewed token is returned');
  const claims = jwt.verify(renewed, process.env.JWT_SECRET);
  assert.ok(claims.exp - now > 59 * 60, 'valid for a new full idle period');
});

test('TC-01-28: a professor with MFA on is told MFA is required and gets no token, and cannot complete it (D-17)', async () => {
  await Professor.updateOne({ email: 'ada@example.edu' }, { mfa_enabled: true });
  const res = await app.request('POST', '/api/auth/login', { body: { email: 'ada@example.edu', password: PASSWORDS.ada } });
  assert.equal(res.status, 200);
  assert.equal(res.body.mfa_required, true);
  assert.equal(res.body.access_token, undefined);
  assert.equal((await app.request('POST', '/api/auth/verify-mfa', { body: {} })).status, 501);
});
