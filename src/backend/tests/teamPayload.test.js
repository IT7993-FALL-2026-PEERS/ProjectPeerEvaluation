const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const Team = require('../models/Team');
const Student = require('../models/Student');
const Course = require('../models/Course');
const { createTeams, updateTeam, listTeams } = require('../controllers/teamController');

// CICD-45: the URL ownership check (courseOwner middleware) only covers :course_id.
// What a request body carries was trusted: a team could be built from, or moved to,
// another course, and the team list handed out each student's evaluation link token.
// No database: model calls are stubbed and recorded; the controller logic runs for real.
const courseId = String(new mongoose.Types.ObjectId());
const otherCourseId = String(new mongoose.Types.ObjectId());
const mine = [new mongoose.Types.ObjectId(), new mongoose.Types.ObjectId()];
const foreign = new mongoose.Types.ObjectId();

async function call(handler, req) {
  let error;
  let body;
  let status;
  const res = { status(code) { status = code; return this; }, json(data) { body = data; } };
  await handler(req, res, (err) => { error = err; });
  return { error, body, status };
}

function stubCreate(t) {
  const inserted = [];
  t.mock.method(Team, 'insertMany', async (docs) => {
    inserted.push(...docs);
    return docs.map((d) => ({ ...d, _id: new mongoose.Types.ObjectId() }));
  });
  t.mock.method(Team, 'countDocuments', async () => inserted.length);
  t.mock.method(Course, 'findByIdAndUpdate', async () => ({}));
  t.mock.method(console, 'log', () => {});
  return inserted;
}

// A team body that lists students used to be saved as sent: students of another
// course could be put in a team, and only Team.students was written, never
// Student.team_id, so the two records disagreed. Teams are now created empty and
// members go through the add-student endpoint, which checks the course.
test('TC-08-01: creating a team with students of another course is rejected and nothing is saved', async (t) => {
  const inserted = stubCreate(t);
  const { error } = await call(createTeams, {
    params: { course_id: courseId },
    body: { teams: [{ team_name: 'Team A', students: [mine[0], foreign] }] },
  });
  assert.equal(error.status, 400);
  assert.equal(error.code, 'VALIDATION_ERROR');
  assert.match(error.message, /created empty/);
  assert.equal(inserted.length, 0);
});

test('TC-08-02: a team cannot be created with members at all, even from this course', async (t) => {
  const inserted = stubCreate(t);
  const { error } = await call(createTeams, {
    params: { course_id: courseId },
    body: { teams: [{ team_name: 'Team A', students: [mine[0], mine[1]] }] },
  });
  assert.equal(error.status, 400);
  assert.equal(inserted.length, 0);
});

test('TC-08-03: only the team name and status are taken from a created team', async (t) => {
  const inserted = stubCreate(t);
  const { error, status } = await call(createTeams, {
    params: { course_id: courseId },
    body: { teams: [{ team_name: ' Team B ', team_status: 'Inactive', students: [], course_id: otherCourseId, student_count: 99, _id: String(foreign), created_at: '2001-01-01' }] },
  });
  assert.equal(error, undefined);
  assert.equal(status, 201);
  assert.deepEqual(Object.keys(inserted[0]).sort(), ['course_id', 'team_name', 'team_status']);
  assert.equal(String(inserted[0].course_id), courseId);
  assert.equal(inserted[0].team_name, 'Team B');
  assert.equal(inserted[0].team_status, 'Inactive');
});

for (const [label, team] of [
  ['a missing name', { team_status: 'Active' }],
  ['a blank name', { team_name: '   ' }],
  ['a name that is not a string', { team_name: { $ne: null } }],
  ['an unknown status', { team_name: 'Team C', team_status: 'Deleted' }],
  ['student IDs that are not IDs', { team_name: 'Team C', students: ['not-an-id'] }],
]) {
  test(`TC-08-04: a team with ${label} is rejected and nothing is saved`, async (t) => {
    const inserted = stubCreate(t);
    const { error } = await call(createTeams, { params: { course_id: courseId }, body: { teams: [team] } });
    assert.equal(error.status, 400);
    assert.equal(inserted.length, 0);
  });
}

function stubUpdate(t) {
  const seen = {};
  const current = { team_name: 'Old name', team_status: 'Active' };
  t.mock.method(Team, 'findOne', async () => current);
  t.mock.method(Team, 'findOneAndUpdate', async (filter, update) => {
    seen.filter = filter;
    seen.update = update;
    return { ...current, ...update };
  });
  t.mock.method(Student, 'updateMany', async (filter, update) => { seen.renamed = update; return {}; });
  t.mock.method(console, 'log', () => {});
  return seen;
}

test('TC-08-05: updating a team changes only its name and status, never its course or members', async (t) => {
  const seen = stubUpdate(t);
  const teamId = String(new mongoose.Types.ObjectId());
  const { error } = await call(updateTeam, {
    params: { course_id: courseId, team_id: teamId },
    body: { team_name: 'New name', team_status: 'Inactive', course_id: otherCourseId, students: [foreign], student_count: 50, created_at: '2001-01-01' },
  });
  assert.equal(error, undefined);
  assert.deepEqual(seen.update, { team_name: 'New name', team_status: 'Inactive' });
  assert.equal(String(seen.filter.course_id), courseId, 'the team is still looked up in the URL course');
  assert.deepEqual(seen.renamed, { group_assignment: 'New name' }, 'a rename still updates the members');
});

test('TC-08-06: updating a team with an unknown status or a blank name is rejected', async (t) => {
  for (const body of [{ team_status: 'Deleted' }, { team_name: '  ' }, { team_name: { $set: 1 } }]) {
    const seen = stubUpdate(t);
    const { error } = await call(updateTeam, {
      params: { course_id: courseId, team_id: String(new mongoose.Types.ObjectId()) },
      body,
    });
    assert.equal(error.status, 400, JSON.stringify(body));
    assert.equal(seen.update, undefined);
  }
});

test('TC-08-07: the team list does not hand out evaluation link tokens', async (t) => {
  let populated;
  t.mock.method(Team, 'find', () => ({ populate: async (arg) => { populated = arg; return []; } }));
  const { error } = await call(listTeams, { params: { course_id: courseId } });
  assert.equal(error, undefined);
  assert.equal(populated.path, 'students');
  assert.match(populated.select, /-evaluation_token\b/);
  assert.match(populated.select, /-evaluation_token_expires_at\b/);
});
