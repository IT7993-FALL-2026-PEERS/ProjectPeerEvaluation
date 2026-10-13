const test = require('node:test');
const assert = require('node:assert/strict');
const nodemailer = require('nodemailer');

test('email transport verifies certificates and uses configured SMTP settings', async (t) => {
  const keys = ['SMTP_SERVICE', 'SMTP_HOST', 'SMTP_PORT', 'FRONTEND_URL'];
  const original = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  const modulePath = require.resolve('../utils/emailUtils');
  t.after(() => {
    for (const key of keys) {
      if (original[key] === undefined) delete process.env[key];
      else process.env[key] = original[key];
    }
    delete require.cache[modulePath];
  });
  delete process.env.SMTP_SERVICE;
  process.env.SMTP_HOST = 'smtp.example.test';
  process.env.SMTP_PORT = '2525';
  delete process.env.FRONTEND_URL;
  t.mock.method(console, 'log', () => {});
  const sendMail = t.mock.fn(async () => ({ messageId: 'test-message' }));
  const createTransport = t.mock.method(nodemailer, 'createTransport', () => ({ sendMail }));
  const { sendPasswordResetEmail, sendVerificationEmail } = require('../utils/emailUtils');

  assert.equal(createTransport.mock.callCount(), 1);
  const config = createTransport.mock.calls[0].arguments[0];
  assert.notEqual(config.tls?.rejectUnauthorized, false);
  assert.equal(config.host, 'smtp.example.test');
  assert.equal(config.port, 2525);

  await t.test('password reset sends the recipient and frontend token link', async () => {
    const result = await sendPasswordResetEmail('professor@example.test', 'reset-token', 'https://frontend.example.test');
    assert.deepEqual(result, { success: true, messageId: 'test-message' });
    assert.equal(sendMail.mock.callCount(), 1);
    const message = sendMail.mock.calls[0].arguments[0];
    assert.equal(message.to, 'professor@example.test');
    assert.equal(message.subject, 'Password Reset Request');
    assert.ok(message.html.includes('href="https://frontend.example.test/reset-password/reset-token"'));
  });

  await t.test('the confirmation email goes to the new professor with a link to the frontend page', async () => {
    sendMail.mock.resetCalls();
    const result = await sendVerificationEmail('prof@kennesaw.edu', 'confirm-token', 'https://frontend.example.test');
    assert.deepEqual(result, { success: true, messageId: 'test-message' });
    assert.equal(sendMail.mock.callCount(), 1);
    const message = sendMail.mock.calls[0].arguments[0];
    assert.equal(message.to, 'prof@kennesaw.edu');
    assert.match(message.subject, /confirm/i);
    assert.ok(message.html.includes('href="https://frontend.example.test/verify-email/confirm-token"'));
    assert.match(message.html, /48 hours/);
  });

  await t.test('a failed send is reported, not thrown, so registration can tell the professor', async () => {
    sendMail.mock.mockImplementationOnce(async () => { throw new Error('SMTP down'); });
    const error = t.mock.method(console, 'error', () => {});
    const result = await sendVerificationEmail('prof@kennesaw.edu', 'confirm-token', 'https://frontend.example.test');
    assert.deepEqual(result, { success: false, error: 'SMTP down' });
    error.mock.restore();
  });

  await t.test('outside production the link is also printed, so a developer without mail can finish registering', async () => {
    const originalEnv = process.env.NODE_ENV;
    const log = t.mock.method(console, 'log', () => {});
    try {
      process.env.NODE_ENV = 'development';
      await sendVerificationEmail('prof@kennesaw.edu', 'confirm-token', 'https://frontend.example.test');
      assert.ok(log.mock.calls.some((call) => String(call.arguments.join(' ')).includes('/verify-email/confirm-token')), 'printed in development');

      log.mock.resetCalls();
      process.env.NODE_ENV = 'production';
      await sendVerificationEmail('prof@kennesaw.edu', 'confirm-token', 'https://frontend.example.test');
      assert.ok(!log.mock.calls.some((call) => String(call.arguments.join(' ')).includes('confirm-token')), 'never printed in production');
    } finally {
      if (originalEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = originalEnv;
      log.mock.restore();
    }
  });
});
