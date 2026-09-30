const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

// The controller destructures emailUtils when it loads, so the send functions are
// replaced before the controller is required. No database or SMTP is involved.
const emailUtils = require('../utils/emailUtils');
const invited = [];
const reminded = [];
test.mock.method(emailUtils, 'sendEvaluationInvitation', async (student, course, token) => {
  invited.push(token);
  return { success: true };
});
test.mock.method(emailUtils, 'sendEvaluationReminder', async (student, course, token) => {
  reminded.push(token);
  return { success: true };
});

const Course = require('../models/Course');
const Student = require('../models/Student');
const Evaluation = require('../models/Evaluation');
const {
  getEvaluationForm,
  submitEvaluation,
  evaluationTokenStatus,
  sendEvaluations,
  sendTeamEvaluations,
  remindEvaluations,
} = require('../controllers/evaluationController');

const DAY_MS = 24 * 60 * 60 * 1000;
const HEX_64 = /^[0-9a-f]{64}$/;

// Mongoose queries are thenables with chainable .populate(); this fakes that shape.
function query(result) {
  const q = { populate: () => q, then: (resolve, reject) => Promise.resolve(result).then(resolve, reject) };
  return q;
}

function linkHolder(expiresAt) {
  return {
    _id: new mongoose.Types.ObjectId(),
    name: 'Alice',
    email: 'alice@example.com',
    evaluation_token: 'tok',
    evaluation_token_expires_at: expiresAt,
    course_id: { _id: new mongoose.Types.ObjectId(), course_name: 'Capstone' },
    team_id: null,
  };
}

async function call(handler, req) {
  let error;
  let body;
  const res = { status() { return this; }, json(data) { body = data; } };
  await handler(req, res, (err) => { error = err; });
  return { error, body };
}

const expiredLinkCases = [
  ['past its expiry', new Date(Date.now() - DAY_MS)],
  ['issued before expiry existed', null],
];

for (const [label, expiresAt] of expiredLinkCases) {
  test(`the evaluation form refuses a link ${label}`, async (t) => {
    t.mock.method(Student, 'findOne', () => query(linkHolder(expiresAt)));
    t.mock.method(Evaluation, 'findOne', async () => null);
    t.mock.method(console, 'error', () => {});

    const { error, body } = await call(getEvaluationForm, { params: { token: 'tok' } });
    assert.equal(body, undefined);
    assert.equal(error.status, 410);
    assert.equal(error.code, 'EVALUATION_LINK_EXPIRED');
  });

  test(`submitting through a link ${label} saves nothing`, async (t) => {
    const saved = [];
    t.mock.method(Student, 'findOne', () => query(linkHolder(expiresAt)));
    t.mock.method(Student, 'findByIdAndUpdate', async () => {});
    t.mock.method(Evaluation, 'findOne', async () => null);
    t.mock.method(Evaluation.prototype, 'save', async function save() { saved.push(this); return this; });
    t.mock.method(console, 'error', () => {});

    const { error } = await call(submitEvaluation, { params: { token: 'tok' }, body: { evaluations: [] } });
    assert.equal(error.status, 410);
    assert.equal(error.code, 'EVALUATION_LINK_EXPIRED');
    assert.equal(saved.length, 0);
  });

  test(`the token status check refuses a link ${label}`, async (t) => {
    t.mock.method(Student, 'findOne', () => query(linkHolder(expiresAt)));
    t.mock.method(Evaluation, 'exists', async () => null);
    t.mock.method(console, 'error', () => {});

    const { error } = await call(evaluationTokenStatus, { params: { token: 'tok' } });
    assert.equal(error.status, 410);
    assert.equal(error.code, 'EVALUATION_LINK_EXPIRED');
  });
}

test('a link inside its lifetime still opens the form', async (t) => {
  t.mock.method(Student, 'findOne', () => query(linkHolder(new Date(Date.now() + DAY_MS))));
  t.mock.method(Student, 'find', () => ({ select: async () => [] }));
  t.mock.method(Evaluation, 'findOne', async () => null);

  const { error, body } = await call(getEvaluationForm, { params: { token: 'tok' } });
  assert.equal(error, undefined);
  assert.equal(body.token, 'tok');
});

test('sending invitations issues crypto tokens with an expiry and emails them', async (t) => {
  invited.length = 0;
  const updates = [];
  const fresh = { ...linkHolder(null), evaluation_token: null };
  const legacy = linkHolder(null);
  t.mock.method(Course, 'findById', async () => ({ _id: 'course-1', course_name: 'Capstone' }));
  t.mock.method(Student, 'find', () => ({ populate: async () => [fresh, legacy] }));
  t.mock.method(Student, 'findByIdAndUpdate', async (id, update) => { updates.push(update); });
  t.mock.method(console, 'log', () => {});

  const before = Date.now();
  const { body } = await call(sendEvaluations, { params: { course_id: 'course-1' }, body: {} });

  assert.equal(body.emails_sent, 2);
  assert.equal(updates.length, 2);
  for (const [i, update] of updates.entries()) {
    assert.match(update.evaluation_token, HEX_64);
    assert.ok(update.evaluation_token_expires_at.getTime() >= before + 14 * DAY_MS - 1000);
    assert.equal(invited[i], update.evaluation_token);
  }
  assert.notEqual(invited[1], 'tok', 'the pre-expiry token is replaced');
});

test('sending to one team issues links the same way', async (t) => {
  invited.length = 0;
  const updates = [];
  const Team = require('../models/Team');
  t.mock.method(Course, 'findById', async () => ({ _id: 'course-1', course_name: 'Capstone' }));
  t.mock.method(Team, 'findById', async () => ({ _id: 'team-1', course_id: 'course-1' }));
  t.mock.method(Student, 'find', async () => [linkHolder(null)]);
  t.mock.method(Student, 'findByIdAndUpdate', async (id, update) => { updates.push(update); });
  t.mock.method(console, 'log', () => {});

  const { body } = await call(sendTeamEvaluations, { params: { course_id: 'course-1', team_id: 'team-1' }, body: {} });

  assert.equal(body.emails_sent, 1);
  assert.match(updates[0].evaluation_token, HEX_64);
  assert.ok(updates[0].evaluation_token_expires_at instanceof Date);
  assert.equal(invited[0], updates[0].evaluation_token);
});

test('reminders replace an expired token so the link in the email works', async (t) => {
  reminded.length = 0;
  const updates = [];
  const student = linkHolder(new Date(Date.now() - DAY_MS));
  t.mock.method(Course, 'findById', async () => ({ _id: 'course-1', course_name: 'Capstone' }));
  t.mock.method(Evaluation, 'find', () => ({ distinct: async () => [] }));
  t.mock.method(Student, 'find', async () => [student]);
  t.mock.method(Student, 'findByIdAndUpdate', async (id, update) => { updates.push(update); });

  const { body } = await call(remindEvaluations, { params: { course_id: 'course-1' }, body: {} });

  assert.equal(body.reminders_sent, 1);
  assert.equal(updates.length, 1);
  assert.match(reminded[0], HEX_64);
  assert.equal(reminded[0], updates[0].evaluation_token);
});
