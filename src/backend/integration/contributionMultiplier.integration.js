const test = require('node:test');
const assert = require('node:assert/strict');
const Student = require('../models/Student');
const Team = require('../models/Team');
const { startDatabase, stopDatabase, clearDatabase } = require('./helpers/db');
const { startApp } = require('./helpers/app');
const { seed, IDS } = require('./helpers/seed');
const { seedEvaluations } = require('./helpers/evaluations');

// CICD-81: the Contribution Multiplier as a third report method, and the instructor's team grade. The seeded
// evaluations (helpers/evaluations.js) give the scores Ann 100, Ben 76.67 in Team 1 and Cy 90, Di 56.67 in Team 2,
// one rating each, so the worked numbers are:
//   Team 1: team grade 100 (the highest score). Ann 100/76.67 is capped at 1 -> 100. Ben 76.67/100 = 0.7667 -> 76.67, rounded to 75.
//   Team 2: team grade 90. Cy -> 90. Di 56.67/90 = 0.6296 -> 56.67, rounded to 55: no
//   floor, so that is her grade, and she is flagged for the instructor (below 70). Final grades go in steps of 5.
let server;
let app;
let ada;
let bo;

const report = (query = '?gradingMethod=multiplier') => `/api/courses/${IDS.courseAda}/reports${query}`;
const gradeUrl = (teamId, courseId = IDS.courseAda) => `/api/courses/${courseId}/teams/${teamId}/grade`;
const byName = (students) => Object.fromEntries(students.map((s) => [s.name.split(' ')[0].toLowerCase(), s]));
const near = (actual, expected, message) => assert.ok(Math.abs(actual - expected) < 0.011, `${message}: ${actual} vs ${expected}`);
const teamNamed = (body, name) => body.teams.find((team) => team.team_name === name);

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

test('TC-17-62: the multiplier method gives each student a score, multiplier, team grade and final grade; the other fields stay as they were', async () => {
  const res = await app.request('GET', report(), { token: ada });
  assert.equal(res.status, 200);
  assert.equal(res.body.gradingMethod, 'multiplier');
  assert.deepEqual(res.body.gradingSettings, { cap: 1, flagBelow: 70 });
  const s = byName(res.body.students);
  near(s.ann.finalScore, 100, 'Ann');
  near(s.ben.finalScore, 75, 'Ben');
  near(s.cy.finalScore, 90, 'Cy');
  near(s.di.finalScore, 55, 'Di (no floor)');
  assert.deepEqual([s.ann.flagged, s.ben.flagged, s.cy.flagged, s.di.flagged], [false, false, false, true]);
  assert.equal(res.body.summary.flaggedStudents, 1);
  near(s.ben.multiplier, 0.7667, 'Ben multiplier');
  near(s.di.multiplier, 0.6296, 'Di multiplier');
  assert.equal(s.ann.multiplier, 1);
  assert.equal(s.ben.teamGrade, 100);
  assert.equal(s.di.teamGrade, 90);
  assert.equal(s.ben.teamGradeSource, 'automatic');
  near(s.ben.contributionScore, 76.67, 'Ben contribution score');
  // The pooled mean is still there for everyone, and the letter grade follows the final grade.
  near(s.ben.originalScore, 76.67, 'Ben original');
  near(s.di.originalScore, 56.67, 'Di original');
  assert.deepEqual([s.ann.letterGrade, s.ben.letterGrade, s.cy.letterGrade, s.di.letterGrade], ['A', 'C', 'A', 'F']);
});

test('TC-17-63: the teams carry their grade, where it came from, and the grade the app would propose', async () => {
  const { body } = await app.request('GET', report(), { token: ada });
  assert.equal(teamNamed(body, 'Team 1').teamGrade, 100);
  assert.equal(teamNamed(body, 'Team 2').teamGrade, 90);
  assert.equal(teamNamed(body, 'Team 2').teamGradeSource, 'automatic');
  assert.equal(teamNamed(body, 'Team 2').automaticTeamGrade, 90);
  assert.equal(teamNamed(body, 'Team 2').team_grade, null);
  // The other methods do not get the multiplier fields.
  const curved = (await app.request('GET', report(''), { token: ada })).body;
  assert.equal(curved.gradingMethod, 'curved');
  assert.equal(curved.students[0].multiplier, undefined);
  assert.equal(curved.students[0].flagged, undefined);
  assert.equal(curved.summary.flaggedStudents, undefined);
  assert.equal(teamNamed(curved, 'Team 2').teamGrade, undefined);
});

test('TC-17-64: the instructor sets a team grade, the report uses it, and null returns to the automatic one', async () => {
  const set = await app.request('PUT', gradeUrl(IDS.teamBeta), { token: ada, body: { team_grade: 80 } });
  assert.equal(set.status, 200);
  assert.equal(set.body.team.team_grade, 80);
  assert.equal((await Team.findById(IDS.teamBeta)).team_grade, 80);

  let res = await app.request('GET', report(), { token: ada });
  let s = byName(res.body.students);
  near(s.cy.finalScore, 80, 'Cy');
  near(s.di.finalScore, 50, 'Di');
  assert.equal(s.di.flagged, true);
  assert.equal(s.cy.teamGrade, 80);
  assert.equal(s.cy.teamGradeSource, 'instructor');
  assert.equal(teamNamed(res.body, 'Team 2').teamGradeSource, 'instructor');
  assert.equal(teamNamed(res.body, 'Team 2').automaticTeamGrade, 90);
  // Team 1 is not affected.
  assert.equal(s.ben.teamGradeSource, 'automatic');

  const cleared = await app.request('PUT', gradeUrl(IDS.teamBeta), { token: ada, body: { team_grade: null } });
  assert.equal(cleared.status, 200);
  assert.equal(cleared.body.team.team_grade, null);
  res = await app.request('GET', report(), { token: ada });
  s = byName(res.body.students);
  assert.equal(s.cy.teamGrade, 90);
  assert.equal(s.cy.teamGradeSource, 'automatic');
});

test('TC-17-65: a team grade is a number from 0 to 100; anything else is refused and nothing is saved', async () => {
  for (const body of [{ team_grade: 101 }, { team_grade: -1 }, { team_grade: '90' }, { team_grade: true }, { team_grade: [90] }, { team_grade: { $gt: 0 } }, {}, { grade: 90 }]) {
    const res = await app.request('PUT', gradeUrl(IDS.teamAlpha), { token: ada, body });
    assert.equal(res.status, 400, JSON.stringify(body));
    assert.equal(res.body.error.code, 'VALIDATION_ERROR');
  }
  assert.equal((await Team.findById(IDS.teamAlpha)).team_grade, null);
  for (const value of [0, 100, 87.5]) {
    assert.equal((await app.request('PUT', gradeUrl(IDS.teamAlpha), { token: ada, body: { team_grade: value } })).status, 200, String(value));
  }
  assert.equal((await Team.findById(IDS.teamAlpha)).team_grade, 87.5);
  assert.equal((await app.request('PUT', gradeUrl('not-an-id'), { token: ada, body: { team_grade: 90 } })).status, 400);
});

test('TC-17-66: only the course\'s own professor can set a team grade, and only on a team of that course', async () => {
  assert.equal((await app.request('PUT', gradeUrl(IDS.teamAlpha), { body: { team_grade: 50 } })).status, 401);
  // Another professor: the course is not theirs.
  assert.equal((await app.request('PUT', gradeUrl(IDS.teamAlpha), { token: bo, body: { team_grade: 50 } })).status, 404);
  // Own course, but the team belongs to another course (CICD-51 and CICD-45): not found, and the team is untouched.
  const other = await Team.create({ team_name: 'Team 1', course_id: IDS.courseBo, students: [IDS.eve], student_count: 1 });
  const res = await app.request('PUT', gradeUrl(other._id, IDS.courseAda), { token: ada, body: { team_grade: 50 } });
  assert.equal(res.status, 404);
  assert.equal((await Team.findById(other._id)).team_grade, null);
  assert.equal((await Team.findById(IDS.teamAlpha)).team_grade, null);
});

test('TC-17-67: a student without a team is graded alone: their own score and a multiplier of 1', async () => {
  await Student.updateOne({ _id: IDS.ben }, { $unset: { team_id: 1, group_assignment: 1 } });
  const s = byName((await app.request('GET', report(), { token: ada })).body.students);
  near(s.ben.finalScore, 75, 'Ben');
  assert.equal(s.ben.multiplier, 1);
  near(s.ben.teamGrade, 76.67, 'Ben team grade');
  near(s.ann.finalScore, 100, 'Ann');
});

test('TC-17-68: a student nobody rated has no grade, and a team where nobody was rated has no automatic grade', async () => {
  const Evaluation = require('../models/Evaluation');
  await Evaluation.deleteMany({ student_id: { $in: [IDS.cy, IDS.di] } });
  const res = await app.request('GET', report(), { token: ada });
  const s = byName(res.body.students);
  assert.equal(s.cy.letterGrade, 'No evaluations');
  assert.equal(s.cy.contributionScore, null);
  assert.equal(s.cy.finalScore, 0);
  assert.equal(teamNamed(res.body, 'Team 2').teamGrade, null);
  // The instructor can still enter a grade; the students without ratings stay without a grade.
  await app.request('PUT', gradeUrl(IDS.teamBeta), { token: ada, body: { team_grade: 85 } });
  const typed = await app.request('GET', report(), { token: ada });
  assert.equal(teamNamed(typed.body, 'Team 2').teamGrade, 85);
  assert.equal(byName(typed.body.students).cy.letterGrade, 'No evaluations');
});

test('TC-17-69: the CSV export for the multiplier method has the team grade, its source, the multiplier and the flag', async () => {
  const res = await fetch(`${app.baseUrl}${report('/download?gradingMethod=multiplier')}`, { headers: { Authorization: `Bearer ${ada}` } });
  assert.equal(res.status, 200);
  const lines = (await res.text()).split('\n');
  assert.equal(lines[0], 'Student ID,Name,Email,Team,Original Score,Contribution Score,Team Grade,Team Grade Source,Multiplier,Final Score,Letter Grade,Evaluations Received,Flag');
  assert.equal(lines.length, 5);
  assert.ok(lines.includes('1002,Ben Baker,ben@example.edu,Team 1,76.67,76.67,100,automatic,0.7667,75,C,1,'));
  assert.ok(lines.includes('1004,Di Diaz,di@example.edu,Team 2,56.67,56.67,90,automatic,0.6296,55,F,1,Review: grade below 70'));
});

test('TC-17-70: before anyone has submitted an evaluation the report still lists the teams, so the instructor can set a team grade', async () => {
  const Evaluation = require('../models/Evaluation');
  await Evaluation.deleteMany({});
  let res = await app.request('GET', report(), { token: ada });
  assert.equal(res.status, 200);
  assert.equal(res.body.gradingMethod, 'multiplier');
  assert.equal(res.body.summary.totalStudents, 4);
  assert.equal(res.body.summary.studentsWithEvaluations, 0);
  assert.equal(res.body.students.length, 4);
  assert.ok(res.body.students.every((s) => s.letterGrade === 'No evaluations' && s.multiplier === null && s.finalScore === 0));
  assert.deepEqual(res.body.teams.map((t) => [t.team_name, t.teamGrade, t.teamGradeSource]).sort(), [['Team 1', null, null], ['Team 2', null, null]]);

  await app.request('PUT', gradeUrl(IDS.teamBeta), { token: ada, body: { team_grade: 85 } });
  res = await app.request('GET', report(), { token: ada });
  assert.equal(teamNamed(res.body, 'Team 2').teamGrade, 85);
  assert.equal(teamNamed(res.body, 'Team 2').teamGradeSource, 'instructor');
  assert.equal(teamNamed(res.body, 'Team 1').teamGrade, null);
  // Students nobody rated still have no grade.
  assert.ok(res.body.students.every((s) => s.letterGrade === 'No evaluations'));

  await app.request('PUT', gradeUrl(IDS.teamBeta), { token: ada, body: { team_grade: null } });
  res = await app.request('GET', report(), { token: ada });
  assert.equal(teamNamed(res.body, 'Team 2').teamGrade, null);
});
