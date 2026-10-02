const test = require('node:test');
const assert = require('node:assert/strict');
const Professor = require('../models/Professor');
const Evaluation = require('../models/Evaluation');
const Student = require('../models/Student');
const { startDatabase, stopDatabase, clearDatabase } = require('./helpers/db');
const { startApp } = require('./helpers/app');
const { seed, IDS } = require('./helpers/seed');
const { seedEvaluations, EXPECTED_SCORES } = require('./helpers/evaluations');

// CW-09 reports: totals computed from a fixed set of stored evaluations (see helpers/evaluations.js
// for the arithmetic), so a change to the scoring or the grouping shows up as a different number.
let server;
let app;
let ada;
let bo;

const course = (path = '') => `/api/courses/${IDS.courseAda}/reports${path}`;
const byName = (students) => Object.fromEntries(students.map((s) => [s.name.split(' ')[0].toLowerCase(), s]));
const near = (actual, expected, message) => assert.ok(Math.abs(actual - expected) < 0.011, `${message}: ${actual} vs ${expected}`);

test.before(async () => {
  server = await startDatabase();
  app = await startApp();
  ada = app.tokenFor(IDS.ada, 'ada@example.edu');
  bo = app.tokenFor(IDS.bo, 'bo@example.edu');
});
test.after(async () => {
  await app.close();
  await stopDatabase(server);
});
test.beforeEach(async (t) => {
  t.mock.method(console, 'log', () => {});
  t.mock.method(console, 'error', () => {});
  await clearDatabase();
  await seed();
  await seedEvaluations();
});

test('TC-17-20: each student\'s score is the mean of the ratings they received, as a percentage with a letter', async () => {
  const res = await app.request('GET', course(), { token: ada });
  assert.equal(res.status, 200);
  const s = byName(res.body.students);
  assert.equal(s.ann.finalScore, EXPECTED_SCORES.ann);
  assert.equal(s.ben.finalScore, EXPECTED_SCORES.ben);
  assert.equal(s.cy.finalScore, EXPECTED_SCORES.cy);
  assert.equal(s.di.finalScore, EXPECTED_SCORES.di);
  assert.deepEqual(
    [s.ann.letterGrade, s.ben.letterGrade, s.cy.letterGrade, s.di.letterGrade],
    ['A', 'C', 'A', 'F']
  );
  assert.ok(Object.values(s).every((student) => student.evaluationsReceived === 1));
});

test('TC-17-21: the course summary counts students and grades from the same numbers', async () => {
  const { summary } = (await app.request('GET', course(), { token: ada })).body;
  assert.equal(summary.totalStudents, 4);
  assert.equal(summary.studentsWithEvaluations, 4);
  near(summary.averageScore, 81.875, 'course average');
  assert.deepEqual(summary.gradeDistribution, { A: 2, B: 0, C: 1, D: 0, F: 1 });
});

test('TC-17-22: team averages are the mean of the members\' scores', async () => {
  const { teams } = (await app.request('GET', course(), { token: ada })).body;
  const byTeam = Object.fromEntries(teams.map((t) => [t.team_name, t]));
  near(byTeam.Alpha.averageScore, 89.585, 'Alpha');
  near(byTeam.Beta.averageScore, 74.165, 'Beta');
  assert.equal(byTeam.Alpha.students.length, 2);
});

test('TC-17-23: the team report matches the course report for that team', async () => {
  const res = await app.request('GET', course(`/team/${IDS.teamBeta}`), { token: ada });
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.members.map((m) => m.name).sort(), ['Cy Cole', 'Di Diaz']);
  near(res.body.teamAverage, 74.165, 'team average');
});

test('TC-18-20: a student report shows the score, ratings received and ratings given', async () => {
  const res = await app.request('GET', course('/student/1002'), { token: ada });
  assert.equal(res.status, 200);
  assert.equal(res.body.meanScore, EXPECTED_SCORES.ben);
  assert.equal(res.body.evaluationsReceived, 1);
  assert.equal(res.body.evaluationsGiven, 1);
  assert.equal(res.body.detailedEvaluations.length, 1);
});

test('TC-17-24: curved grading lifts scores under 80 half way to the class mean and leaves 80 and above alone', async () => {
  const res = await app.request('GET', course('?gradingMethod=curved'), { token: ada });
  assert.equal(res.status, 200);
  const s = byName(res.body.students);
  assert.equal(s.ann.finalScore, 100);
  assert.equal(s.cy.finalScore, 90);
  near(s.ben.finalScore, 80.52, 'Ben lifted');
  near(s.di.finalScore, 70.1, 'Di lifted');
  assert.equal(res.body.gradingSettings.boostFactor, 0.5);
});

test('TC-17-25: a course with no evaluations lists its students with no scores; one with no students says so', async () => {
  await Evaluation.deleteMany({});
  const none = await app.request('GET', course(), { token: ada });
  assert.equal(none.status, 200);
  assert.ok(none.body.students.every((s) => s.letterGrade === 'No evaluations' && s.meanScore === 0));

  await Student.deleteMany({ course_id: IDS.courseAda });
  const empty = await app.request('GET', course(), { token: ada });
  assert.equal(empty.status, 200);
  assert.deepEqual(empty.body.students, []);
});

test('TC-19-20: the CSV export has one row per student with the same scores as the report', async () => {
  const res = await fetch(`${app.baseUrl}/api/courses/${IDS.courseAda}/reports/download`, { headers: { Authorization: `Bearer ${ada}` } });
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /text\/csv/);
  assert.match(res.headers.get('content-disposition'), /attachment; filename="course_.*_report\.csv"/);

  const lines = (await res.text()).split('\n');
  assert.equal(lines[0], 'Student ID,Name,Email,Team,Original Score,Final Score,Letter Grade,Evaluations Received,Improvement');
  assert.equal(lines.length, 5);
  assert.ok(lines.includes('1002,Ben Baker,ben@example.edu,Alpha,79.17,79.17,C,1,0'));
  assert.ok(lines.includes('1004,Di Diaz,di@example.edu,Beta,58.33,58.33,F,1,0'));
});

test('TC-19-21: a name that starts like a spreadsheet formula or holds a comma cannot break out of its cell', async () => {
  await Student.updateOne({ _id: IDS.ann }, { name: '=HYPERLINK("http://x")' });
  await Student.updateOne({ _id: IDS.ben }, { name: 'Baker, Ben' });
  const res = await fetch(`${app.baseUrl}/api/courses/${IDS.courseAda}/reports/download`, { headers: { Authorization: `Bearer ${ada}` } });
  const text = await res.text();
  assert.ok(text.includes(`"'=HYPERLINK(""http://x"")"`), 'the formula is defused and quoted');
  assert.ok(text.includes('"Baker, Ben"'), 'the comma is quoted');
});

test('TC-20-30: a rating of all fives is flagged as a possible outlier; ordinary ratings are not', async () => {
  const s = byName((await app.request('GET', course(), { token: ada })).body.students);
  assert.equal(s.ann.evaluationDetails[0].aiFlags.allFive, true);
  assert.equal(s.ann.evaluationDetails[0].aiFlags.flagged, true);
  assert.equal(s.ben.evaluationDetails[0].aiFlags.flagged, false);
});

test('TC-22-20: feedback with a concerning word from the default list is flagged', async () => {
  const s = byName((await app.request('GET', course(), { token: ada })).body.students);
  assert.equal(s.di.evaluationDetails[0].aiFlags.concerning, true, '"lazy" is in the default list');
  assert.equal(s.cy.evaluationDetails[0].aiFlags.concerning, false);
});

test('TC-22-21: the professor\'s own word list decides what is flagged (FR-22)', async () => {
  await Professor.updateOne({ _id: IDS.ada }, { aiConcerningWords: ['steady'] });
  const s = byName((await app.request('GET', course(), { token: ada })).body.students);
  assert.equal(s.cy.evaluationDetails[0].aiFlags.concerning, true, '"steady" is now on the list');
  assert.equal(s.di.evaluationDetails[0].aiFlags.concerning, false, '"lazy" is no longer on it');
});

test('TC-17-26: another professor cannot read, generate or download this course\'s reports', async () => {
  const paths = [['GET', course()], ['POST', course('/generate')], ['GET', course('/download')],
    ['GET', course('/student/1001')], ['GET', course(`/team/${IDS.teamAlpha}`)]];
  for (const [method, path] of paths) {
    const res = await app.request(method, path, { token: bo, body: method === 'POST' ? {} : undefined });
    assert.equal(res.status, 404, `${method} ${path}`);
  }
});

test('TC-17-27: a team from another course gives 404 on this course\'s report, not that team\'s scores (CICD-51)', async () => {
  const res = await app.request('GET', `/api/courses/${IDS.courseBo}/reports/team/${IDS.teamAlpha}`, { token: bo });
  assert.equal(res.status, 404);
});
