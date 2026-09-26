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
  const { sendPasswordResetEmail } = require('../utils/emailUtils');

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
});
