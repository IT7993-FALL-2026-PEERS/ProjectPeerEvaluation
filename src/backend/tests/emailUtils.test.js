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
  const { sendPasswordResetEmail, sendEvaluationInvitation, sendEvaluationReminder } = require('../utils/emailUtils');

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

  // CICD-67: the server does not know the student's zone, so emails write the deadline in the instructor's.
  await t.test('TC-10-59: the invitation shows the deadline in the instructor\'s zone', async () => {
    sendMail.mock.resetCalls();
    const student = { name: 'Ann Archer', email: 'ann@example.edu' };
    const course = { course_name: 'Capstone', course_number: 'CS 4850', course_section: '01', semester: 'Fall 2026' };
    await sendEvaluationInvitation(student, course, 'a'.repeat(64), 'https://frontend.example.test', new Date('2026-10-16T03:59:00Z'), 'America/New_York');
    const message = sendMail.mock.calls[0].arguments[0];
    assert.match(message.html, /Deadline:<\/strong> Thu, Oct 15, 2026.*11:59 PM EDT/);
    assert.doesNotMatch(message.html, /No deadline set/);

    sendMail.mock.resetCalls();
    await sendEvaluationInvitation(student, course, 'a'.repeat(64), 'https://frontend.example.test');
    assert.match(sendMail.mock.calls[0].arguments[0].html, /No deadline set/, 'the old call shape still works');
  });

  // CICD-68: an extension or an approved resubmission sends a new link, and the email says why.
  await t.test('TC-10-70: an extension or resubmission email says why it was sent, escaped', async () => {
    const student = { name: 'Ann Archer', email: 'ann@example.edu' };
    const course = { course_name: 'Capstone', course_number: 'CS 4850', course_section: '01', semester: 'Fall 2026' };
    sendMail.mock.resetCalls();
    await sendEvaluationInvitation(student, course, 'c'.repeat(64), 'https://frontend.example.test', new Date('2026-10-20T03:59:00Z'), 'America/New_York',
      { intro: 'Your instructor extended your deadline. Use this new link; the old one no longer works.' });
    const html = sendMail.mock.calls[0].arguments[0].html;
    assert.match(html, /Peer Evaluation: New Link/);
    assert.match(html, /Your instructor extended your deadline\. Use this new link; the old one no longer works\./);
    sendMail.mock.resetCalls();
    await sendEvaluationInvitation(student, course, 'c'.repeat(64), 'https://f.test', null, null, { intro: '<b>x</b>' });
    assert.match(sendMail.mock.calls[0].arguments[0].html, /&lt;b&gt;x&lt;\/b&gt;/, 'escaped');
    sendMail.mock.resetCalls();
    await sendEvaluationInvitation(student, course, 'c'.repeat(64), 'https://f.test');
    assert.match(sendMail.mock.calls[0].arguments[0].html, /Peer Evaluation Invitation/, 'no intro, the usual heading');
  });

  await t.test('TC-10-60: the reminder shows when the evaluation is due', async () => {
    sendMail.mock.resetCalls();
    const student = { name: 'Ann Archer', email: 'ann@example.edu' };
    await sendEvaluationReminder(student, { course_name: 'Capstone' }, 'b'.repeat(64), 'https://frontend.example.test', new Date('2026-10-16T03:59:00Z'), 'America/New_York');
    assert.match(sendMail.mock.calls[0].arguments[0].html, /Due:<\/strong> Thu, Oct 15, 2026.*11:59 PM EDT/);
  });
});
