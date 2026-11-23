const test = require('node:test');
const assert = require('node:assert/strict');
const Student = require('../models/Student');
const Evaluation = require('../models/Evaluation');
const { startDatabase, stopDatabase, clearDatabase } = require('./helpers/db');
const { startApp } = require('./helpers/app');
const { seed, IDS } = require('./helpers/seed');

// CICD-94: an evaluation link token opens a student's form and submits ratings in their name until the
// deadline, and the frontend never reads it, so no professor-facing response may carry one: not on a
// student record, not on an evaluation record, not nested inside a report. The check is on the whole response
// body as text, which also catches copies nested in evaluationDetails or a team's student list.
let replSet;
let app;
let ada;

const TOKENS = {
  ann: '1'.repeat(64),
  ben: '2'.repeat(64),
  cy: '3'.repeat(64),
  di: '4'.repeat(64),
  // the token stored on an evaluation record (the one its evaluator used)
  oldCy: '5'.repeat(64),
};
const RATINGS = { professionalism: 4, communication: 4, work_ethic: 4, content_knowledge_skills: 4, overall_contribution: 4, participation: 3 };
const FEEDBACK = 'Reliable and prepared every week, and always willing to help others.';

async function giveEveryoneALink() {
  const expires = new Date(Date.now() + 86400000);
  for (const name of ['ann', 'ben', 'cy', 'di']) {
    await Student.findByIdAndUpdate(IDS[name], { evaluation_token: TOKENS[name], evaluation_token_expires_at: expires });
  }
}

async function submitSomeEvaluations() {
  await Evaluation.create([
    { course_id: IDS.courseAda, student_id: IDS.ben, evaluator_id: IDS.ann, evaluation_token: TOKENS.ann, ratings: RATINGS, overall_feedback: FEEDBACK },
    { course_id: IDS.courseAda, student_id: IDS.ann, evaluator_id: IDS.ben, evaluation_token: TOKENS.ben, ratings: RATINGS, overall_feedback: FEEDBACK },
    { course_id: IDS.courseAda, student_id: IDS.di, evaluator_id: IDS.cy, evaluation_token: TOKENS.oldCy, ratings: RATINGS, overall_feedback: FEEDBACK },
  ]);
  await Student.updateMany({ _id: { $in: [IDS.ann, IDS.ben, IDS.cy] } }, { evaluation_completed: true });
}

function assertNoToken(res, label) {
  assert.equal(res.status, 200, `${label}: ${JSON.stringify(res.body)}`);
  const text = JSON.stringify(res.body);
  for (const [who, token] of Object.entries(TOKENS)) {
    assert.ok(!text.includes(token), `${label} carries ${who}'s link token`);
  }
  assert.ok(!text.includes('"evaluation_token"'), `${label} has an evaluation_token field`);
}

const course = `/api/courses/${IDS.courseAda}`;

test.before(async () => {
  replSet = await startDatabase();
  app = await startApp();
  ada = app.tokenFor(IDS.ada, 'ada@example.edu');
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
  await giveEveryoneALink();
});

test('TC-SEC-38: the course report carries no link token, before and after anyone submits, in both grading methods', async () => {
  assertNoToken(await app.request('GET', `${course}/reports`, { token: ada }), 'curved report, nobody submitted');
  assertNoToken(await app.request('GET', `${course}/reports?gradingMethod=multiplier`, { token: ada }), 'multiplier report, nobody submitted');
  await submitSomeEvaluations();
  const curved = await app.request('GET', `${course}/reports`, { token: ada });
  assertNoToken(curved, 'curved report');
  assert.equal(curved.body.students.length, 4, 'the students are still listed');
  assert.ok(curved.body.students.some((s) => s.evaluationDetails.length > 0), 'with their evaluation details');
  assertNoToken(await app.request('GET', `${course}/reports?gradingMethod=multiplier`, { token: ada }), 'multiplier report');
});

test('TC-SEC-39: the team and student reports carry no link token', async () => {
  await submitSomeEvaluations();
  const team = await app.request('GET', `${course}/reports/team/${IDS.teamAlpha}`, { token: ada });
  assertNoToken(team, 'team report');
  assert.equal(team.body.members.length, 2);
  const student = await app.request('GET', `${course}/reports/student/1002`, { token: ada });
  assertNoToken(student, 'student report');
  assert.equal(student.body.student.name, 'Ben Baker');
  assert.equal(student.body.detailedEvaluations.length, 1, 'the evaluation Ben received is still there');
});

test('TC-SEC-40: the student list and the evaluation status carry no link token, and keep the fields the dialogs use', async () => {
  await submitSomeEvaluations();
  const list = await app.request('GET', `${course}/students`, { token: ada });
  assertNoToken(list, 'student list');
  assert.equal(list.body.length, 4);
  assert.ok(list.body.every((s) => s.evaluation_token_expires_at), 'the link deadline is still shown');

  const status = await app.request('GET', `${course}/evaluations/status`, { token: ada });
  assertNoToken(status, 'evaluation status');
  assert.equal(status.body.evaluations_sent, true);
  assert.equal(status.body.completed_count, 3);
  assert.ok(status.body.students.every((row) => 'completed' in row && 'resubmission_allowed' in row && row.id));
});

test('TC-SEC-41: the tokens stay in the database, so the links keep working and a submission is saved', async () => {
  await submitSomeEvaluations();
  await app.request('GET', `${course}/reports`, { token: ada });
  assert.equal((await Student.findById(IDS.di)).evaluation_token, TOKENS.di);
  assert.equal((await Evaluation.findOne({ evaluator_id: IDS.cy })).evaluation_token, TOKENS.oldCy);
  assert.equal((await app.request('GET', `/api/evaluate/${TOKENS.di}`)).status, 200, 'Di can still open her form');
  const submitted = await app.request('POST', `/api/evaluate/${TOKENS.di}`, {
    body: { evaluations: [{ student_id: String(IDS.cy), ratings: RATINGS, overall_feedback: FEEDBACK }] },
  });
  assert.equal(submitted.status, 201, JSON.stringify(submitted.body));
  assert.equal((await Evaluation.findOne({ evaluator_id: IDS.di })).evaluation_token, TOKENS.di, 'the saved evaluation keeps the token it was sent with');
});
