const test = require('node:test');
const assert = require('node:assert/strict');
const Student = require('../models/Student');
const { startDatabase, stopDatabase, clearDatabase } = require('./helpers/db');
const { startApp, sentEmails, clearEmails } = require('./helpers/app');
const { seed, IDS } = require('./helpers/seed');

// FR-10: invitation emails and the evaluation links in them. The email is captured at the
// Nodemailer transport, so the real message-building code runs; the token in each link has to be
// the one stored for that student, which only a real database can show.
let replSet;
let app;
let ada;
let bo;

const FRONTEND = 'https://peers.example.test';
const sendPath = (courseId) => `/api/courses/${courseId}/evaluations/send`;
const linkIn = (email) => (email.html.match(/href="([^"]*\/evaluate\/[^"]+)"/) || [])[1];

test.before(async () => {
  process.env.FRONTEND_URL = FRONTEND;
  replSet = await startDatabase();
  app = await startApp();
  ada = app.tokenFor(IDS.ada, 'ada@example.edu');
  bo = app.tokenFor(IDS.bo, 'bo@example.edu');
});
test.after(async () => {
  delete process.env.FRONTEND_URL;
  await app.close();
  await stopDatabase(replSet);
});
test.beforeEach(async (t) => {
  t.mock.method(console, 'log', () => {});
  t.mock.method(console, 'error', () => {});
  await clearDatabase();
  await seed();
  clearEmails();
});

test('TC-10-20: sending to a course emails every student a link that matches the token stored for them', async () => {
  const res = await app.request('POST', sendPath(IDS.courseAda), { token: ada, body: {} });
  assert.equal(res.status, 200);
  assert.equal(res.body.emails_sent, 4);

  assert.deepEqual(sentEmails.map((e) => e.to).sort(), [
    'ann@example.edu', 'ben@example.edu', 'cy@example.edu', 'di@example.edu',
  ]);
  for (const email of sentEmails) {
    const student = await Student.findOne({ email: email.to, course_id: IDS.courseAda });
    assert.match(student.evaluation_token, /^[0-9a-f]{64}$/);
    assert.equal(linkIn(email), `${FRONTEND}/evaluate/${student.evaluation_token}`);
    assert.match(email.subject, /Capstone/);
    assert.match(email.html, new RegExp(student.name));
  }
});

test('TC-10-21: each link expires about 14 days after sending', async () => {
  await app.request('POST', sendPath(IDS.courseAda), { token: ada, body: {} });
  const ann = await Student.findById(IDS.ann);
  const days = (ann.evaluation_token_expires_at.getTime() - Date.now()) / 86400000;
  assert.ok(days > 13.9 && days <= 14, `expires in ${days} days`);
});

test('TC-10-22: sending again keeps a still-valid link, so earlier emails keep working', async () => {
  await app.request('POST', sendPath(IDS.courseAda), { token: ada, body: {} });
  const before = (await Student.findById(IDS.ann)).evaluation_token;
  clearEmails();
  await app.request('POST', sendPath(IDS.courseAda), { token: ada, body: {} });
  const after = await Student.findById(IDS.ann);
  assert.equal(after.evaluation_token, before);
  assert.equal(linkIn(sentEmails.find((e) => e.to === 'ann@example.edu')), `${FRONTEND}/evaluate/${before}`);
});

test('TC-10-23: sending after a link expired issues a new one', async () => {
  await app.request('POST', sendPath(IDS.courseAda), { token: ada, body: {} });
  const old = (await Student.findById(IDS.ann)).evaluation_token;
  await Student.findByIdAndUpdate(IDS.ann, { evaluation_token_expires_at: new Date(Date.now() - 1000) });

  const expired = await app.request('GET', `/api/evaluate/${old}`);
  assert.equal(expired.status, 410);

  await app.request('POST', sendPath(IDS.courseAda), { token: ada, body: {} });
  const fresh = (await Student.findById(IDS.ann)).evaluation_token;
  assert.notEqual(fresh, old);
  assert.equal((await app.request('GET', `/api/evaluate/${fresh}`)).status, 200);
});

test('TC-10-24: sending to one team emails only that team', async () => {
  const res = await app.request('POST', `/api/courses/${IDS.courseAda}/teams/${IDS.teamBeta}/evaluations/send`, { token: ada, body: {} });
  assert.equal(res.status, 200);
  assert.deepEqual(sentEmails.map((e) => e.to).sort(), ['cy@example.edu', 'di@example.edu']);
  assert.equal((await Student.findById(IDS.ann)).evaluation_token, null);
});

test('TC-10-25: another professor cannot send for the course, and no email goes out', async () => {
  const res = await app.request('POST', sendPath(IDS.courseAda), { token: bo, body: {} });
  assert.equal(res.status, 404);
  assert.equal(sentEmails.length, 0);
  assert.equal((await Student.findById(IDS.ann)).evaluation_token, null);
});
