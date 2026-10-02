const test = require('node:test');
const assert = require('node:assert/strict');
const Course = require('../models/Course');
const Student = require('../models/Student');
const Team = require('../models/Team');
const Evaluation = require('../models/Evaluation');
const { startDatabase, stopDatabase, clearDatabase } = require('./helpers/db');
const { startApp } = require('./helpers/app');
const { seed, IDS } = require('./helpers/seed');

// FR-06 / FR-07 / FR-08: roster upload. The upload writes students, teams and counts in several
// steps and links team membership in two places, which is where drift happens, so it is checked
// against a real database.
let replSet;
let app;
let ada;
let bo;

const ROSTER = [
  'student_id,name,email,group_assignment',
  '1005,Fay Foster,fay@example.edu,Gamma',
  '1006,Gus Green,gus@example.edu,Gamma',
  '',
].join('\n');
const uploadPath = (courseId) => `/api/courses/${courseId}/roster`;

// One evaluation Ann submitted for Ben, with the link she used.
async function seedSubmittedEvaluation() {
  await Student.findByIdAndUpdate(IDS.ann, {
    evaluation_token: 'a'.repeat(64),
    evaluation_token_expires_at: new Date(Date.now() + 86400000),
    evaluation_completed: true,
  });
  await Evaluation.create({
    course_id: IDS.courseAda, student_id: IDS.ben, evaluator_id: IDS.ann, evaluation_token: 'a'.repeat(64),
    ratings: { professionalism: 4, communication: 4, work_ethic: 4, content_knowledge_skills: 4, overall_contribution: 4, participation: 3 },
    overall_feedback: 'Reliable and prepared every week.',
  });
}

test.before(async () => {
  replSet = await startDatabase();
  app = await startApp();
  ada = app.tokenFor(IDS.ada, 'ada@example.edu');
  bo = app.tokenFor(IDS.bo, 'bo@example.edu');
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
});

test('TC-06-20: a roster adds students and a new team, and membership matches on both sides', async () => {
  const res = await app.uploadCsv(uploadPath(IDS.courseAda), ROSTER, { token: ada });
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.students.sort(), ['1005', '1006']);
  assert.deepEqual(res.body.team_names, ['Gamma']);

  const gamma = await Team.findOne({ course_id: IDS.courseAda, team_name: 'Gamma' });
  const members = await Student.find({ course_id: IDS.courseAda, team_id: gamma._id });
  assert.deepEqual(members.map((s) => s.student_id).sort(), ['1005', '1006']);
  assert.deepEqual(gamma.students.map(String).sort(), members.map((s) => String(s._id)).sort());
  assert.equal(gamma.student_count, 2);
});

test('TC-06-21: the course counts follow the roster', async () => {
  await app.uploadCsv(uploadPath(IDS.courseAda), ROSTER, { token: ada });
  const course = await Course.findById(IDS.courseAda);
  assert.equal(course.student_count, 6);
  assert.equal(course.team_count, 3);
});

test('TC-06-22: uploading the same roster twice adds nobody twice', async () => {
  await app.uploadCsv(uploadPath(IDS.courseAda), ROSTER, { token: ada });
  const second = await app.uploadCsv(uploadPath(IDS.courseAda), ROSTER, { token: ada });
  assert.equal(second.status, 200);
  assert.deepEqual(second.body.students, []);
  assert.equal(await Student.countDocuments({ course_id: IDS.courseAda }), 6);
  assert.equal(await Team.countDocuments({ course_id: IDS.courseAda, team_name: 'Gamma' }), 1);
});

test('TC-06-23: a file with no usable rows gets 400 and changes nothing, evaluations included (API-3)', async () => {
  await seedSubmittedEvaluation();
  for (const csv of ['', 'student_id,name,email,group_assignment\n', 'ID,Full Name,Mail\n9,Zed,zed@example.edu\n']) {
    const res = await app.uploadCsv(uploadPath(IDS.courseAda), csv, { token: ada });
    assert.equal(res.status, 400, JSON.stringify(csv));
  }
  assert.equal(await Evaluation.countDocuments({ course_id: IDS.courseAda }), 1);
  assert.equal(await Student.countDocuments({ course_id: IDS.courseAda }), 4);
  const ann = await Student.findById(IDS.ann);
  assert.equal(ann.evaluation_token, 'a'.repeat(64));
});

test('TC-06-24: rows missing a required field are reported and the good rows are still added', async () => {
  const csv = [
    'student_id,name,email,group_assignment',
    '1005,Fay Foster,fay@example.edu,Gamma',
    '1006,   ,gus@example.edu,Gamma',
    '',
  ].join('\n');
  const res = await app.uploadCsv(uploadPath(IDS.courseAda), csv, { token: ada });
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.students, ['1005']);
  assert.equal(res.body.errors.length, 1);
  assert.equal(await Student.countDocuments({ course_id: IDS.courseAda, student_id: '1006' }), 0);
});

// Behaviour today, not a decision: a successful re-upload resets every evaluation link and deletes
// submitted evaluations. Whether that should stay is a sponsor question (backlog CICD-39). If it is
// changed on purpose, update this test with it.
test('TC-06-25: a successful re-upload currently clears evaluation links and submitted evaluations', async () => {
  await seedSubmittedEvaluation();
  const res = await app.uploadCsv(uploadPath(IDS.courseAda), ROSTER, { token: ada });
  assert.equal(res.status, 200);
  assert.equal(res.body.evaluations_cleared, 1);
  assert.equal(await Evaluation.countDocuments({ course_id: IDS.courseAda }), 0);
  const ann = await Student.findById(IDS.ann);
  assert.ok(!ann.evaluation_token, "the link is cleared");
});

test('TC-06-26: another professor cannot upload to the course, and nothing changes', async () => {
  const res = await app.uploadCsv(uploadPath(IDS.courseAda), ROSTER, { token: bo });
  assert.equal(res.status, 404);
  assert.equal(await Student.countDocuments({ course_id: IDS.courseAda }), 4);
  assert.equal(await Team.countDocuments({ course_id: IDS.courseAda }), 2);
});

test('TC-06-27: an upload with no token gets 401', async () => {
  const res = await app.uploadCsv(uploadPath(IDS.courseAda), ROSTER);
  assert.equal(res.status, 401);
});
