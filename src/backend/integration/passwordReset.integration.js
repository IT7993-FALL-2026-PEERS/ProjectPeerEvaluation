const test = require('node:test');
const assert = require('node:assert/strict');
const Professor = require('../models/Professor');
const { startDatabase, stopDatabase, clearDatabase } = require('./helpers/db');
const { startApp, sentEmails, clearEmails } = require('./helpers/app');
const { seed, PASSWORDS } = require('./helpers/seed');

// CW-02 password reset: request a link, receive it by email, set a new password with the token.
// Needs a real database for the stored token, its expiry and the saved hash.
let server;
let app;

const FRONTEND = 'https://peers.example.test';
const tokenFromEmail = () => sentEmails[0].html.match(/\/reset-password\/([0-9a-f]{64})/)[1];

test.before(async () => {
  process.env.FRONTEND_URL = FRONTEND;
  server = await startDatabase();
  app = await startApp();
});
test.after(async () => {
  delete process.env.FRONTEND_URL;
  await app.close();
  await stopDatabase(server);
});
test.beforeEach(async (t) => {
  t.mock.method(console, 'log', () => {});
  t.mock.method(console, 'error', () => {});
  await clearDatabase();
  await seed();
  clearEmails();
});

const login = (email, password) => app.request('POST', '/api/auth/login', { body: { email, password } });

test('TC-01-30: a reset request emails a one-hour link and stores the same token', async () => {
  const res = await app.request('POST', '/api/auth/reset-password', { body: { email: 'ada@example.edu' } });
  assert.equal(res.status, 200);
  assert.equal(sentEmails.length, 1);
  assert.equal(sentEmails[0].to, 'ada@example.edu');

  const token = tokenFromEmail();
  const stored = await Professor.findOne({ email: 'ada@example.edu' });
  assert.equal(stored.securityToken, token);
  const minutes = (stored.securityTokenExpires.getTime() - Date.now()) / 60000;
  assert.ok(minutes > 59 && minutes <= 60, `expires in ${minutes} minutes`);
});

test('TC-01-31: an unknown email gets the same answer and no email goes out', async () => {
  const known = await app.request('POST', '/api/auth/reset-password', { body: { email: 'ada@example.edu' } });
  clearEmails();
  const unknown = await app.request('POST', '/api/auth/reset-password', { body: { email: 'nobody@example.edu' } });
  assert.equal(unknown.status, 200);
  assert.equal(unknown.body.message, known.body.message, 'the answer does not reveal which emails are registered');
  assert.equal(sentEmails.length, 0);
});

test('TC-01-32: the emailed token sets a new password; the old one stops working', async () => {
  await app.request('POST', '/api/auth/reset-password', { body: { email: 'ada@example.edu' } });
  const token = tokenFromEmail();

  const update = await app.request('POST', '/api/auth/update-password', { body: { token, password: 'a-brand-new-password' } });
  assert.equal(update.status, 200);

  assert.equal((await login('ada@example.edu', 'a-brand-new-password')).status, 200);
  assert.equal((await login('ada@example.edu', PASSWORDS.ada)).status, 401);

  const stored = await Professor.findOne({ email: 'ada@example.edu' });
  assert.ok(!stored.securityToken, 'the token is cleared once used');
});

test('TC-01-33: a token works once', async () => {
  await app.request('POST', '/api/auth/reset-password', { body: { email: 'ada@example.edu' } });
  const token = tokenFromEmail();
  await app.request('POST', '/api/auth/update-password', { body: { token, password: 'first-new-password' } });
  const again = await app.request('POST', '/api/auth/update-password', { body: { token, password: 'second-new-password' } });
  assert.equal(again.status, 400);
  assert.equal((await login('ada@example.edu', 'first-new-password')).status, 200);
});

test('TC-01-34: an expired token is refused and the password does not change', async () => {
  await app.request('POST', '/api/auth/reset-password', { body: { email: 'ada@example.edu' } });
  const token = tokenFromEmail();
  await Professor.updateOne({ email: 'ada@example.edu' }, { securityTokenExpires: new Date(Date.now() - 1000) });

  const res = await app.request('POST', '/api/auth/update-password', { body: { token, password: 'too-late-password' } });
  assert.equal(res.status, 400);
  assert.equal((await login('ada@example.edu', PASSWORDS.ada)).status, 200);
});

test('TC-01-35: a made-up token and a query operator in its place both get 400 (account takeover, fixed in #100)', async () => {
  await app.request('POST', '/api/auth/reset-password', { body: { email: 'ada@example.edu' } });
  for (const token of ['f'.repeat(64), { $ne: null }]) {
    const res = await app.request('POST', '/api/auth/update-password', { body: { token, password: 'attacker-password' } });
    assert.equal(res.status, 400);
  }
  assert.equal((await login('ada@example.edu', PASSWORDS.ada)).status, 200);
});
