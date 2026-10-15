const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

// The controller destructures emailUtils when it loads, so the send functions are
// replaced before the controller is required. No database or SMTP is involved.
const emailUtils = require('../utils/emailUtils');
const invited = [];
const reminded = [];
let invitationError = null; // set by a test to make the invitation email fail
test.mock.method(emailUtils, 'sendEvaluationInvitation', async (student, course, token) => {
  invited.push(token);
  return invitationError ? { success: false, error: invitationError } : { success: true };
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

// A classmate who has already submitted. Alone in a course of one, a student has nobody to rate and is not
// invited (CICD-72); this keeps the student under test from being that, without becoming a recipient.
function classmate() {
  return { ...linkHolder(null), _id: new mongoose.Types.ObjectId(), name: 'Sam', email: 'sam@example.com', evaluation_completed: true };
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
    assert.equal(error.message, 'The deadline for this evaluation has passed. Ask your instructor for an extension.');
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

// CICD-67: a send needs a deadline, and reaches only students without an active link.
const FUTURE = () => new Date(Date.now() + 7 * DAY_MS).toISOString();

test('sending invitations claims a new link for each student without an active link, with the deadline as its expiry, and emails it', async (t) => {
  invited.length = 0;
  const claims = [];
  const noLink = { ...linkHolder(null), evaluation_token: null };
  const legacy = linkHolder(null); // a token from before deadlines: no expiry, so it counts as expired
  const active = linkHolder(new Date(Date.now() + DAY_MS));
  t.mock.method(Course, 'findById', async () => ({ _id: 'course-1', course_name: 'Capstone' }));
  t.mock.method(Course, 'findByIdAndUpdate', async () => {});
  t.mock.method(Evaluation, 'distinct', async () => []);
  t.mock.method(Student, 'find', () => ({ populate: async () => [noLink, legacy, active] }));
  t.mock.method(Student, 'findOneAndUpdate', async (filter, update) => { claims.push({ filter, update }); return { _id: filter._id }; });
  t.mock.method(console, 'log', () => {});

  const deadline = FUTURE();
  const { body } = await call(sendEvaluations, { params: { course_id: 'course-1' }, body: { deadline } });

  assert.equal(body.emails_sent, 2);
  assert.equal(body.already_invited, 1);
  assert.equal(claims.length, 2, 'the student with an active link is not touched');
  for (const [i, claim] of claims.entries()) {
    assert.match(claim.update.evaluation_token, HEX_64);
    assert.equal(claim.update.evaluation_token_expires_at.getTime(), Date.parse(deadline));
    assert.equal(invited[i], claim.update.evaluation_token);
    assert.ok(JSON.stringify(claim.filter).includes('evaluation_token_expires_at'), 'the claim needs the student to have no active link');
  }
  assert.notEqual(invited[1], 'tok', 'the pre-deadline token is replaced');
});

test('a claim that another send won first sends nothing to that student', async (t) => {
  invited.length = 0;
  t.mock.method(Course, 'findById', async () => ({ _id: 'course-1', course_name: 'Capstone' }));
  t.mock.method(Course, 'findByIdAndUpdate', async () => {});
  t.mock.method(Evaluation, 'distinct', async () => []);
  t.mock.method(Student, 'find', () => ({ populate: async () => [{ ...linkHolder(null), evaluation_token: null }, classmate()] }));
  t.mock.method(Student, 'findOneAndUpdate', async () => null);
  t.mock.method(console, 'log', () => {});

  const { body } = await call(sendEvaluations, { params: { course_id: 'course-1' }, body: { deadline: FUTURE() } });
  assert.equal(body.emails_sent, 0);
  assert.equal(body.already_invited, 1);
  assert.equal(invited.length, 0);
});

test('sending to one team issues links the same way', async (t) => {
  invited.length = 0;
  const claims = [];
  const Team = require('../models/Team');
  t.mock.method(Course, 'findById', async () => ({ _id: 'course-1', course_name: 'Capstone' }));
  t.mock.method(Course, 'findByIdAndUpdate', async () => {});
  t.mock.method(Team, 'findById', async () => ({ _id: 'team-1', course_id: 'course-1' }));
  t.mock.method(Evaluation, 'distinct', async () => []);
  t.mock.method(Student, 'find', async () => [{ ...linkHolder(null), evaluation_token: null }, classmate()]);
  t.mock.method(Student, 'findOneAndUpdate', async (filter, update) => { claims.push(update); return { _id: filter._id }; });
  t.mock.method(console, 'log', () => {});

  const { body } = await call(sendTeamEvaluations, { params: { course_id: 'course-1', team_id: 'team-1' }, body: { deadline: FUTURE() } });

  assert.equal(body.emails_sent, 1);
  assert.match(claims[0].evaluation_token, HEX_64);
  assert.ok(claims[0].evaluation_token_expires_at instanceof Date);
  assert.equal(invited[0], claims[0].evaluation_token);
});

test('a send with no deadline is refused before any database work', async (t) => {
  const find = t.mock.method(Student, 'find', () => { throw new Error('must not be queried'); });
  const findCourse = t.mock.method(Course, 'findById', async () => { throw new Error('must not be queried'); });
  for (const handler of [sendEvaluations, sendTeamEvaluations]) {
    const { error } = await call(handler, { params: { course_id: 'course-1', team_id: 'team-1' }, body: {} });
    assert.equal(error.status, 400);
    assert.equal(error.code, 'VALIDATION_ERROR');
  }
  assert.equal(find.mock.callCount(), 0);
  assert.equal(findCourse.mock.callCount(), 0);
});

// CICD-67: a reminder never gives more time. It reuses the student's link and goes only to active ones.
test('reminders go only to students whose link is still active, and change no link or deadline', async (t) => {
  reminded.length = 0;
  const writes = [];
  const active = linkHolder(new Date(Date.now() + DAY_MS));
  const passed = { ...linkHolder(new Date(Date.now() - DAY_MS)), name: 'Pat' };
  const never = { ...linkHolder(null), evaluation_token: null, name: 'Nia' };
  t.mock.method(Course, 'findById', async () => ({ _id: 'course-1', course_name: 'Capstone', last_evaluation_deadline_zone: 'America/New_York' }));
  t.mock.method(Evaluation, 'find', () => ({ distinct: async () => [] }));
  t.mock.method(Student, 'find', async () => [active, passed, never]);
  for (const method of ['findByIdAndUpdate', 'findOneAndUpdate', 'updateOne', 'updateMany']) {
    t.mock.method(Student, method, async () => { writes.push(method); });
  }

  const { body } = await call(remindEvaluations, { params: { course_id: 'course-1' }, body: {} });

  assert.equal(body.reminders_sent, 1);
  assert.equal(body.total_reminded, 1);
  assert.deepEqual(reminded, ['tok'], 'the same link, not a new one');
  assert.deepEqual(body.deadline_passed, ['Pat']);
  assert.equal(body.not_invited, 1);
  assert.deepEqual(writes, [], 'a reminder writes nothing');
});

test('when nobody has an active link a reminder says so and sends nothing', async (t) => {
  reminded.length = 0;
  t.mock.method(Course, 'findById', async () => ({ _id: 'course-1', course_name: 'Capstone' }));
  t.mock.method(Evaluation, 'find', () => ({ distinct: async () => [] }));
  t.mock.method(Student, 'find', async () => [{ ...linkHolder(new Date(Date.now() - DAY_MS)), name: 'Pat' }, classmate()]);
  const { body } = await call(remindEvaluations, { params: { course_id: 'course-1' }, body: {} });
  assert.equal(body.reminders_sent, 0);
  assert.deepEqual(body.deadline_passed, ['Pat']);
  assert.match(body.message, /no reminders sent/i);
  assert.equal(reminded.length, 0);
});

// Codex review: if giving a claimed link back fails too, the student would be stuck with a link they never
// received until the deadline, so the answer has to say so instead of swallowing it.
test('when an email fails and giving its link back fails too, the answer says the link is still held', async (t) => {
  invited.length = 0;
  invitationError = 'SMTP down';
  t.after(() => { invitationError = null; });
  const releases = [];
  t.mock.method(Course, 'findById', async () => ({ _id: 'course-1', course_name: 'Capstone' }));
  t.mock.method(Course, 'findByIdAndUpdate', async () => {});
  t.mock.method(Evaluation, 'distinct', async () => []);
  t.mock.method(Student, 'find', () => ({ populate: async () => [{ ...linkHolder(null), evaluation_token: null }, classmate()] }));
  t.mock.method(Student, 'findOneAndUpdate', async (filter) => ({ _id: filter._id }));
  t.mock.method(Student, 'updateOne', async (filter) => { releases.push(filter); throw new Error('db down'); });
  t.mock.method(console, 'log', () => {});
  t.mock.method(console, 'error', () => {});

  const { body } = await call(sendEvaluations, { params: { course_id: 'course-1' }, body: { deadline: FUTURE() } });
  assert.equal(body.emails_sent, 0);
  assert.equal(body.failed.length, 1);
  assert.match(body.failed[0], /SMTP down/);
  assert.match(body.failed[0], /link could not be reset/i);
  assert.match(releases[0].evaluation_token, HEX_64, 'the release only touches the link this send claimed');
});

// CICD-67: the student page shows the deadline, also once they have submitted.
test('the form, the completed form and the token status carry the deadline', async (t) => {
  const deadline = new Date(Date.now() + DAY_MS);
  t.mock.method(Student, 'findOne', () => query(linkHolder(deadline)));
  t.mock.method(Student, 'find', () => ({ select: async () => [] }));
  const done = t.mock.method(Evaluation, 'findOne', async () => null);
  t.mock.method(Evaluation, 'exists', async () => null);

  const form = await call(getEvaluationForm, { params: { token: 'tok' } });
  assert.equal(form.body.deadline, deadline.toISOString());
  const status = await call(evaluationTokenStatus, { params: { token: 'tok' } });
  assert.equal(status.body.deadline, deadline.toISOString());

  done.mock.mockImplementation(async () => ({ submitted_at: new Date() }));
  const completed = await call(getEvaluationForm, { params: { token: 'tok' } });
  assert.equal(completed.body.completed, true);
  assert.equal(completed.body.deadline, deadline.toISOString());
});

// Codex review: the database may apply a claim and still report an error. The link must be given back
// (only if it is still this token), or the student keeps a link they never received.
test('a claim that errors after it may have been saved is given back with the same token', async (t) => {
  invited.length = 0;
  const claimed = [];
  const released = [];
  t.mock.method(Course, 'findById', async () => ({ _id: 'course-1', course_name: 'Capstone' }));
  t.mock.method(Course, 'findByIdAndUpdate', async () => {});
  t.mock.method(Evaluation, 'distinct', async () => []);
  t.mock.method(Student, 'find', () => ({ populate: async () => [{ ...linkHolder(null), evaluation_token: null }, classmate()] }));
  t.mock.method(Student, 'findOneAndUpdate', async (filter, update) => { claimed.push(update.evaluation_token); throw new Error('no acknowledgement'); });
  t.mock.method(Student, 'updateOne', async (filter) => { released.push(filter.evaluation_token); });
  t.mock.method(console, 'log', () => {});

  const { body } = await call(sendEvaluations, { params: { course_id: 'course-1' }, body: { deadline: FUTURE() } });
  assert.equal(body.emails_sent, 0);
  assert.match(body.failed[0], /no acknowledgement/);
  assert.equal(invited.length, 0);
  assert.deepEqual(released, claimed, 'the release targets exactly the token the claim tried to set');
});
