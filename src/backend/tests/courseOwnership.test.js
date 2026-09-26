const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');

const SECRET = 'course-ownership-test-secret-at-least-32-characters';
process.env.JWT_SECRET = SECRET;
const Course = require('../models/Course');
const Student = require('../models/Student');
const router = require('../routes/courses');
const errorHandler = require('../middleware/errorHandler');

// The real courses router behind a real HTTP server. No database: Course.exists
// answers the ownership question, and a request that gets past the check to an
// unstubbed model call fails at once instead of waiting for a connection.
mongoose.set('bufferCommands', false);
const professorId = new mongoose.Types.ObjectId().toString();
const token = jwt.sign({ id: professorId, email: 'owner@example.com' }, SECRET, { expiresIn: '1h' });
let baseUrl;
let server;

test.before(async () => {
  const app = express();
  app.use(express.json());
  app.use('/api/courses', router);
  app.use(errorHandler);
  await new Promise(resolve => { server = app.listen(0, resolve); });
  baseUrl = `http://127.0.0.1:${server.address().port}/api/courses`;
});
test.after(() => server.close());
test.beforeEach((t) => {
  t.mock.method(console, 'log', () => {});
  t.mock.method(console, 'error', () => {});
});

function request(method, path, auth = token) {
  return fetch(baseUrl + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(auth ? { Authorization: `Bearer ${auth}` } : {}) },
    body: method === 'GET' ? undefined : '{}'
  });
}

// Every route in routes/courses.js that takes a course id, with each :param
// replaced by a valid ObjectId. New routes are picked up automatically.
const courseRoutes = router.stack
  .filter(layer => layer.route && layer.route.path.includes(':course_id'))
  .flatMap(layer => Object.keys(layer.route.methods).map(method => ({
    method: method.toUpperCase(),
    path: layer.route.path.replace(/:[a-z_]+/g, () => new mongoose.Types.ObjectId().toString())
  })));

test('the courses router has course-scoped routes to check', () => {
  assert.ok(courseRoutes.length >= 25, `found only ${courseRoutes.length}`);
});

for (const { method, path } of courseRoutes) {
  test(`${method} ${path.replace(/[0-9a-f]{24}/g, ':id')}: another professor's course returns 404`, async (t) => {
    const exists = t.mock.method(Course, 'exists', async () => null);
    const res = await request(method, path);
    assert.equal(res.status, 404);
    assert.equal((await res.json()).error.code, 'NOT_FOUND');
    const courseId = path.split('/')[1];
    assert.deepEqual(exists.mock.calls[0].arguments, [{ _id: courseId, professor_id: professorId }]);
  });
}

test('an invalid course id returns 400 before any lookup', async (t) => {
  const exists = t.mock.method(Course, 'exists', async () => null);
  const res = await request('GET', '/not-an-id/students');
  assert.equal(res.status, 400);
  assert.equal((await res.json()).error.code, 'VALIDATION_ERROR');
  assert.equal(exists.mock.callCount(), 0);
});

test('no token still returns 401, not 404', async (t) => {
  const exists = t.mock.method(Course, 'exists', async () => null);
  const res = await request('GET', `/${new mongoose.Types.ObjectId()}`, null);
  assert.equal(res.status, 401);
  assert.equal(exists.mock.callCount(), 0);
});

test('the owner reaches the controller', async (t) => {
  const courseId = new mongoose.Types.ObjectId();
  t.mock.method(Course, 'exists', async () => ({ _id: courseId }));
  t.mock.method(Course, 'findById', async () => new Course({
    _id: courseId, course_name: 'Capstone', course_number: 'IT 7993', course_section: '01',
    semester: 'Fall 2026', professor_id: professorId
  }));
  t.mock.method(Student, 'countDocuments', async () => 3);
  const res = await request('GET', `/${courseId}`);
  assert.equal(res.status, 200);
  assert.equal((await res.json()).student_count, 3);
});
