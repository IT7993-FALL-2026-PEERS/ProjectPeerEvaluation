const test = require('node:test');
const assert = require('node:assert/strict');
const Student = require('../models/Student');
const Evaluation = require('../models/Evaluation');
const { startDatabase, stopDatabase, clearDatabase } = require('./helpers/db');
const { startApp, sentEmails, failNextEmails, clearEmails, deadlineBody } = require('./helpers/app');
const { seed, IDS } = require('./helpers/seed');
const { ORDINARY_RATINGS } = require('./helpers/evaluations');

// FR-16 / CICD-68: one submission per student, unless the instructor approves a resubmission. The approval
// emails a new link (the old one dies), the form opens again, and the next submission replaces the earlier
// evaluations once. Real database, emails captured at the transport.
let replSet;
let app;
let ada;
let bo;

const resubmitPath = (id) => `/api/courses/${IDS.courseAda}/students/${id}/evaluations/resubmit`;
const send = () => app.request('POST', `/api/courses/${IDS.courseAda}/evaluations/send`, { token: ada, body: deadlineBody(2) });
const submit = (link, feedback = 'Reliable and prepared every week.') => app.request('POST', `/api/evaluate/${link}`, {
  body: { evaluations: [{ student_id: String(IDS.ben), ratings: ORDINARY_RATINGS, overall_feedback: feedback }] },
});

test.before(async () => {
  process.env.FRONTEND_URL = 'https://peers.example.test';
  replSet = await startDatabase();
  app = await startApp();
  ada = app.tokenFor(IDS.ada, 'ada@example.edu');
  bo = app.tokenFor(IDS.bo, 'bo@example.edu');
});
test.after(async () => {
  delete process.env.FRONTEND_URL;
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

test('TC-16-63: an approved resubmission emails a new link, kills the old one, opens the form, and the next submit replaces the evaluations', async () => {
  await send();
  const { evaluation_token: first } = await Student.findById(IDS.ann);
  assert.equal((await submit(first, 'First version of my feedback.')).status, 201);
  assert.equal((await submit(first)).status, 409, 'one submission per student');

  clearEmails();
  const body = deadlineBody(4);
  const res = await app.request('POST', resubmitPath(IDS.ann), { token: ada, body });
  assert.equal(res.status, 200);
  const ann = await Student.findById(IDS.ann);
  assert.equal(ann.resubmission_allowed, true);
  assert.notEqual(ann.evaluation_token, first);
  assert.equal(ann.evaluation_token_expires_at.getTime(), Date.parse(body.deadline));
  assert.equal((await app.request('GET', `/api/evaluate/${first}`)).status, 404, 'the old link is dead');
  assert.match(sentEmails[0].html, /submit your evaluation again/);

  const form = await app.request('GET', `/api/evaluate/${ann.evaluation_token}`);
  assert.equal(form.status, 200);
  assert.ok(Array.isArray(form.body.teammates), 'the form opens, not "already completed"');
  assert.equal((await app.request('GET', `/api/evaluate/${ann.evaluation_token}/status`)).body.completed, false);

  assert.equal((await submit(ann.evaluation_token, 'Second version, after talking to Ben.')).status, 201);
  const evaluations = await Evaluation.find({ evaluator_id: IDS.ann });
  assert.equal(evaluations.length, 1, 'replaced, not added');
  assert.equal(evaluations[0].overall_feedback, 'Second version, after talking to Ben.');
  const done = await Student.findById(IDS.ann);
  assert.equal(done.resubmission_allowed, false);
  assert.equal(done.evaluation_completed, true);
  assert.equal((await submit(ann.evaluation_token)).status, 409, 'and one submission again after that');
});

test('TC-16-66: a student who has not submitted cannot be given a resubmission; ids from elsewhere are refused', async () => {
  await send();
  const res = await app.request('POST', resubmitPath(IDS.ann), { token: ada, body: deadlineBody(4) });
  assert.equal(res.status, 409);
  assert.equal(res.body.error.code, 'NOT_SUBMITTED');
  assert.equal((await app.request('POST', resubmitPath('nope'), { token: ada, body: deadlineBody(4) })).status, 400);
  assert.equal((await app.request('POST', resubmitPath(IDS.eve), { token: ada, body: deadlineBody(4) })).status, 404);
  assert.equal((await app.request('POST', resubmitPath(IDS.ann), { token: bo, body: deadlineBody(4) })).status, 404);
  assert.equal((await app.request('POST', resubmitPath(IDS.ann), { token: ada, body: {} })).status, 400);
  assert.equal(sentEmails.length, 4, 'only the invitations');
});

test('TC-16-67: when the resubmission email fails nothing changes', async () => {
  await send();
  const { evaluation_token: first } = await Student.findById(IDS.ann);
  await submit(first);
  failNextEmails(1);
  const res = await app.request('POST', resubmitPath(IDS.ann), { token: ada, body: deadlineBody(4) });
  assert.equal(res.status, 502);
  assert.equal(res.body.error.code, 'EMAIL_FAILED');
  const ann = await Student.findById(IDS.ann);
  assert.equal(ann.evaluation_token, first);
  assert.equal(ann.resubmission_allowed, false);
});

test('TC-16-68: a reset clears an approved resubmission', async () => {
  await Student.findByIdAndUpdate(IDS.ann, { resubmission_allowed: true, evaluation_completed: true });
  const reset = await app.request('DELETE', `/api/courses/${IDS.courseAda}/evaluations/reset`, { token: ada });
  assert.equal(reset.status, 200);
  assert.equal((await Student.findById(IDS.ann)).resubmission_allowed, false);
});

// Codex review #5: a reset between the resubmission email and the swap must stop the swap, even for a
// student whose link had already been cleared.
test('TC-16-72: a reset while the resubmission email goes out stops the new link and the approval', async (t) => {
  await Student.findByIdAndUpdate(IDS.ann, { evaluation_completed: true, evaluation_token: null, evaluation_token_expires_at: null });
  const findOneAndUpdate = Student.findOneAndUpdate;
  let reset = false;
  t.mock.method(Student, 'findOneAndUpdate', async function (filter, update, ...rest) {
    if (!reset && update && update.evaluation_token) {
      reset = true;
      await app.request('DELETE', `/api/courses/${IDS.courseAda}/evaluations/reset`, { token: ada });
    }
    return findOneAndUpdate.call(this, filter, update, ...rest);
  });
  const res = await app.request('POST', resubmitPath(IDS.ann), { token: ada, body: deadlineBody(4) });
  t.mock.restoreAll();
  assert.equal(res.status, 409);
  assert.equal(res.body.error.code, 'LINK_CHANGED');
  const ann = await Student.findById(IDS.ann);
  assert.equal(ann.resubmission_allowed, false);
  assert.equal(ann.evaluation_token, null);
});
