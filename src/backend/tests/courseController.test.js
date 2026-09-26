const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const Course = require('../models/Course');
const Team = require('../models/Team');
const Student = require('../models/Student');
const controller = require('../controllers/courseController');

const professorId = new mongoose.Types.ObjectId().toString();
const courseId = new mongoose.Types.ObjectId().toString();
const fields = { course_name: 'Capstone', course_number: 'IT 7993', course_section: '01', semester: 'Fall 2026' };

test.beforeEach((t) => {
  t.mock.method(console, 'log', () => {});
  t.mock.method(console, 'warn', () => {});
});

function makeCourse(overrides = {}) {
  return new Course({ ...fields, _id: courseId, professor_id: professorId, ...overrides });
}

async function call(action, overrides = {}) {
  const req = { body: {}, query: {}, params: { course_id: courseId }, user: { id: professorId }, ...overrides };
  const res = {
    statusCode: undefined,
    body: undefined,
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return this; }
  };
  const errors = [];
  await controller[action](req, res, (err) => errors.push(err));
  return { res, errors };
}

function error(result, status, code) {
  assert.equal(result.errors.length, 1);
  assert.equal(result.errors[0].status, status);
  assert.equal(result.errors[0].code, code);
  assert.equal(result.res.statusCode, undefined);
  assert.equal(result.res.body, undefined);
}

function success(result, status, body) {
  assert.deepEqual(result.errors, []);
  assert.equal(result.res.statusCode, status);
  assert.deepEqual(result.res.body, body);
}

function stubSave(t) {
  return t.mock.method(Course.prototype, 'save', async function () {
    await this.validate();
    return this;
  });
}

for (const query of [{}, { ...fields, course_status: 'Inactive', professor_id: 'another-professor' }, { course_status: '' }]) {
  test(`listCourses: scopes query ${JSON.stringify(query)} to the current professor`, async (t) => {
    const course = makeCourse();
    const find = t.mock.method(Course, 'find', async () => [course]);
    const aggregate = t.mock.method(Team, 'aggregate', async () => [{ _id: course._id, count: 2 }]);
    success(await call('listCourses', { query }), 200, [{ ...course.toObject(), team_count: 2 }]);
    assert.equal(find.mock.callCount(), 1);
    const filter = find.mock.calls[0].arguments[0];
    assert.equal(filter.professor_id, professorId);
    if (query.course_status === '') assert.equal(filter.course_status, undefined);
    else assert.equal(filter.course_status, query.course_status || 'Active');
    assert.deepEqual(aggregate.mock.calls[0].arguments, [[
      { $match: { course_id: { $in: [course._id] } } },
      { $group: { _id: '$course_id', count: { $sum: 1 } } }
    ]]);
  });
}

for (const field of Object.keys(fields)) {
  test(`createCourse: missing ${field} returns 400`, async (t) => {
    const find = t.mock.method(Course, 'findOne', async () => null);
    const save = stubSave(t);
    const body = { ...fields };
    delete body[field];
    error(await call('createCourse', { body }), 400, 'VALIDATION_ERROR');
    assert.equal(find.mock.callCount(), 0);
    assert.equal(save.mock.callCount(), 0);
  });
}

test('createCourse: saves a new active course and returns 201', async (t) => {
  const find = t.mock.method(Course, 'findOne', async () => null);
  const save = stubSave(t);
  const result = await call('createCourse', { body: fields });
  assert.equal(save.mock.callCount(), 1);
  const saved = save.mock.calls[0].this;
  success(result, 201, { id: saved._id, message: 'Course created.' });
  for (const [key, value] of Object.entries(fields)) assert.equal(saved[key], value);
  assert.equal(saved.professor_id.toString(), professorId);
  assert.equal(saved.course_status, 'Active');
  assert.deepEqual(find.mock.calls[0].arguments, [{ ...fields, professor_id: professorId, course_status: 'Inactive' }]);
});

test('createCourse: reactivates an inactive match', async (t) => {
  const course = makeCourse({ course_status: 'Inactive' });
  const find = t.mock.method(Course, 'findOne', async () => course);
  const save = stubSave(t);
  success(await call('createCourse', { body: fields }), 200, { id: course._id, message: 'Course reactivated.' });
  assert.deepEqual(find.mock.calls[0].arguments, [{ ...fields, professor_id: professorId, course_status: 'Inactive' }]);
  assert.equal(save.mock.callCount(), 1);
  assert.equal(save.mock.calls[0].this, course);
  assert.equal(course.course_status, 'Active');
});

for (const action of ['getCourse', 'updateCourse', 'deleteCourse']) {
  const method = action === 'getCourse' ? 'findById' : 'findByIdAndUpdate';
  test(`${action}: invalid ObjectId returns 400`, async (t) => {
    const find = t.mock.method(Course, method, async () => null);
    error(await call(action, { params: { course_id: 'invalid-id' } }), 400, 'VALIDATION_ERROR');
    assert.equal(find.mock.callCount(), 0);
  });

  test(`${action}: missing course returns 404`, async (t) => {
    const find = t.mock.method(Course, method, async () => null);
    error(await call(action), 404, 'NOT_FOUND');
    assert.equal(find.mock.callCount(), 1);
    assert.equal(find.mock.calls[0].arguments[0].toString(), courseId);
  });
}
// Ownership (another professor's course → 404) is enforced in routes/courses.js
// for every :course_id route; see tests/courseOwnership.test.js.

test('getCourse: returns the course with the current student count', async (t) => {
  const course = makeCourse();
  const find = t.mock.method(Course, 'findById', async () => course);
  const count = t.mock.method(Student, 'countDocuments', async () => 7);
  success(await call('getCourse'), 200, { ...course.toObject(), student_count: 7 });
  assert.deepEqual(find.mock.calls[0].arguments, [courseId]);
  assert.deepEqual(count.mock.calls[0].arguments, [{ course_id: course._id }]);
  assert.equal(course.student_count, 0);
});

test('updateCourse: applies updates and returns 200', async (t) => {
  const course = makeCourse();
  const updates = { course_name: 'Updated Capstone', semester: 'Spring 2027' };
  const update = t.mock.method(Course, 'findByIdAndUpdate', async (id, values) => {
    course.set(values);
    await course.validate();
    return course;
  });
  success(await call('updateCourse', { body: updates }), 200, { message: 'Course updated.' });
  assert.deepEqual(update.mock.calls[0].arguments, [courseId, updates, { new: true }]);
  assert.equal(course.course_name, updates.course_name);
  assert.equal(course.semester, updates.semester);
});

test('updateCourse: only saves the editable fields', async (t) => {
  const update = t.mock.method(Course, 'findByIdAndUpdate', async () => makeCourse());
  const body = {
    ...fields, course_status: 'Inactive',
    professor_id: new mongoose.Types.ObjectId().toString(), // would hand the course to someone else
    student_count: 999, team_count: 999, evaluation_status: { total: 1 }, _id: 'x'
  };
  success(await call('updateCourse', { body }), 200, { message: 'Course updated.' });
  assert.deepEqual(update.mock.calls[0].arguments[1], { ...fields, course_status: 'Inactive' });
});

test('deleteCourse: marks the course Inactive without removing it', async (t) => {
  const course = makeCourse();
  const update = t.mock.method(Course, 'findByIdAndUpdate', async (id, values) => {
    course.set(values);
    await course.validate();
    return course;
  });
  const remove = t.mock.method(Course, 'findByIdAndDelete', async () => null);
  const deleteOne = t.mock.method(Course, 'deleteOne', async () => ({}));
  success(await call('deleteCourse'), 200, { message: 'Course deleted successfully.' });
  assert.equal(update.mock.callCount(), 1);
  assert.deepEqual(update.mock.calls[0].arguments, [new mongoose.Types.ObjectId(courseId), { course_status: 'Inactive' }, { new: true }]);
  assert.equal(course.course_status, 'Inactive');
  assert.equal(remove.mock.callCount(), 0);
  assert.equal(deleteOne.mock.callCount(), 0);
});
