const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const Student = require('../models/Student');
const Evaluation = require('../models/Evaluation');
const { startDatabase, stopDatabase, clearDatabase } = require('./helpers/db');
const { startApp, sentEmails, clearEmails, deadlineBody } = require('./helpers/app');
const { seed, IDS } = require('./helpers/seed');
const { ORDINARY_RATINGS } = require('./helpers/evaluations');

// FR-11, FR-12, FR-10 / CICD-70: status, reminders and send agree on who has submitted. Found on staging
// (14 Oct): two students still carried the submitted mark from before a reset cleared it, with no
// evaluations on file. Status said 0 completed while send said "2 already submitted", and nothing could
// invite them. Real database, emails captured at the transport.
let replSet;
let app;
let ada;

const course = (path) => `/api/courses/${IDS.courseAda}/${path}`;
const status = () => app.request('GET', course('evaluations/status'), { token: ada });
const sendTo = (path) => app.request('POST', course(path), { token: ada, body: deadlineBody(5) });
const remind = () => app.request('POST', course('evaluations/remind'), { token: ada, body: {} });

test.before(async () => {
  process.env.FRONTEND_URL = 'https://peers.example.test';
  replSet = await startDatabase();
  app = await startApp();
  ada = app.tokenFor(IDS.ada, 'ada@example.edu');
});
test.after(async () => {
  delete process.env.FRONTEND_URL;
  await app.close();
  await stopDatabase(replSet);
});

// Ann and Ben carry the mark with no evaluations; Cy and Di have working links (Team 2 was sent to).
test.beforeEach(async (t) => {
  t.mock.method(console, 'log', () => {});
  t.mock.method(console, 'error', () => {});
  await clearDatabase();
  await seed();
  clearEmails();
  await Student.updateMany({ _id: { $in: [IDS.ann, IDS.ben] } }, { evaluation_completed: true });
  await sendTo(`teams/${IDS.teamBeta}/evaluations/send`);
  clearEmails();
});

test('TC-11-23: the status shows a student with the submitted mark and no evaluations as submitted, and says there are no ratings', async () => {
  const { body } = await status();
  assert.equal(body.total_count, 4);
  assert.equal(body.completed_count, 2);
  assert.equal(body.pending_count, 2);
  const row = (name) => body.students.find((s) => s.name === name);
  for (const name of ['Ann Archer', 'Ben Baker']) {
    assert.equal(row(name).completed, true, name);
    assert.equal(row(name).ratings_on_file, false, name);
    assert.equal(row(name).last_activity, null, name);
  }
  assert.equal(row('Cy Cole').completed, false);
  assert.equal(row('Cy Cole').ratings_on_file, true, 'not submitted: nothing to flag');
});

test('TC-11-24: the counts are the enrolled students who submitted, not every evaluator id in the collection', async () => {
  // An evaluation written by someone no longer in the course (their classmates were deleted, or they were)
  await Evaluation.create({
    course_id: IDS.courseAda, student_id: IDS.cy, evaluator_id: new mongoose.Types.ObjectId(), evaluation_token: 'g'.repeat(64),
    ratings: ORDINARY_RATINGS, overall_feedback: 'Reliable and prepared every week.',
  });
  const { body } = await status();
  assert.equal(body.completed_count, 2, 'Ann and Ben only');
  assert.equal(body.pending_count, 2);
  assert.equal(body.completion_rate, 50);
});

test('TC-10-77: send agrees with the status: the two students are already submitted, the two with links already invited', async () => {
  const res = await sendTo('evaluations/send');
  assert.equal(res.body.already_submitted, 2);
  assert.equal(res.body.already_invited, 2);
  assert.equal(res.body.emails_sent, 0);
  assert.equal(sentEmails.length, 0);
});

test('TC-12-26: a reminder skips the students with the submitted mark and does not call them "not invited"', async () => {
  const res = await remind();
  assert.equal(res.status, 200);
  assert.equal(res.body.reminders_sent, 2);
  assert.deepEqual(sentEmails.map((e) => e.to).sort(), ['cy@example.edu', 'di@example.edu']);
  assert.equal(res.body.not_invited, 0);
  assert.deepEqual(res.body.deadline_passed, []);
});

test('TC-12-27: naming the flagged students in a reminder reminds nobody', async () => {
  const res = await app.request('POST', course('evaluations/remind'), { token: ada, body: { student_ids: [String(IDS.ann), String(IDS.ben)] } });
  assert.equal(res.status, 200);
  assert.equal(res.body.reminders_sent, 0);
  assert.match(res.body.message, /all evaluations completed/i, 'they count as submitted, not as "not invited"');
  assert.equal(sentEmails.length, 0);
});

// Advisor review: if nobody holds a link at all (every student carries a stale mark), status used to say the
// round was not sent and show no rows, while send said "already submitted", and Allow resubmission was hidden.
test('TC-11-25: with every student marked submitted and nobody holding a link, the status still lists them, with no ratings on file', async () => {
  await Student.updateMany({ course_id: IDS.courseAda }, { evaluation_completed: true, evaluation_token: null, evaluation_token_expires_at: null });
  const { body } = await status();
  assert.equal(body.evaluations_sent, true);
  assert.equal(body.total_count, 4);
  assert.equal(body.completed_count, 4);
  assert.equal(body.students.length, 4);
  assert.ok(body.students.every((s) => s.completed && s.ratings_on_file === false));
  const send = await sendTo('evaluations/send');
  assert.equal(send.body.already_submitted, 4, 'send agrees');
});

test('TC-16-73: a student marked submitted with no ratings can be given a resubmission, submit again, and then shows ratings on file', async () => {
  // Ann has no link yet either: the mark came from before a reset, which also cleared her link
  const allowed = await app.request('POST', course(`students/${IDS.ann}/evaluations/resubmit`), { token: ada, body: deadlineBody(4) });
  assert.equal(allowed.status, 200);
  const { evaluation_token: link } = await Student.findById(IDS.ann);
  const submitted = await app.request('POST', `/api/evaluate/${link}`, {
    body: { evaluations: [{ student_id: String(IDS.ben), ratings: ORDINARY_RATINGS, overall_feedback: 'Reliable and prepared every week.' }] },
  });
  assert.equal(submitted.status, 201);
  const { body } = await status();
  const ann = body.students.find((s) => s.name === 'Ann Archer');
  assert.equal(ann.completed, true);
  assert.equal(ann.ratings_on_file, true);
  assert.equal(await Evaluation.countDocuments({ evaluator_id: IDS.ann }), 1);
  assert.equal((await Student.findById(IDS.ann)).resubmission_allowed, false);
});
