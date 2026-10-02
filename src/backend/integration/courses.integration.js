const test = require('node:test');
const assert = require('node:assert/strict');
const Course = require('../models/Course');
const Student = require('../models/Student');
const { startDatabase, stopDatabase, clearDatabase } = require('./helpers/db');
const { startApp } = require('./helpers/app');
const { seed, IDS } = require('./helpers/seed');

// CW-03 course setup: create, list, edit and remove a course. Ownership across professors is in
// courseOwnership.integration.js.
let server;
let app;
let ada;

const NEW_COURSE = { course_name: 'Networks', course_number: 'IT 4200', course_section: '03', semester: 'Spring 2027' };

test.before(async () => {
  server = await startDatabase();
  app = await startApp();
  ada = app.tokenFor(IDS.ada, 'ada@example.edu');
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

test('TC-05-30: a created course is saved as Active and appears in the list', async () => {
  const res = await app.request('POST', '/api/courses', { token: ada, body: NEW_COURSE });
  assert.equal(res.status, 201);
  const stored = await Course.findById(res.body.id);
  assert.equal(stored.course_status, 'Active');
  assert.equal(String(stored.professor_id), String(IDS.ada));

  const list = await app.request('GET', '/api/courses', { token: ada });
  assert.deepEqual(list.body.map((c) => c.course_number).sort(), ['CS 4850', 'IT 4200']);
});

test('TC-05-31: a course with a missing field is refused and nothing is saved', async () => {
  const { semester: _omit, ...incomplete } = NEW_COURSE;
  const res = await app.request('POST', '/api/courses', { token: ada, body: incomplete });
  assert.equal(res.status, 400);
  assert.equal(await Course.countDocuments({ course_number: 'IT 4200' }), 0);
});

test('TC-05-32: editing a course changes only the fields sent', async () => {
  const res = await app.request('PUT', `/api/courses/${IDS.courseAda}`, { token: ada, body: { course_name: 'Senior Capstone' } });
  assert.equal(res.status, 200);
  const stored = await Course.findById(IDS.courseAda);
  assert.equal(stored.course_name, 'Senior Capstone');
  assert.equal(stored.course_number, 'CS 4850');
  assert.equal(String(stored.professor_id), String(IDS.ada), 'the owner cannot be changed through an edit');
});

test('TC-05-33: an empty field or an unknown status is refused', async () => {
  const empty = await app.request('PUT', `/api/courses/${IDS.courseAda}`, { token: ada, body: { course_name: '   ' } });
  const status = await app.request('PUT', `/api/courses/${IDS.courseAda}`, { token: ada, body: { course_status: 'Archived' } });
  assert.equal(empty.status, 400);
  assert.equal(status.status, 400);
  assert.equal((await Course.findById(IDS.courseAda)).course_name, 'Capstone');
});

test('TC-05-34: deleting a course hides it from the default list but keeps its students', async () => {
  const del = await app.request('DELETE', `/api/courses/${IDS.courseAda}`, { token: ada });
  assert.equal(del.status, 200);
  assert.equal((await Course.findById(IDS.courseAda)).course_status, 'Inactive');

  const list = await app.request('GET', '/api/courses', { token: ada });
  assert.deepEqual(list.body, []);
  const inactive = await app.request('GET', '/api/courses?course_status=Inactive', { token: ada });
  assert.equal(inactive.body.length, 1);
  assert.equal(await Student.countDocuments({ course_id: IDS.courseAda }), 4);
});

test('TC-05-35: creating the same course again reactivates the deleted one instead of making a copy', async () => {
  await app.request('DELETE', `/api/courses/${IDS.courseAda}`, { token: ada });
  const res = await app.request('POST', '/api/courses', {
    token: ada,
    body: { course_name: 'Capstone', course_number: 'CS 4850', course_section: '01', semester: 'Fall 2026' },
  });
  assert.equal(res.status, 200);
  assert.equal(String(res.body.id), String(IDS.courseAda));
  assert.equal(await Course.countDocuments({ course_number: 'CS 4850' }), 1);
  assert.equal((await Course.findById(IDS.courseAda)).course_status, 'Active');
});

test('TC-05-36: the course search matches part of a name, case-insensitively, and treats regex characters as text', async () => {
  const hit = await app.request('GET', '/api/courses?course_name=capst', { token: ada });
  assert.equal(hit.body.length, 1);
  const wildcard = await app.request('GET', '/api/courses?course_name=.*', { token: ada });
  assert.equal(wildcard.body.length, 0, '".*" is searched for literally');
});
