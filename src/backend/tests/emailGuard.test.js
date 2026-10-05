const test = require('node:test');
const assert = require('node:assert/strict');
const nodemailer = require('nodemailer');
const { isStaging, checkTransport } = require('../utils/emailGuard');

// Staging email isolation (CICD-44): staging may only send through the Mailtrap sandbox.
const SANDBOX = { DEPLOY_ENV: 'staging', SMTP_HOST: 'sandbox.smtp.mailtrap.io' };

test('staging is DEPLOY_ENV=staging or a Render service named *-staging', () => {
  assert.equal(isStaging({ DEPLOY_ENV: 'staging' }), true);
  assert.equal(isStaging({ RENDER_SERVICE_NAME: 'peers-backend-staging' }), true);
  assert.equal(isStaging({ NODE_ENV: 'production' }), false);
  assert.equal(isStaging({ RENDER_SERVICE_NAME: 'peers-backend' }), false);
  assert.equal(isStaging({}), false);
});

test('staging allows the Mailtrap sandbox, in any letter case', () => {
  assert.deepEqual(checkTransport(SANDBOX), { allowed: true });
  assert.deepEqual(checkTransport({ ...SANDBOX, SMTP_HOST: ' Sandbox.SMTP.Mailtrap.io ' }), { allowed: true });
  assert.deepEqual(checkTransport({ ...SANDBOX, SMTP_HOST: 'smtp.mailtrap.io' }), { allowed: true });
});

test('staging refuses a real mail server', () => {
  const result = checkTransport({ DEPLOY_ENV: 'staging', SMTP_HOST: 'smtp.gmail.com' });
  assert.equal(result.allowed, false);
  assert.match(result.reason, /SMTP_HOST is "smtp\.gmail\.com"\. No email was sent/);
});

test("staging refuses Mailtrap's live sending hosts and look-alikes", () => {
  for (const host of ['live.smtp.mailtrap.io', 'bulk.smtp.mailtrap.io', 'sandbox.smtp.mailtrap.io.evil.com', 'evilsandbox.smtp.mailtrap.io']) {
    assert.equal(checkTransport({ DEPLOY_ENV: 'staging', SMTP_HOST: host }).allowed, false, host);
  }
});

test('staging refuses SMTP_SERVICE even with the sandbox host', () => {
  const result = checkTransport({ ...SANDBOX, SMTP_SERVICE: 'gmail' });
  assert.equal(result.allowed, false);
  assert.match(result.reason, /SMTP_SERVICE is set \(gmail\)/);
});

test('staging with no SMTP_HOST is refused (the mailer would fall back to localhost)', () => {
  assert.match(checkTransport({ DEPLOY_ENV: 'staging' }).reason, /SMTP_HOST is "not set"/);
});

test('the guard still holds when only Render says it is staging', () => {
  assert.equal(checkTransport({ RENDER_SERVICE_NAME: 'peers-backend-staging', SMTP_HOST: 'smtp.gmail.com' }).allowed, false);
});

test('outside staging any transport is allowed', () => {
  assert.deepEqual(checkTransport({ SMTP_HOST: 'smtp.gmail.com' }), { allowed: true });
  assert.deepEqual(checkTransport({ NODE_ENV: 'production', SMTP_SERVICE: 'gmail' }), { allowed: true });
});

// Through the real mailer: a refused message never reaches the transport.
test('the mailer refuses to send on staging unless the transport is the sandbox', async (t) => {
  const keys = ['DEPLOY_ENV', 'RENDER_SERVICE_NAME', 'SMTP_SERVICE', 'SMTP_HOST'];
  const original = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  const modulePath = require.resolve('../utils/emailUtils');
  t.after(() => {
    for (const key of keys) {
      if (original[key] === undefined) delete process.env[key];
      else process.env[key] = original[key];
    }
    delete require.cache[modulePath];
  });
  for (const key of keys) delete process.env[key];
  t.mock.method(console, 'log', () => {});
  t.mock.method(console, 'error', () => {});
  const sendMail = t.mock.fn(async () => ({ messageId: 'sandbox-message' }));
  t.mock.method(nodemailer, 'createTransport', () => ({ sendMail }));
  delete require.cache[modulePath];
  const { sendEvaluationInvitation, sendEvaluationReminder, sendPasswordResetEmail } = require('../utils/emailUtils');
  const student = { name: 'Real Student', email: 'student@students.kennesaw.edu' };
  const course = { course_name: 'IT 7993', course_number: '7993', course_section: '01', semester: 'Fall 2026' };

  process.env.DEPLOY_ENV = 'staging';
  process.env.SMTP_HOST = 'smtp.gmail.com';
  const results = [
    await sendEvaluationInvitation(student, course, 'token', 'https://frontend.test'),
    await sendEvaluationReminder(student, course, 'token', 'https://frontend.test'),
    await sendPasswordResetEmail('professor@kennesaw.edu', 'token', 'https://frontend.test'),
  ];
  for (const result of results) {
    assert.equal(result.success, false);
    assert.match(result.error, /Staging only sends email through the Mailtrap sandbox/);
  }
  assert.equal(sendMail.mock.callCount(), 0);

  process.env.SMTP_HOST = 'sandbox.smtp.mailtrap.io';
  const sent = await sendEvaluationInvitation(student, course, 'token', 'https://frontend.test');
  assert.deepEqual(sent, { success: true, messageId: 'sandbox-message' });
  assert.equal(sendMail.mock.callCount(), 1);
});
