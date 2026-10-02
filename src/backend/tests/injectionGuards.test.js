const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const Professor = require('../models/Professor');
const Course = require('../models/Course');
const Student = require('../models/Student');
const Team = require('../models/Team');
const auth = require('../controllers/authController');
const courses = require('../controllers/courseController');
const students = require('../controllers/studentController');

// CodeQL js/sql-injection (CICD-24): request body and query values went straight into
// MongoDB filters. Express parses {"token": {"$ne": null}} (or ?course_status[$ne]=x) into an
// object, and an object in a filter is an operator, not a value. The worst case was
// updatePassword: { token: { $ne: null } } matched ANY professor with a pending password
// reset, so an attacker could ask for a reset for a victim's email and then set that
// account's password without ever seeing the email. Every value that reaches a filter must now
// be text, and a request that sends anything else is a 400 before the database is touched.
// No database: model calls are stubbed and recorded; the controllers run for real.
const OPERATOR = { $ne: null };

async function call(handler, req) {
  let error;
  let body;
  let status;
  const res = { status(code) { status = code; return this; }, json(data) { body = data; } };
  await handler({ body: {}, query: {}, params: {}, user: { id: String(new mongoose.Types.ObjectId()) }, ...req }, res, (err) => { error = err; });
  return { error, body, status };
}

function assertRejected(result, field) {
  assert.ok(result.error, 'must be rejected');
  assert.equal(result.error.status, 400);
  assert.equal(result.error.code, 'VALIDATION_ERROR');
  if (field) assert.match(result.error.message, new RegExp(field));
}

// ---- professor login, registration and password reset -----------------------------------

test('TC-01-14: updatePassword with an operator object as the token is rejected and no professor is looked up', async (t) => {
  const find = t.mock.method(Professor, 'findOne', async () => { throw new Error('the database must not be queried'); });
  const result = await call(auth.updatePassword, { body: { token: OPERATOR, password: 'NewPassword1' } });
  assertRejected(result, 'token');
  assert.equal(find.mock.callCount(), 0);
});

test('TC-01-15: updatePassword still works for a real token, and looks it up as plain text', async (t) => {
  let saved = false;
  const professor = {
    securityToken: 'abc123', securityTokenExpires: Date.now() + 60 * 1000,
    async save() { saved = true; },
  };
  const find = t.mock.method(Professor, 'findOne', async () => professor);
  const result = await call(auth.updatePassword, { body: { token: 'abc123', password: 'NewPassword1' } });
  assert.equal(result.error, undefined);
  assert.equal(result.status, 200);
  assert.deepEqual(find.mock.calls[0].arguments[0], { securityToken: 'abc123' });
  assert.equal(saved, true);
  assert.equal(professor.securityToken, undefined, 'the token is used up');
});

test('TC-01-16: updatePassword rejects a password that is not text', async (t) => {
  const find = t.mock.method(Professor, 'findOne', async () => { throw new Error('must not be queried'); });
  assertRejected(await call(auth.updatePassword, { body: { token: 'abc123', password: { $ne: null } } }), 'password');
  assertRejected(await call(auth.updatePassword, { body: { token: 'abc123', password: 12345678 } }), 'password');
  assert.equal(find.mock.callCount(), 0);
});

test('TC-01-17: a password reset request with an operator object as the email is rejected', async (t) => {
  const find = t.mock.method(Professor, 'findOne', async () => { throw new Error('must not be queried'); });
  assertRejected(await call(auth.resetPassword, { body: { email: OPERATOR } }), 'email');
  assertRejected(await call(auth.resetPassword, { body: { email: ['a@b.c'] } }), 'email');
  assert.equal(find.mock.callCount(), 0, 'no professor is looked up, so no reset email goes to a stranger');
});

test('TC-01-18: login rejects an email or password that is not text, before any lookup', async (t) => {
  const find = t.mock.method(Professor, 'findOne', async () => { throw new Error('must not be queried'); });
  assertRejected(await call(auth.login, { body: { email: { $gt: '' }, password: 'x' } }), 'email');
  assertRejected(await call(auth.login, { body: { email: 'a@b.c', password: { $ne: null } } }), 'password');
  assertRejected(await call(auth.login, { body: { email: 'a@b.c', password: 123456 } }), 'password');
  assert.equal(find.mock.callCount(), 0);
});

test('TC-01-19: registration rejects any field that is not text, before any lookup', async (t) => {
  const find = t.mock.method(Professor, 'findOne', async () => { throw new Error('must not be queried'); });
  const good = { email: 'a@b.c', password: 'Password1', name: 'A', department: 'CS' };
  for (const field of Object.keys(good)) {
    assertRejected(await call(auth.register, { body: { ...good, [field]: OPERATOR } }), field);
  }
  assert.equal(find.mock.callCount(), 0);
});

// ---- courses ----------------------------------------------------------------------------

test('TC-05-06: the course list rejects a search value that is not text, before the query', async (t) => {
  const find = t.mock.method(Course, 'find', async () => { throw new Error('must not be queried'); });
  for (const field of ['course_name', 'course_number', 'course_section', 'semester', 'course_status']) {
    assertRejected(await call(courses.listCourses, { query: { [field]: { $ne: 'x' } } }), field);
  }
  assert.equal(find.mock.callCount(), 0);
});

test('TC-05-07: the course list still filters by text', async (t) => {
  const find = t.mock.method(Course, 'find', async () => []);
  t.mock.method(Team, 'aggregate', async () => []);
  const result = await call(courses.listCourses, { query: { course_name: 'Capstone', course_status: 'Inactive' } });
  assert.equal(result.error, undefined);
  const filter = find.mock.calls[0].arguments[0];
  assert.equal(filter.course_status, 'Inactive');
  assert.deepEqual(filter.course_name, { $regex: 'Capstone', $options: 'i' });
});

// Codex review: a search is text, but text is still a pattern when it goes into $regex. '[' made an
// invalid regular expression (a 500) and a crafted pattern can burn database CPU. The course search
// is a plain substring search, so the text is matched literally.
test('TC-05-10: course search text is matched literally, so regex characters are escaped', async (t) => {
  const find = t.mock.method(Course, 'find', async () => []);
  t.mock.method(Team, 'aggregate', async () => []);
  await call(courses.listCourses, { query: { course_name: 'C++ (Sec [A]) .*', course_number: 'IT|79', course_section: '^01$', semester: 'Fall\\2026' } });
  const filter = find.mock.calls[0].arguments[0];
  assert.equal(filter.course_name.$regex, 'C\\+\\+ \\(Sec \\[A\\]\\) \\.\\*');
  assert.equal(filter.$or[0].course_number.$regex, 'IT\\|79');
  assert.equal(filter.course_section.$regex, '\\^01\\$');
  assert.equal(filter.semester.$regex, 'Fall\\\\2026');
});

test('TC-05-11: a very long search value is rejected before the query', async (t) => {
  const find = t.mock.method(Course, 'find', async () => { throw new Error('must not be queried'); });
  assertRejected(await call(courses.listCourses, { query: { course_name: 'a'.repeat(101) } }), 'course_name');
  assert.equal(find.mock.callCount(), 0);
});

// Codex review: null passed the text guard (a missing value is not "not text") and updateCourse
// copied it into the update, so {"course_status": null} hid a course from every list.
test('TC-05-12: updating a course rejects null, blank and invalid values, with no write', async (t) => {
  const update = t.mock.method(Course, 'findByIdAndUpdate', async () => { throw new Error('must not be written'); });
  const id = String(new mongoose.Types.ObjectId());
  for (const body of [
    { course_name: null }, { course_status: null }, { semester: '' }, { course_number: '   ' },
    { course_status: 'Deleted' }, { course_status: 'active' },
  ]) {
    assertRejected(await call(courses.updateCourse, { params: { course_id: id }, body }));
  }
  assert.equal(update.mock.callCount(), 0);
});

test('TC-05-13: updating a course with real values still works', async (t) => {
  const update = t.mock.method(Course, 'findByIdAndUpdate', async () => ({ _id: 'c' }));
  const id = String(new mongoose.Types.ObjectId());
  const result = await call(courses.updateCourse, { params: { course_id: id }, body: { course_name: ' Capstone II ', course_status: 'Inactive' } });
  assert.equal(result.error, undefined);
  assert.equal(result.status, 200);
  assert.deepEqual(update.mock.calls[0].arguments[1], { course_name: 'Capstone II', course_status: 'Inactive' });
});

test('TC-05-08: creating a course rejects a field that is not text, before any lookup', async (t) => {
  const find = t.mock.method(Course, 'findOne', async () => { throw new Error('must not be queried'); });
  t.mock.method(console, 'log', () => {});
  const good = { course_name: 'Capstone', course_number: 'IT7993', course_section: '01', semester: 'Fall 2026' };
  for (const field of Object.keys(good)) {
    assertRejected(await call(courses.createCourse, { body: { ...good, [field]: OPERATOR } }), field);
  }
  assert.equal(find.mock.callCount(), 0);
});

test('TC-05-09: updating a course rejects a field that is not text, before any update', async (t) => {
  const update = t.mock.method(Course, 'findByIdAndUpdate', async () => { throw new Error('must not be queried'); });
  const id = String(new mongoose.Types.ObjectId());
  for (const field of ['course_name', 'course_number', 'course_section', 'semester', 'course_status']) {
    assertRejected(await call(courses.updateCourse, { params: { course_id: id }, body: { [field]: { $set: { professor_id: 'x' } } } }), field);
  }
  assert.equal(update.mock.callCount(), 0);
});

// ---- students ---------------------------------------------------------------------------

test('TC-07-02: adding a student rejects a field that is not text, before the duplicate check', async (t) => {
  const find = t.mock.method(Student, 'findOne', async () => { throw new Error('must not be queried'); });
  const courseId = String(new mongoose.Types.ObjectId());
  const good = { student_id: 'S1', name: 'Alice', email: 'alice@example.com', group_assignment: 'Team A' };
  for (const field of Object.keys(good)) {
    assertRejected(await call(students.addStudent, { params: { course_id: courseId }, body: { ...good, [field]: OPERATOR } }), field);
  }
  assert.equal(find.mock.callCount(), 0, 'an operator in student_id used to bypass the duplicate check');
});

test('TC-07-03: updating a student looks them up with ObjectIds, not the raw request values', async (t) => {
  const courseId = String(new mongoose.Types.ObjectId());
  const studentId = String(new mongoose.Types.ObjectId());
  t.mock.method(Student, 'findOne', async () => ({ _id: studentId, team_id: null }));
  const update = t.mock.method(Student, 'findOneAndUpdate', async () => ({}));
  t.mock.method(console, 'log', () => {});
  const result = await call(students.updateStudent, { params: { course_id: courseId, student_id: studentId }, body: { name: 'New Name' } });
  assert.equal(result.error, undefined);
  const filter = update.mock.calls[0].arguments[0];
  assert.ok(filter._id instanceof mongoose.Types.ObjectId, 'student _id is cast');
  assert.ok(filter.course_id instanceof mongoose.Types.ObjectId, 'course_id is cast');
  assert.equal(String(filter._id), studentId);
});
