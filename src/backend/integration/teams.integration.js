const test = require('node:test');
const assert = require('node:assert/strict');
const Student = require('../models/Student');
const Team = require('../models/Team');
const { startDatabase, stopDatabase, clearDatabase } = require('./helpers/db');
const { startApp, deadlineBody } = require('./helpers/app');
const { seed, IDS } = require('./helpers/seed');
const { assertCourseConsistent } = require('./helpers/consistency');

// CW-05 team assignment. Membership lives in Team.students and in Student.team_id, so every test
// ends by checking the two sides and the counts still agree (D-10).
let server;
let app;
let ada;
let bo;

const teams = (courseId = IDS.courseAda) => `/api/courses/${courseId}/teams`;

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
});

test('TC-08-61: a team is created only with a numbered name: Team 4, team 5 and 6 are Team 4, Team 5 and Team 6; Alpha is refused', async () => {
  const before = await Team.countDocuments({ course_id: IDS.courseAda });
  for (const name of ['Alpha', 'Team A', 'Team 0', '']) {
    const res = await app.request('POST', teams(), { token: ada, body: { teams: [{ team_name: name }] } });
    assert.equal(res.status, 400, JSON.stringify(name));
  }
  // One bad name in a list refuses the whole list.
  assert.equal((await app.request('POST', teams(), { token: ada, body: { teams: [{ team_name: 'Team 8' }, { team_name: 'Beta' }] } })).status, 400);
  assert.equal(await Team.countDocuments({ course_id: IDS.courseAda }), before);

  const res = await app.request('POST', teams(), { token: ada, body: { teams: [{ team_name: 'Team 4' }, { team_name: 'team 5' }, { team_name: '6' }] } });
  assert.equal(res.status, 201);
  const names = (await Team.find({ course_id: IDS.courseAda })).map((team) => team.team_name).sort();
  assert.deepEqual(names, ['Team 1', 'Team 2', 'Team 4', 'Team 5', 'Team 6']);
});

test('TC-08-62: a team can be renamed only to a numbered name, and its students follow', async () => {
  const refused = await app.request('PUT', `${teams()}/${IDS.teamAlpha}`, { token: ada, body: { team_name: 'Alpha Squad' } });
  assert.equal(refused.status, 400);
  assert.match(refused.body.error.message, /Team 1, Team 2, Team 3/);
  assert.equal((await Team.findById(IDS.teamAlpha)).team_name, 'Team 1');

  const renamed = await app.request('PUT', `${teams()}/${IDS.teamAlpha}`, { token: ada, body: { team_name: 'team 7' } });
  assert.equal(renamed.status, 200);
  assert.equal((await Team.findById(IDS.teamAlpha)).team_name, 'Team 7');
  assert.ok((await Student.find({ team_id: IDS.teamAlpha })).every((student) => student.group_assignment === 'Team 7'));
  await assertCourseConsistent(IDS.courseAda);
});

test('TC-08-63: a team named before the rule (Alpha) can still be edited, as long as its name is left alone', async () => {
  const legacy = await Team.create({ team_name: 'Alpha', course_id: IDS.courseAda, students: [], student_count: 0 });

  const status = await app.request('PUT', `${teams()}/${legacy._id}`, { token: ada, body: { team_status: 'Inactive' } });
  assert.equal(status.status, 200);
  const same = await app.request('PUT', `${teams()}/${legacy._id}`, { token: ada, body: { team_name: 'Alpha', team_status: 'Active' } });
  assert.equal(same.status, 200);
  assert.equal((await Team.findById(legacy._id)).team_name, 'Alpha');

  assert.equal((await app.request('PUT', `${teams()}/${legacy._id}`, { token: ada, body: { team_name: 'Beta' } })).status, 400);
  assert.equal((await app.request('PUT', `${teams()}/${legacy._id}`, { token: ada, body: { team_name: 'Team 9' } })).status, 200);
});

test('TC-08-20: the seeded course is consistent to begin with', async () => {
  await assertCourseConsistent(IDS.courseAda);
  await assertCourseConsistent(IDS.courseBo);
});

test('TC-08-21: a team is created empty and the course team count follows', async () => {
  const res = await app.request('POST', teams(), { token: ada, body: { teams: [{ team_name: 'Team 3' }, { team_name: 'Team 4' }] } });
  assert.equal(res.status, 201);
  assert.equal(res.body.teams.length, 2);
  await assertCourseConsistent(IDS.courseAda);
});

test('TC-08-22: a team with a blank name, or with members in the request, is refused and nothing is saved', async () => {
  const blank = await app.request('POST', teams(), { token: ada, body: { teams: [{ team_name: '  ' }] } });
  const members = await app.request('POST', teams(), { token: ada, body: { teams: [{ team_name: 'Team 3', students: [String(IDS.ann)] }] } });
  assert.equal(blank.status, 400);
  assert.equal(members.status, 400);
  assert.equal(await Team.countDocuments({ course_id: IDS.courseAda }), 2);
});

test('TC-08-23: adding a student to a team moves them out of their old team, on both sides', async () => {
  const res = await app.request('POST', `${teams()}/${IDS.teamBeta}/students/${IDS.ann}`, { token: ada });
  assert.equal(res.status, 200);
  assert.equal(String((await Student.findById(IDS.ann)).team_id), String(IDS.teamBeta));
  assert.equal((await Student.findById(IDS.ann)).group_assignment, 'Team 2');
  assert.deepEqual((await Team.findById(IDS.teamAlpha)).students.map(String), [String(IDS.ben)]);
  await assertCourseConsistent(IDS.courseAda);
});

test('TC-08-24: adding a student who is already in the team gets 409 and changes nothing', async () => {
  const res = await app.request('POST', `${teams()}/${IDS.teamAlpha}/students/${IDS.ann}`, { token: ada });
  assert.equal(res.status, 409);
  await assertCourseConsistent(IDS.courseAda);
});

test('TC-08-25: a student from another course cannot be put in this course\'s team', async () => {
  const res = await app.request('POST', `${teams()}/${IDS.teamAlpha}/students/${IDS.eve}`, { token: ada });
  assert.equal(res.status, 404);
  assert.equal((await Student.findById(IDS.eve)).team_id, null);
  await assertCourseConsistent(IDS.courseAda);
});

test('TC-08-26: removing a student from a team clears both sides', async () => {
  const res = await app.request('DELETE', `${teams()}/${IDS.teamAlpha}/students/${IDS.ann}`, { token: ada });
  assert.equal(res.status, 200);
  assert.equal((await Student.findById(IDS.ann)).team_id, null);
  await assertCourseConsistent(IDS.courseAda);
});

test('TC-08-27: renaming a team renames it for its students too', async () => {
  const res = await app.request('PUT', `${teams()}/${IDS.teamAlpha}`, { token: ada, body: { team_name: 'Team 7' } });
  assert.equal(res.status, 200);
  const members = await Student.find({ team_id: IDS.teamAlpha });
  assert.equal(members.length, 2);
  assert.ok(members.every((s) => s.group_assignment === 'Team 7'));
});

test('TC-08-28: a team with students cannot be deleted; an empty one can, and the count follows', async () => {
  const blocked = await app.request('DELETE', `${teams()}/${IDS.teamAlpha}`, { token: ada });
  assert.equal(blocked.status, 409);
  await app.request('DELETE', `${teams()}/${IDS.teamAlpha}/students/${IDS.ann}`, { token: ada });
  await app.request('DELETE', `${teams()}/${IDS.teamAlpha}/students/${IDS.ben}`, { token: ada });
  const ok = await app.request('DELETE', `${teams()}/${IDS.teamAlpha}`, { token: ada });
  assert.equal(ok.status, 200);
  await assertCourseConsistent(IDS.courseAda);
});

test('TC-08-29: clearing all teams unassigns every student and zeroes the team count', async () => {
  const res = await app.request('DELETE', teams(), { token: ada });
  assert.equal(res.status, 200);
  assert.equal(res.body.teams_deleted, 2);
  assert.equal(await Student.countDocuments({ course_id: IDS.courseAda, team_id: { $ne: null } }), 0);
  await assertCourseConsistent(IDS.courseAda);
});

test('TC-08-30: the team list shows members without their evaluation links', async () => {
  await app.request('POST', `/api/courses/${IDS.courseAda}/evaluations/send`, { token: ada, body: deadlineBody() });
  const res = await app.request('GET', teams(), { token: ada });
  assert.equal(res.status, 200);
  const members = res.body.flatMap((t) => t.students);
  assert.equal(members.length, 4);
  assert.ok(members.every((s) => s.evaluation_token === undefined));
});

test('TC-08-31: another professor cannot read, create or change this course\'s teams', async () => {
  const list = await app.request('GET', teams(), { token: bo });
  const create = await app.request('POST', teams(), { token: bo, body: { teams: [{ team_name: 'Rogue' }] } });
  const move = await app.request('POST', `${teams()}/${IDS.teamBeta}/students/${IDS.ann}`, { token: bo });
  assert.deepEqual([list.status, create.status, move.status], [404, 404, 404]);
  assert.equal(await Team.countDocuments({ course_id: IDS.courseAda }), 2);
  await assertCourseConsistent(IDS.courseAda);
});

// Behaviour today, not a decision: auto-assign is advertised in the workflow document but is not
// implemented. If it is built, replace this test with real ones.
test('TC-08-32: auto-assign is currently not implemented (501)', async () => {
  const res = await app.request('POST', `${teams()}/auto-assign`, { token: ada, body: {} });
  assert.equal(res.status, 501);
});

test('TC-08-33: a roster upload with teams leaves every course consistent', async () => {
  const csv = ['student_id,name,email,group_assignment', '1005,Fay Foster,fay@example.edu,Team 1', '1006,Gus Green,gus@example.edu,Team 3', ''].join('\n');
  const res = await app.uploadCsv(`/api/courses/${IDS.courseAda}/roster`, csv, { token: ada });
  assert.equal(res.status, 200);
  await assertCourseConsistent(IDS.courseAda);
});

test('TC-08-34: the API takes { teams: [...] } and refuses a bare array, which the Create Team dialog used to send (CICD-52)', async () => {
  const bare = await app.request('POST', teams(), { token: ada, body: [{ team_name: 'Team 3' }] });
  assert.equal(bare.status, 400);
  const wrapped = await app.request('POST', teams(), { token: ada, body: { teams: [{ team_name: 'Team 3', team_status: 'Active' }] } });
  assert.equal(wrapped.status, 201);
  await assertCourseConsistent(IDS.courseAda);
});
