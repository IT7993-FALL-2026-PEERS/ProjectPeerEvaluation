const test = require('node:test');
const assert = require('node:assert/strict');
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
