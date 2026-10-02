const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const Student = require('../models/Student');
const Team = require('../models/Team');
const Course = require('../models/Course');
const { updateStudent } = require('../controllers/studentController');

// CICD-45 (API-4): updateStudent passed the whole request body to the database, so a
// caller could move a student to another course, plant an evaluation link token,
// mark an evaluation completed, or point team_id at another course's team.
// No database: model calls are stubbed and recorded; the controller logic runs for real.
const courseId = String(new mongoose.Types.ObjectId());
const otherCourseId = String(new mongoose.Types.ObjectId());
const studentId = String(new mongoose.Types.ObjectId());
const foreignTeam = new mongoose.Types.ObjectId();
const myTeam = { _id: new mongoose.Types.ObjectId(), team_name: 'Team A' };

function stub(t) {
  const seen = { teamUpdates: [] };
  t.mock.method(Student, 'findOne', async () => ({ _id: studentId, team_id: null }));
  t.mock.method(Student, 'findOneAndUpdate', async (filter, update) => {
    seen.filter = filter;
    seen.update = update;
    return { _id: studentId, ...update };
  });
  t.mock.method(Student, 'countDocuments', async () => 1);
  t.mock.method(Team, 'findOne', async (filter) => {
    seen.teamFilter = filter;
    return filter.team_name === 'Team A' ? myTeam : null;
  });
  t.mock.method(Team, 'findByIdAndUpdate', async (id, update) => { seen.teamUpdates.push([id, update]); return {}; });
  t.mock.method(Team, 'countDocuments', async () => 1);
  t.mock.method(Team.prototype, 'save', async function save() { return this; });
  t.mock.method(Course, 'findByIdAndUpdate', async () => ({}));
  t.mock.method(console, 'log', () => {});
  return seen;
}

async function update(t, body) {
  const seen = stub(t);
  let error;
  let result;
  await updateStudent(
    { params: { course_id: courseId, student_id: studentId }, body },
    { status() { return this; }, json(data) { result = data; } },
    (err) => { error = err; },
  );
  return { seen, error, result };
}

test('TC-05-01: a student update keeps only the editable fields', async (t) => {
  const { seen, error } = await update(t, {
    name: 'New Name',
    email: 'new@example.com',
    student_id: 'S99',
    course_id: otherCourseId,
    evaluation_token: 'planted',
    evaluation_token_expires_at: '2099-01-01',
    evaluation_completed: true,
    team_id: String(foreignTeam),
    created_at: '2001-01-01',
    _id: String(new mongoose.Types.ObjectId()),
  });
  assert.equal(error, undefined);
  assert.deepEqual(seen.update, { name: 'New Name', email: 'new@example.com', student_id: 'S99' });
  assert.equal(String(seen.filter.course_id), courseId, 'the student is still looked up in the URL course');
});

test('TC-05-02: a team set through the body is ignored; the team comes from group_assignment in this course', async (t) => {
  const { seen } = await update(t, { group_assignment: 'Team A', team_id: String(foreignTeam) });
  assert.equal(String(seen.update.team_id), String(myTeam._id));
  assert.equal(seen.update.group_assignment, 'Team A');
  assert.equal(String(seen.teamFilter.course_id), courseId, 'the team is found within the URL course');
});

test('TC-05-03: clearing the team still works', async (t) => {
  const { seen } = await update(t, { group_assignment: '' });
  assert.equal(seen.update.team_id, null);
  assert.equal(seen.update.group_assignment, null);
});

test('TC-05-04: a team_id alone, with no group_assignment, changes nothing', async (t) => {
  const { seen, error } = await update(t, { team_id: String(foreignTeam) });
  assert.equal(error, undefined);
  assert.deepEqual(seen.update, {});
});

test('TC-05-05: fields that are not strings are rejected and nothing is saved', async (t) => {
  for (const body of [{ name: { $ne: null } }, { email: ['a@b.c'] }, { student_id: 12 }, { group_assignment: { $gt: '' } }]) {
    const { seen, error } = await update(t, body);
    assert.equal(error.status, 400, JSON.stringify(body));
    assert.equal(error.code, 'VALIDATION_ERROR');
    assert.equal(seen.update, undefined);
  }
});
