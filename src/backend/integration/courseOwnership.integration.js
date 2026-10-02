const test = require('node:test');
const assert = require('node:assert/strict');
const Course = require('../models/Course');
const { startDatabase, stopDatabase, clearDatabase } = require('./helpers/db');
const { startApp } = require('./helpers/app');
const { seed, IDS } = require('./helpers/seed');

// FR-05: a professor sees and changes only their own courses. The unit tests mock the ownership
// lookup; here the lookup is a real query against seeded data.
let replSet;
let app;
let ada;
let bo;

test.before(async () => {
  replSet = await startDatabase();
  app = await startApp();
  ada = app.tokenFor(IDS.ada, 'ada@example.edu');
  bo = app.tokenFor(IDS.bo, 'bo@example.edu');
});
test.after(async () => {
  await app.close();
  await stopDatabase(replSet);
});
test.beforeEach(async (t) => {
  t.mock.method(console, 'log', () => {});
  t.mock.method(console, 'error', () => {});
  await clearDatabase();
  await seed();
});

test('TC-05-20: the course list holds only the signed-in professor\'s courses', async () => {
  const adaList = await app.request('GET', '/api/courses', { token: ada });
  const boList = await app.request('GET', '/api/courses', { token: bo });
  assert.equal(adaList.status, 200);
  assert.deepEqual(adaList.body.map((c) => c.course_number), ['CS 4850']);
  assert.deepEqual(boList.body.map((c) => c.course_number), ['IT 3100']);
});

test('TC-05-21: the owner reads their course and its students', async () => {
  const course = await app.request('GET', `/api/courses/${IDS.courseAda}`, { token: ada });
  assert.equal(course.status, 200);
  const students = await app.request('GET', `/api/courses/${IDS.courseAda}/students`, { token: ada });
  assert.equal(students.status, 200);
  assert.equal(students.body.length, 4);
});

test('TC-05-22: another professor gets 404 on the course, its students and its teams', async () => {
  for (const path of ['', '/students', '/teams', '/evaluations/status']) {
    const res = await app.request('GET', `/api/courses/${IDS.courseAda}${path}`, { token: bo });
    assert.equal(res.status, 404, `GET course${path}`);
  }
});

test('TC-05-23: another professor cannot change or delete the course, and the database is unchanged', async () => {
  const put = await app.request('PUT', `/api/courses/${IDS.courseAda}`, { token: bo, body: { course_name: 'Hijacked' } });
  const del = await app.request('DELETE', `/api/courses/${IDS.courseAda}`, { token: bo });
  assert.equal(put.status, 404);
  assert.equal(del.status, 404);
  const stored = await Course.findById(IDS.courseAda);
  assert.equal(stored.course_name, 'Capstone');
});

test('TC-05-24: a request with no token gets 401', async () => {
  const res = await app.request('GET', `/api/courses/${IDS.courseAda}`);
  assert.equal(res.status, 401);
});

test('TC-05-25: a created course belongs to the professor in the token, whatever the body says', async () => {
  const res = await app.request('POST', '/api/courses', {
    token: bo,
    body: {
      course_name: 'Networks', course_number: 'IT 4200', course_section: '03', semester: 'Fall 2026',
      professor_id: String(IDS.ada),
    },
  });
  assert.equal(res.status, 201);
  const stored = await Course.findOne({ course_number: 'IT 4200' });
  assert.equal(String(stored.professor_id), String(IDS.bo));
});
