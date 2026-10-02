const test = require('node:test');
const assert = require('node:assert/strict');
const Student = require('../models/Student');
const { startDatabase, stopDatabase, clearDatabase } = require('./helpers/db');
const { startApp, sentEmails, clearEmails } = require('./helpers/app');
const { seed, IDS } = require('./helpers/seed');

// CICD-36: invitations and reminders are sent one at a time, spaced out (the Mailtrap sandbox rejects
// bursts), inside one request that the browser abandons after 3 minutes. A class too big for that
// used to show a false failure after the emails had half gone out. A request that cannot finish in
// its time budget is now refused up front, before any email or link is touched, with a message that
// says what to do. The test uses a fast interval so it runs in milliseconds: one email every 100 ms
// with a 300 ms budget allows 4 recipients (the first needs no wait).
let server;
let app;
let ada;

const send = (body = {}) => app.request('POST', `/api/courses/${IDS.courseAda}/evaluations/send`, { token: ada, body });
const remind = (body = {}) => app.request('POST', `/api/courses/${IDS.courseAda}/evaluations/remind`, { token: ada, body });

async function addStudents(count) {
  await Student.create(Array.from({ length: count }, (_, i) => ({
    student_id: `9${String(i).padStart(3, '0')}`, name: `Extra Student ${i}`, email: `extra${i}@example.edu`,
    course_id: IDS.courseAda, team_id: IDS.teamAlpha, group_assignment: 'Alpha',
  })));
}

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
  process.env.EMAIL_SEND_INTERVAL_MS = '100';
  process.env.EMAIL_REQUEST_BUDGET_MS = '300';
  await clearDatabase();
  await seed();
  clearEmails();
});
test.afterEach(() => {
  delete process.env.EMAIL_SEND_INTERVAL_MS;
  delete process.env.EMAIL_REQUEST_BUDGET_MS;
});

test('TC-10-30: a course too big to email within the time budget is refused with advice, before anything is sent or issued', async () => {
  await addStudents(16); // 20 students
  const res = await send();
  assert.equal(res.status, 400);
  assert.equal(res.body.error.code, 'TOO_MANY_RECIPIENTS');
  assert.match(res.body.error.message, /20 students/);
  assert.match(res.body.error.message, /at most 4/);
  assert.match(res.body.error.message, /team/i, 'it says to send team by team');
  assert.equal(sentEmails.length, 0);
  assert.equal(await Student.countDocuments({ evaluation_token: { $ne: null } }), 0, 'no link was issued');
});

test('TC-10-31: a course exactly at the limit is sent in full', async () => {
  const res = await send(); // the seed has 4 students
  assert.equal(res.status, 200);
  assert.equal(res.body.emails_sent, 4);
  assert.equal(sentEmails.length, 4);
});

test('TC-10-32: with no pacing there is no limit, so a big class is sent in full', async () => {
  delete process.env.EMAIL_SEND_INTERVAL_MS;
  await addStudents(16);
  const res = await send();
  assert.equal(res.status, 200);
  assert.equal(res.body.emails_sent, 20);
});

test('TC-10-33: sending to one team is limited the same way', async () => {
  await addStudents(5); // team Alpha now has 7
  const big = await app.request('POST', `/api/courses/${IDS.courseAda}/teams/${IDS.teamAlpha}/evaluations/send`, { token: ada, body: {} });
  assert.equal(big.status, 400);
  assert.equal(big.body.error.code, 'TOO_MANY_RECIPIENTS');
  assert.match(big.body.error.message, /team members/);
  assert.doesNotMatch(big.body.error.message, /each team/i, 'a team send must not be told to send team by team');
  const small = await app.request('POST', `/api/courses/${IDS.courseAda}/teams/${IDS.teamBeta}/evaluations/send`, { token: ada, body: {} });
  assert.equal(small.status, 200);
  assert.equal(sentEmails.length, 2);
});

test('TC-12-30: reminders are limited by how many students would be reminded, and naming students gets under the limit', async () => {
  await addStudents(16);
  const all = await remind();
  assert.equal(all.status, 400);
  assert.equal(all.body.error.code, 'TOO_MANY_RECIPIENTS');
  assert.match(all.body.error.message, /remind fewer/i, 'reminders are told to name fewer students');
  assert.equal(sentEmails.length, 0);

  const some = await remind({ student_ids: [String(IDS.ann), String(IDS.ben), String(IDS.cy)] });
  assert.equal(some.status, 200);
  assert.equal(sentEmails.length, 3);
});
