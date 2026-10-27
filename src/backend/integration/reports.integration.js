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

test('TC-17-20: with the regular method each student\'s score is the mean of the ratings they received, as a percentage with a letter', async () => {
  const res = await app.request('GET', course('?gradingMethod=mean'), { token: ada });
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

test('TC-17-21: the course summary counts students and grades from the same numbers (regular method)', async () => {
  const { summary } = (await app.request('GET', course('?gradingMethod=mean'), { token: ada })).body;
  assert.equal(summary.totalStudents, 4);
  assert.equal(summary.studentsWithEvaluations, 4);
  near(summary.averageScore, 80.835, 'course average');
  assert.deepEqual(summary.gradeDistribution, { A: 2, B: 0, C: 1, D: 0, F: 1 });
});

test('TC-17-22: team averages are the mean of the members\' scores (regular method)', async () => {
  const { teams } = (await app.request('GET', course('?gradingMethod=mean'), { token: ada })).body;
  const byTeam = Object.fromEntries(teams.map((t) => [t.team_name, t]));
  near(byTeam['Team 1'].averageScore, 88.335, 'Team 1');
  near(byTeam['Team 2'].averageScore, 73.335, 'Team 2');
  assert.equal(byTeam['Team 1'].students.length, 2);
});

test('TC-17-23: the team report matches the course report for that team', async () => {
  const res = await app.request('GET', course(`/team/${IDS.teamBeta}`), { token: ada });
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.members.map((m) => m.name).sort(), ['Cy Cole', 'Di Diaz']);
  near(res.body.teamAverage, 73.335, 'team average');
});

test('TC-18-20: a student report shows the score, ratings received and ratings given', async () => {
  const res = await app.request('GET', course('/student/1002'), { token: ada });
  assert.equal(res.status, 200);
  assert.equal(res.body.meanScore, EXPECTED_SCORES.ben);
  assert.equal(res.body.evaluationsReceived, 1);
  assert.equal(res.body.evaluationsGiven, 1);
  assert.equal(res.body.detailedEvaluations.length, 1);
});

// CICD-75: curved grading with a target mean of 85 and a target standard deviation of 20, and it is the default.
// Raw scores 100, 76.67, 90 and 56.67 have mean 80.84 and population standard deviation 16.22, so
// 85 + 20 x z gives Ann 108.63 (capped at 100), Ben 79.86, Cy 96.30 and Di 55.21 (worked out separately from the code).
test('TC-17-24: curved grading, the default, standardises the class to mean 85 and deviation 20, capped at 100', async () => {
  const res = await app.request('GET', course(), { token: ada });
  assert.equal(res.status, 200);
  assert.equal(res.body.gradingMethod, 'curved');
  const s = byName(res.body.students);
  assert.equal(s.ann.finalScore, 100);
  near(s.ben.finalScore, 79.86, 'Ben');
  near(s.cy.finalScore, 96.3, 'Cy');
  near(s.di.finalScore, 55.21, 'Di');
  assert.deepEqual(
    [s.ann.letterGrade, s.ben.letterGrade, s.cy.letterGrade, s.di.letterGrade],
    ['A', 'C', 'A', 'F']
  );
  near(s.ben.originalScore, 76.67, 'Ben original');
  assert.equal(res.body.gradingSettings.targetMean, 85);
  assert.equal(res.body.gradingSettings.targetStandardDeviation, 20);
  assert.equal(res.body.gradingSettings.curveApplied, true);
  near(res.body.gradingSettings.classStats.mean, 80.84, 'class mean');
  near(res.body.gradingSettings.classStats.standardDeviation, 16.22, 'class standard deviation');
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

test('TC-19-20: the CSV export has one row per student with the same scores as the report (regular method)', async () => {
  const res = await fetch(`${app.baseUrl}/api/courses/${IDS.courseAda}/reports/download?gradingMethod=mean`, { headers: { Authorization: `Bearer ${ada}` } });
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /text\/csv/);
  assert.match(res.headers.get('content-disposition'), /attachment; filename="course_.*_report\.csv"/);

  const lines = (await res.text()).split('\n');
  assert.equal(lines[0], 'Student ID,Name,Email,Team,Original Score,Final Score,Letter Grade,Evaluations Received,Improvement');
  assert.equal(lines.length, 5);
  assert.ok(lines.includes('1002,Ben Baker,ben@example.edu,Team 1,76.67,76.67,C,1,0'));
  assert.ok(lines.includes('1004,Di Diaz,di@example.edu,Team 2,56.67,56.67,F,1,0'));
});

test('TC-19-22: the CSV export applies the grading method like the report does: curved unless the query says otherwise', async () => {
  const res = await fetch(`${app.baseUrl}/api/courses/${IDS.courseAda}/reports/download`, { headers: { Authorization: `Bearer ${ada}` } });
  assert.equal(res.status, 200);
  const rows = Object.fromEntries((await res.text()).split('\n').slice(1).map((line) => {
    const cells = line.split(',');
    return [cells[1].split(' ')[0].toLowerCase(), cells];
  }));
  // Columns: ..., 4 Original Score, 5 Final Score, 8 Improvement (final minus original).
  near(Number(rows.ben[4]), 76.67, 'Ben original');
  near(Number(rows.ben[5]), 79.86, 'Ben curved');
  near(Number(rows.ben[8]), 3.19, 'Ben change');
  near(Number(rows.di[5]), 55.21, 'Di curved');
  near(Number(rows.cy[5]), 96.3, 'Cy curved');
  assert.equal(Number(rows.ann[5]), 100);
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
