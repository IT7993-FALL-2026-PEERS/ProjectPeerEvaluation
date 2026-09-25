const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

// The controller destructures emailUtils when it loads, so the send function is
// replaced before the controller is required. No database or SMTP is involved.
const emailUtils = require('../utils/emailUtils');
const sentAt = [];
test.mock.method(emailUtils, 'sendEvaluationInvitation', async () => {
  sentAt.push(Date.now());
  return { success: true };
});

const Course = require('../models/Course');
const Student = require('../models/Student');
const { sendEvaluations } = require('../controllers/evaluationController');

const INTERVAL_MS = 40;

// Mailtrap (and every real provider) rejects bursts: "550 Too many emails per
// second". Invitations have to be spaced out by EMAIL_SEND_INTERVAL_MS.
test('course invitations are spaced out by EMAIL_SEND_INTERVAL_MS', async (t) => {
  process.env.EMAIL_SEND_INTERVAL_MS = String(INTERVAL_MS);
  t.after(() => { delete process.env.EMAIL_SEND_INTERVAL_MS; });
  t.mock.method(console, 'log', () => {});

  const students = ['Alice', 'Bob', 'Carol'].map((name) => ({
    _id: new mongoose.Types.ObjectId(),
    name,
    email: `${name.toLowerCase()}@example.com`,
    evaluation_token: `token-${name}`,
  }));
  t.mock.method(Course, 'findById', async () => ({ _id: 'course-1', course_name: 'Capstone' }));
  t.mock.method(Student, 'find', () => ({ populate: async () => students }));

  let body;
  const res = { status() { return this; }, json(data) { body = data; } };
  await sendEvaluations({ params: { course_id: 'course-1' }, body: {} }, res, (err) => { throw err; });

  assert.equal(body.emails_sent, 3);
  assert.equal(sentAt.length, 3);
  for (let i = 1; i < sentAt.length; i += 1) {
    // Timers can fire a millisecond or two early on some platforms.
    assert.ok(sentAt[i] - sentAt[i - 1] >= INTERVAL_MS - 5, `gap ${i} was ${sentAt[i] - sentAt[i - 1]}ms`);
  }
});
