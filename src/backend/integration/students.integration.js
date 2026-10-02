const test = require('node:test');
const assert = require('node:assert/strict');
const Student = require('../models/Student');
const Team = require('../models/Team');
const Evaluation = require('../models/Evaluation');
const { startDatabase, stopDatabase, clearDatabase } = require('./helpers/db');
const { startApp } = require('./helpers/app');
const { seed, IDS } = require('./helpers/seed');
const { assertCourseConsistent } = require('./helpers/consistency');
const { ORDINARY_RATINGS: RATINGS } = require('./helpers/evaluations');

// CW-04 roster management by hand: add, edit and remove students one at a time or in bulk. Each
// change touches the student, its team and the course counts, so each test ends by checking that
// they still agree.
let server;
let app;
let ada;
let bo;

const students = (courseId = IDS.courseAda) => `/api/courses/${courseId}/students`;
const NEW_STUDENT = { student_id: '1005', name: 'Fay Foster', email: 'fay@example.edu' };


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

test('TC-06-30: a student added to a new team creates the team and is a member on both sides', async () => {
  const res = await app.request('POST', students(), { token: ada, body: { ...NEW_STUDENT, group_assignment: 'Gamma' } });
  assert.equal(res.status, 201);
  const gamma = await Team.findOne({ course_id: IDS.courseAda, team_name: 'Gamma' });
  assert.ok(gamma);
  assert.deepEqual(gamma.students.map(String), [String(res.body.student._id)]);
  await assertCourseConsistent(IDS.courseAda);
});

test('TC-06-31: a student added with no team has no team and the counts follow', async () => {
  const res = await app.request('POST', students(), { token: ada, body: NEW_STUDENT });
  assert.equal(res.status, 201);
  assert.equal((await Student.findById(res.body.student._id)).team_id, null);
  await assertCourseConsistent(IDS.courseAda);
});

test('TC-06-32: the same student ID twice in a course gets 409; the same ID in another course is fine', async () => {
  await app.request('POST', students(), { token: ada, body: NEW_STUDENT });
  const duplicate = await app.request('POST', students(), { token: ada, body: NEW_STUDENT });
  assert.equal(duplicate.status, 409);
  assert.equal(await Student.countDocuments({ course_id: IDS.courseAda, student_id: '1005' }), 1);

  const other = await app.request('POST', students(IDS.courseBo), { token: bo, body: NEW_STUDENT });
  assert.equal(other.status, 201);
});

test('TC-06-33: a missing name, ID or email is refused and nothing is saved', async () => {
  for (const field of ['student_id', 'name', 'email']) {
    const { [field]: _omit, ...body } = NEW_STUDENT;
    const res = await app.request('POST', students(), { token: ada, body });
    assert.equal(res.status, 400, `without ${field}`);
  }
  assert.equal(await Student.countDocuments({ course_id: IDS.courseAda }), 4);
});

test('TC-06-34: moving a student to another team by editing keeps both teams consistent', async () => {
  const res = await app.request('PUT', `${students()}/${IDS.ann}`, { token: ada, body: { group_assignment: 'Beta' } });
  assert.equal(res.status, 200);
  const ann = await Student.findById(IDS.ann);
  assert.equal(String(ann.team_id), String(IDS.teamBeta));
  const alpha = await Team.findById(IDS.teamAlpha);
  assert.deepEqual(alpha.students.map(String), [String(IDS.ben)]);
  await assertCourseConsistent(IDS.courseAda);
});

test('TC-06-35: editing a student to a new team name creates that team', async () => {
  await app.request('PUT', `${students()}/${IDS.ann}`, { token: ada, body: { group_assignment: 'Gamma' } });
  assert.ok(await Team.findOne({ course_id: IDS.courseAda, team_name: 'Gamma' }));
  await assertCourseConsistent(IDS.courseAda);
});

test('TC-06-36: deleting a student removes them from their team and updates the counts', async () => {
  const res = await app.request('DELETE', `${students()}/${IDS.ann}`, { token: ada });
  assert.equal(res.status, 200);
  assert.equal(await Student.countDocuments({ _id: IDS.ann }), 0);
  assert.deepEqual((await Team.findById(IDS.teamAlpha)).students.map(String), [String(IDS.ben)]);
  await assertCourseConsistent(IDS.courseAda);
});

test('TC-06-37: bulk delete removes the students, the ratings about them, and fixes the teams and counts', async () => {
  await Evaluation.create({
    course_id: IDS.courseAda, student_id: IDS.ben, evaluator_id: IDS.ann, evaluation_token: 'a'.repeat(64),
    ratings: RATINGS, overall_feedback: 'Reliable and prepared every week.',
  });
  const res = await app.request('POST', `${students()}/bulk-delete`, { token: ada, body: { student_ids: [String(IDS.ben), String(IDS.cy)] } });
  assert.equal(res.status, 200);
  assert.equal(res.body.deleted_count, 2);
  assert.equal(await Evaluation.countDocuments({ student_id: IDS.ben }), 0, 'ratings about a deleted student go too');
  await assertCourseConsistent(IDS.courseAda);
});

test('TC-06-38: bulk delete never touches another course, even when given its students\' IDs', async () => {
  const res = await app.request('POST', `${students()}/bulk-delete`, { token: ada, body: { student_ids: [String(IDS.eve)] } });
  assert.equal(res.status, 200);
  assert.equal(res.body.deleted_count, 0);
  assert.equal(await Student.countDocuments({ _id: IDS.eve }), 1);
});

test('TC-06-39: another professor cannot add, edit or delete students in the course', async () => {
  const add = await app.request('POST', students(), { token: bo, body: NEW_STUDENT });
  const edit = await app.request('PUT', `${students()}/${IDS.ann}`, { token: bo, body: { name: 'Hijacked' } });
  const del = await app.request('DELETE', `${students()}/${IDS.ann}`, { token: bo });
  assert.deepEqual([add.status, edit.status, del.status], [404, 404, 404]);
  assert.equal((await Student.findById(IDS.ann)).name, 'Ann Archer');
  assert.equal(await Student.countDocuments({ course_id: IDS.courseAda }), 4);
});

test('TC-06-40: the student list does not leak another course\'s students', async () => {
  const list = await app.request('GET', students(), { token: ada });
  assert.equal(list.status, 200);
  assert.ok(list.body.every((s) => String(s.course_id) === String(IDS.courseAda)));
});

// CICD-46: editing only a name or email used to remove the student from Team.students while
// Student.team_id stayed set, so the two sides disagreed and the student vanished from the team.
test('TC-06-41: editing only the name or email keeps the student in their team, on both sides', async () => {
  for (const body of [{ name: 'Ann A. Archer' }, { email: 'ann.archer@example.edu' }, { student_id: '1001A' }]) {
    const res = await app.request('PUT', `${students()}/${IDS.ann}`, { token: ada, body });
    assert.equal(res.status, 200);
    const ann = await Student.findById(IDS.ann);
    assert.equal(String(ann.team_id), String(IDS.teamAlpha));
    const alpha = await Team.findById(IDS.teamAlpha);
    assert.deepEqual(alpha.students.map(String).sort(), [String(IDS.ann), String(IDS.ben)].sort());
    await assertCourseConsistent(IDS.courseAda);
  }
});

test('TC-06-42: a body with only a team_id (which edits ignore) changes nothing', async () => {
  const res = await app.request('PUT', `${students()}/${IDS.ann}`, { token: ada, body: { team_id: String(IDS.teamBeta) } });
  assert.equal(res.status, 200);
  assert.equal(String((await Student.findById(IDS.ann)).team_id), String(IDS.teamAlpha));
  await assertCourseConsistent(IDS.courseAda);
});

test('TC-06-43: clearing the team on purpose (group_assignment null or empty) removes the student from it on both sides', async () => {
  for (const value of [null, '']) {
    await app.request('POST', `/api/courses/${IDS.courseAda}/teams/${IDS.teamAlpha}/students/${IDS.ann}`, { token: ada });
    const res = await app.request('PUT', `${students()}/${IDS.ann}`, { token: ada, body: { group_assignment: value } });
    assert.equal(res.status, 200);
    assert.equal((await Student.findById(IDS.ann)).team_id, null);
    assert.deepEqual((await Team.findById(IDS.teamAlpha)).students.map(String), [String(IDS.ben)]);
    await assertCourseConsistent(IDS.courseAda);
  }
});

test('TC-06-44: a student with no team stays without one when only their name is edited', async () => {
  const res = await app.request('PUT', `${students()}/${IDS.ann}`, { token: ada, body: { group_assignment: null } });
  assert.equal(res.status, 200);
  await app.request('PUT', `${students()}/${IDS.ann}`, { token: ada, body: { name: 'Ann Again' } });
  assert.equal((await Student.findById(IDS.ann)).team_id, null);
  await assertCourseConsistent(IDS.courseAda);
});
