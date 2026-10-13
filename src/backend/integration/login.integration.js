const test = require('node:test');
const assert = require('node:assert/strict');
const Professor = require('../models/Professor');
const { startDatabase, stopDatabase, clearDatabase } = require('./helpers/db');
const { startApp, sentEmails, holdEmails, holdNextEmail, clearEmails } = require('./helpers/app');
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
  clearEmails();
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

const newProfessor = { email: 'New@Example.edu', name: 'New Prof', department: 'Math' };
const register = (body = newProfessor) => app.request('POST', '/api/auth/register', { body });
const tokenFromEmail = (index = 0) => sentEmails[index].html.match(/\/verify-email\/([0-9a-f]{64})/)[1];
const confirm = (token, password = 'brand-new-password') => app.request('POST', '/api/auth/verify-email', { body: { token, password } });
const loginAs = (email, password) => app.request('POST', '/api/auth/login', { body: { email, password } });
// The wait before a pending address can be sent another link (15 minutes) is measured from when the last one was sent.
const letTheWaitPass = (email) => Professor.updateOne({ email }, { email_verification_sent_at: new Date(Date.now() - 16 * 60 * 1000) });

test('TC-01-23: register stores an unconfirmed account with no password; the emailed link lets the owner choose one (stored as a bcrypt hash); then the professor can log in', async () => {
  const reg = await register();
  assert.equal(reg.status, 201);
  assert.equal(reg.body.verification_email_sent, true);

  const stored = await Professor.findById(reg.body.professor_id);
  assert.equal(stored.email, 'new@example.edu', 'the email is lower-cased on save');
  assert.equal(stored.email_verified, false);
  assert.equal(stored.password, undefined, 'no password exists before the mailbox is proven');

  assert.equal(sentEmails.length, 1);
  assert.equal(sentEmails[0].to, 'new@example.edu');
  const token = tokenFromEmail();
  assert.notEqual(stored.email_verification_token_hash, token, 'only a hash is stored');

  const early = await loginAs('new@example.edu', 'brand-new-password');
  assert.equal(early.status, 403, 'not before the address is confirmed');
  assert.equal(early.body.error.code, 'EMAIL_NOT_VERIFIED');
  assert.equal(early.body.access_token, undefined);

  const confirmed = await confirm(token);
  assert.equal(confirmed.status, 200);
  const after = await Professor.findById(reg.body.professor_id);
  assert.equal(after.email_verified, true);
  assert.match(after.password, /^\$2[aby]\$/);
  assert.notEqual(after.password, 'brand-new-password');
  assert.equal(after.email_verification_token_hash, undefined);

  const login = await loginAs('new@example.edu', 'brand-new-password');
  assert.equal(login.status, 200);
  assert.ok(login.body.access_token);
});

test('TC-01-62: an address outside the allowed domains cannot register: nothing is stored and no email is sent', async () => {
  for (const email of ['someone@gmail.com', 'prof@students.example.edu', 'prof@example.edu.evil.com']) {
    const res = await register({ ...newProfessor, email });
    assert.equal(res.status, 403, email);
    assert.equal(res.body.error.code, 'EMAIL_NOT_ALLOWED');
    assert.match(res.body.error.message, /example\.edu/);
    assert.equal(await Professor.countDocuments({ email }), 0);
  }
  assert.equal(sentEmails.length, 0);
});

test('TC-01-63: a confirmation link works once; a second use, an expired link and a made-up link are refused; a missing password does not use the link up', async () => {
  await register();
  const token = tokenFromEmail();
  const noPassword = await app.request('POST', '/api/auth/verify-email', { body: { token } });
  assert.equal(noPassword.status, 400);
  assert.equal(noPassword.body.error.code, 'VALIDATION_ERROR');
  assert.equal((await Professor.findOne({ email: 'new@example.edu' })).email_verified, false);

  assert.equal((await confirm(token)).status, 200, 'the link still works after the failed attempt');
  const again = await confirm(token, 'another-password');
  assert.equal(again.status, 400);
  assert.equal(again.body.error.code, 'TOKEN_ERROR');
  assert.equal((await loginAs('new@example.edu', 'another-password')).status, 401, 'a second use did not change the password');
  assert.equal((await confirm('a'.repeat(64))).status, 400);

  await register({ ...newProfessor, email: 'late@example.edu' });
  await Professor.updateOne({ email: 'late@example.edu' }, { email_verification_expires: new Date(Date.now() - 1000) });
  const expired = await confirm(tokenFromEmail(1));
  assert.equal(expired.status, 400);
  const late = await Professor.findOne({ email: 'late@example.edu' });
  assert.equal(late.email_verified, false);
  assert.equal(late.password, undefined);
});

test('TC-01-64: registering a pending address again after the wait sends a new link, and the old one stops working', async () => {
  await register();
  const oldToken = tokenFromEmail(0);
  await letTheWaitPass('new@example.edu');
  const second = await register();
  assert.equal(second.status, 201);
  assert.equal(await Professor.countDocuments({ email: 'new@example.edu' }), 1);
  assert.equal(sentEmails.length, 2);
  const newToken = tokenFromEmail(1);
  assert.notEqual(newToken, oldToken);

  assert.equal((await confirm(oldToken)).status, 400, 'the first link is dead');
  assert.equal((await confirm(newToken)).status, 200);
  assert.equal((await loginAs('new@example.edu', 'brand-new-password')).status, 200);
});

test('TC-01-66: anyone re-registering a pending address within the wait gets nothing: no new email, and the link in the mailbox still works', async () => {
  await register();
  const token = tokenFromEmail(0);
  for (let i = 0; i < 3; i += 1) {
    const hostile = await register({ ...newProfessor, name: 'Someone Else' });
    assert.equal(hostile.status, 201);
    assert.match(hostile.body.message, /recently/i);
  }
  assert.equal(sentEmails.length, 1, 'no further email was sent');
  assert.equal((await confirm(token)).status, 200, 'the real link was not cancelled');
});

test('TC-01-67: an attacker who registers an instructor\'s address first gets no password: only the owner of the mailbox can set one', async () => {
  const attacker = await register({ ...newProfessor, password: 'attacker-chosen-password' });
  assert.equal(attacker.status, 201);
  assert.equal((await Professor.findOne({ email: 'new@example.edu' })).password, undefined, 'the password sent was ignored');

  // The owner follows the email that arrived in their own mailbox and chooses their own password.
  assert.equal((await confirm(tokenFromEmail(0), 'the-owners-own-password')).status, 200);
  assert.equal((await loginAs('new@example.edu', 'attacker-chosen-password')).status, 401);
  assert.equal((await loginAs('new@example.edu', 'the-owners-own-password')).status, 200);
});

// Codex review, second pass (13 Oct): requests that overlap must not undo each other.
const waitFor = async (condition, what) => {
  for (let i = 0; i < 100; i += 1) {
    if (await condition()) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  assert.fail('timed out waiting for ' + what);
};

test('TC-01-74: a resend still waiting on the mail server cannot bring a link back to an account that was confirmed meanwhile', { timeout: 30000 }, async (t) => {
  await register();
  const oldToken = tokenFromEmail(0);
  await letTheWaitPass('new@example.edu');
  const release = holdEmails();
  t.after(release); // never leave the mail server held, whatever happens below
  const resend = register(); // takes the send slot, then waits on the mail server
  await waitFor(async () => {
    const p = await Professor.findOne({ email: 'new@example.edu' });
    return Date.now() - new Date(p.email_verification_sent_at).getTime() < 5000;
  }, 'the resend to take the send slot');

  assert.equal((await confirm(oldToken, 'the-owners-own-password')).status, 200, 'the owner confirms in the meantime');
  release();
  assert.equal((await resend).status, 201);

  const raw = await Professor.collection.findOne({ email: 'new@example.edu' });
  assert.equal(raw.email_verified, true);
  assert.equal(raw.email_verification_token_hash, undefined, 'no link was brought back');
  assert.equal(raw.email_verification_expires, undefined);
  assert.equal(raw.email_verification_sent_at, undefined);
  const lateToken = tokenFromEmail(1);
  assert.equal((await confirm(lateToken, 'a-password-chosen-by-someone-else')).status, 400);
  assert.equal((await loginAs('new@example.edu', 'the-owners-own-password')).status, 200, 'the owner\'s password stands');
  assert.equal((await loginAs('new@example.edu', 'a-password-chosen-by-someone-else')).status, 401);
});

// Codex review, third pass (13 Oct): a send that stays in flight past the wait can have its slot taken by a newer
// request. When the old one finishes, it must change nothing: each send may only publish or give back the slot
// it took itself.
async function aSendThatOutlivesItsSlot(outcome) {
  await register();
  await letTheWaitPass('new@example.edu');
  const release = holdNextEmail({ fail: outcome === 'failure' });
  const slow = register(); // takes the slot, then waits on the mail server
  await waitFor(async () => {
    const p = await Professor.findOne({ email: 'new@example.edu' });
    return Date.now() - new Date(p.email_verification_sent_at).getTime() < 5000;
  }, 'the first resend to take the send slot');
  const slotOfSlow = (await Professor.findOne({ email: 'new@example.edu' })).email_verification_sent_at.getTime();

  await letTheWaitPass('new@example.edu'); // time passes: the slot is old enough to be taken again
  const newer = await register(); // takes the slot at once and its email goes out
  assert.equal(newer.body.verification_email_sent, true);
  const slotOfNewer = (await Professor.findOne({ email: 'new@example.edu' })).email_verification_sent_at.getTime();
  assert.notEqual(slotOfNewer, slotOfSlow);
  const newerToken = tokenFromEmail(1);

  release(); // now the old one finishes
  const slowResult = await slow;
  assert.equal(slowResult.status, 201);
  return { newerToken, slotOfNewer, slowResult };
}

test('TC-01-79: an old send that succeeds after its slot was taken again does not replace the newer link', { timeout: 30000 }, async () => {
  const { newerToken, slotOfNewer } = await aSendThatOutlivesItsSlot('success');
  assert.equal(sentEmails.length, 3, 'the first registration, the newer resend, and the old one when it was released');
  const stored = await Professor.findOne({ email: 'new@example.edu' });
  assert.equal(stored.email_verification_sent_at.getTime(), slotOfNewer, 'the newer slot is untouched');
  assert.equal((await confirm(newerToken)).status, 200, 'the newer link still works');
});

test('TC-01-80: an old send that fails after its slot was taken again does not give back or change the newer slot', { timeout: 30000 }, async () => {
  const { newerToken, slotOfNewer, slowResult } = await aSendThatOutlivesItsSlot('failure');
  assert.equal(slowResult.body.verification_email_sent, false);
  const stored = await Professor.findOne({ email: 'new@example.edu' });
  assert.equal(stored.email_verification_sent_at.getTime(), slotOfNewer, 'the newer slot was not given back');
  const blocked = await register();
  assert.match(blocked.body.message, /recently/i, 'so the wait still protects the newer link');
  assert.equal((await confirm(newerToken)).status, 200, 'the newer link still works');
});

test('TC-01-75: two confirmations of the same link at once: exactly one succeeds, and its password is the one that works', async () => {
  await register();
  const token = tokenFromEmail();
  const results = await Promise.all([confirm(token, 'password-from-first'), confirm(token, 'password-from-second')]);
  const statuses = results.map((r) => r.status).sort();
  assert.deepEqual(statuses, [200, 400]);
  const winner = results[0].status === 200 ? 'password-from-first' : 'password-from-second';
  const loser = winner === 'password-from-first' ? 'password-from-second' : 'password-from-first';
  assert.equal((await loginAs('new@example.edu', winner)).status, 200);
  assert.equal((await loginAs('new@example.edu', loser)).status, 401);
});

test('TC-01-76: several resends of a pending address at once send one email', async () => {
  await register();
  await letTheWaitPass('new@example.edu');
  const results = await Promise.all([register(), register(), register()]);
  assert.deepEqual(results.map((r) => r.status), [201, 201, 201]);
  assert.equal(sentEmails.length, 2, 'the first registration plus exactly one resend');
  assert.equal((await confirm(tokenFromEmail(1))).status, 200, 'the one link that was sent works');
});

test('TC-01-77: several first registrations of the same address at once make one account and send one email', async () => {
  const results = await Promise.all([register(), register(), register()]);
  assert.deepEqual(results.map((r) => r.status), [201, 201, 201]);
  assert.equal(await Professor.countDocuments({ email: 'new@example.edu' }), 1);
  assert.equal(sentEmails.length, 1);
  assert.equal((await confirm(tokenFromEmail(0))).status, 200);
});

test('TC-01-78: a pending address with no sent time at all (no link was ever delivered) is sent a link at once', async () => {
  await register();
  await Professor.collection.updateOne({ email: 'new@example.edu' }, { $unset: { email_verification_sent_at: '', email_verification_token_hash: '', email_verification_expires: '' } });
  const again = await register();
  assert.equal(again.status, 201);
  assert.equal(again.body.verification_email_sent, true);
  assert.equal(sentEmails.length, 2);
  assert.equal((await confirm(tokenFromEmail(1))).status, 200);
});

test('TC-01-65: professors that existed before confirmation was added (no flag in the database) can still log in', async () => {
  await Professor.collection.updateOne({ email: 'ada@example.edu' }, { $unset: { email_verified: '' } });
  const raw = await Professor.collection.findOne({ email: 'ada@example.edu' });
  assert.equal(raw.email_verified, undefined, 'the field is really absent');
  const res = await loginAs('ada@example.edu', PASSWORDS.ada);
  assert.equal(res.status, 200);
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

// Behaviour today, not decisions: logout does nothing on the server, refresh is a stub, and a
// professor with MFA switched on cannot finish logging in (D-17). Replace these if they are built.
test('TC-01-26: logout needs a valid token and answers 200, but the token keeps working (no server-side logout)', async () => {
  const login = await app.request('POST', '/api/auth/login', { body: { email: 'ada@example.edu', password: PASSWORDS.ada } });
  const token = login.body.access_token;
  assert.equal((await app.request('POST', '/api/auth/logout', {})).status, 401);
  assert.equal((await app.request('POST', '/api/auth/logout', { token })).status, 200);
  assert.equal((await app.request('GET', '/api/courses', { token })).status, 200, 'the token still works after logout');
});

test('TC-01-27: token refresh is not implemented (501)', async () => {
  const res = await app.request('POST', '/api/auth/refresh', { body: {} });
  assert.equal(res.status, 501);
});

test('TC-01-28: a professor with MFA on is told MFA is required and gets no token, and cannot complete it (D-17)', async () => {
  await Professor.updateOne({ email: 'ada@example.edu' }, { mfa_enabled: true });
  const res = await app.request('POST', '/api/auth/login', { body: { email: 'ada@example.edu', password: PASSWORDS.ada } });
  assert.equal(res.status, 200);
  assert.equal(res.body.mfa_required, true);
  assert.equal(res.body.access_token, undefined);
  assert.equal((await app.request('POST', '/api/auth/verify-mfa', { body: {} })).status, 501);
});
