const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const Student = require('../models/Student');
const { addStudent, updateStudent } = require('../controllers/studentController');
const { isEmailFormat } = require('../utils/emailFormat');

// FR-07 (CICD-47): adding or updating a student by hand checks the email the same way the
// roster upload does (rosterUpload.test.js, TC-07-04 to TC-07-06). A badly formed address is
// a 400 before the database is touched. Only the form is checked, not whether mail arrives.
// No database: model calls are stubbed; the controllers run for real.
const courseId = String(new mongoose.Types.ObjectId());
const studentId = String(new mongoose.Types.ObjectId());

async function call(handler, req) {
  let error;
  await handler(req, { status() { return this; }, json() {} }, (err) => { error = err; });
  return error;
}

test('TC-07-07: the email check accepts usual addresses and refuses bob@, bob and bob@x', () => {
  for (const good of ['alice@example.com', 'kgipson5@students.kennesaw.edu', 'first.last+tag@example.co.uk']) {
    assert.equal(isEmailFormat(good), true, good);
  }
  for (const bad of ['bob@', 'bob', 'bob@x', '', 'bob @example.com', 'bob@@example.com', 'bob@example.', null]) {
    assert.equal(isEmailFormat(bad), false, String(bad));
  }
});

test('TC-07-08: adding a student with a badly formed email is a 400, before any lookup', async (t) => {
  const find = t.mock.method(Student, 'findOne', async () => { throw new Error('must not be queried'); });
  for (const email of ['bob@', 'bob', 'bob@x']) {
    const error = await call(addStudent, { params: { course_id: courseId }, body: { student_id: 'S1', name: 'Bob', email } });
    assert.equal(error.status, 400, email);
    assert.equal(error.code, 'VALIDATION_ERROR');
  }
  assert.equal(find.mock.callCount(), 0);
});

test('TC-07-09: updating a student to a badly formed email is a 400 and nothing is saved', async (t) => {
  const find = t.mock.method(Student, 'findOne', async () => { throw new Error('must not be queried'); });
  const save = t.mock.method(Student, 'findOneAndUpdate', async () => { throw new Error('must not be saved'); });
  for (const email of ['bob@', 'bob', 'bob@x']) {
    const error = await call(updateStudent, { params: { course_id: courseId, student_id: studentId }, body: { email } });
    assert.equal(error.status, 400, email);
    assert.equal(error.code, 'VALIDATION_ERROR');
  }
  assert.equal(find.mock.callCount(), 0);
  assert.equal(save.mock.callCount(), 0);
});