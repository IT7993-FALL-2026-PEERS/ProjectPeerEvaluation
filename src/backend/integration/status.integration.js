const test = require('node:test');
const assert = require('node:assert/strict');
const Student = require('../models/Student');
const { startDatabase, stopDatabase, clearDatabase } = require('./helpers/db');
const { startApp, sentEmails, clearEmails } = require('./helpers/app');
const { seed, IDS } = require('./helpers/seed');

// CW-08 tracking and reminders (FR-11, FR-12): who has submitted, and who is reminded. A reminder
// goes only to students who have not submitted, and reuses a link that still works.
let server;
let app;
let ada;
let bo;

const FRONTEND = 'https://peers.example.test';
const status = (token) => app.request('GET', `/api/courses/${IDS.courseAda}/evaluations/status`, { token });
const remind = (token, body = {}) => app.request('POST', `/api/courses/${IDS.courseAda}/evaluations/remind`, { token, body });
const send = () => app.request('POST', `/api/courses/${IDS.courseAda}/evaluations/send`, { token: ada, body: {} });

const RATINGS = {
  professionalism: 4, communication: 4, work_ethic: 4, content_knowledge_skills: 4, overall_contribution: 4, participation: 3,
};
// Ann submits her one rating, as a student would, with the link from her invitation.
async function annSubmits() {
  const { evaluation_token: token } = await Student.findById(IDS.ann);
  const res = await app.request('POST', `/api/evaluate/${token}`, {
    body: { evaluations: [{ student_id: String(IDS.ben), ratings: RATINGS, overall_feedback: 'Reliable and prepared every week.' }] },
  });
  assert.equal(res.status, 201);
}

test.before(async () => {
  process.env.FRONTEND_URL = FRONTEND;
  server = await startDatabase();
  app = await startApp();
  ada = app.tokenFor(IDS.ada, 'ada@example.edu');
  bo = app.tokenFor(IDS.bo, 'bo@example.edu');
});
test.after(async () => {
  delete process.env.FRONTEND_URL;
  await app.close();
  await stopDatabase(server);
});
test.beforeEach(async (t) => {
  t.mock.method(console, 'log', () => {});
  t.mock.method(console, 'error', () => {});
  await clearDatabase();
  await seed();
  clearEmails();
});

test('TC-11-20: before any invitation is sent the status says so and counts nothing', async () => {
  const res = await status(ada);
  assert.equal(res.status, 200);
  assert.equal(res.body.evaluations_sent, false);
  assert.equal(res.body.total_count, 0);
});

test('TC-11-21: after sending, everyone is pending; after one submission the counts and rate follow', async () => {
  await send();
  const before = (await status(ada)).body;
  assert.deepEqual([before.total_count, before.completed_count, before.pending_count, before.completion_rate], [4, 0, 4, 0]);

  await annSubmits();
  const after = (await status(ada)).body;
  assert.deepEqual([after.completed_count, after.pending_count, after.completion_rate], [1, 3, 25]);
  assert.deepEqual(after.students.filter((s) => s.completed).map((s) => s.name), ['Ann Archer']);
  assert.ok(after.students.find((s) => s.completed).last_activity, 'the submission date is shown');
});

test('TC-12-20: a reminder goes only to students who have not submitted, with their existing link', async () => {
  await send();
  await annSubmits();
  const before = (await Student.findById(IDS.ben)).evaluation_token;
  clearEmails();

  const res = await remind(ada);
  assert.equal(res.status, 200);
  assert.equal(res.body.reminders_sent, 3);
  assert.deepEqual(sentEmails.map((e) => e.to).sort(), ['ben@example.edu', 'cy@example.edu', 'di@example.edu']);

  const benEmail = sentEmails.find((e) => e.to === 'ben@example.edu');
  assert.ok(benEmail.html.includes(`${FRONTEND}/evaluate/${before}`), 'the reminder carries the link already sent');
  assert.equal((await Student.findById(IDS.ben)).evaluation_token, before);
});

test('TC-12-21: naming students limits the reminder to them, and a student who already submitted is skipped', async () => {
  await send();
  await annSubmits();
  clearEmails();
  const res = await remind(ada, { student_ids: [String(IDS.ann), String(IDS.cy)] });
  assert.equal(res.status, 200);
  assert.deepEqual(sentEmails.map((e) => e.to), ['cy@example.edu']);
});

test('TC-12-22: a reminder for a student who never got an invitation issues them a working link', async () => {
  const res = await remind(ada, { student_ids: [String(IDS.ben)] });
  assert.equal(res.status, 200);
  const ben = await Student.findById(IDS.ben);
  assert.match(ben.evaluation_token, /^[0-9a-f]{64}$/);
  assert.ok(ben.evaluation_token_expires_at > new Date());
});

test('TC-12-23: when everyone has submitted no reminder is sent', async () => {
  await send();
  for (const [evaluator, target] of [[IDS.ann, IDS.ben], [IDS.ben, IDS.ann], [IDS.cy, IDS.di], [IDS.di, IDS.cy]]) {
    const { evaluation_token: token } = await Student.findById(evaluator);
    const res = await app.request('POST', `/api/evaluate/${token}`, {
      body: { evaluations: [{ student_id: String(target), ratings: RATINGS, overall_feedback: 'Reliable and prepared every week.' }] },
    });
    assert.equal(res.status, 201);
  }
  clearEmails();
  const res = await remind(ada);
  assert.equal(res.body.reminders_sent, 0);
  assert.equal(sentEmails.length, 0);
});

test('TC-12-24: another professor cannot read the status or send reminders, and no email goes out', async () => {
  await send();
  clearEmails();
  const read = await status(bo);
  const reminded = await remind(bo);
  assert.deepEqual([read.status, reminded.status], [404, 404]);
  assert.equal(sentEmails.length, 0);
});

test('TC-12-25: a reset clears the links and the status goes back to "not sent"', async () => {
  await send();
  const reset = await app.request('DELETE', `/api/courses/${IDS.courseAda}/evaluations/reset`, { token: ada });
  assert.equal(reset.status, 200);
  assert.equal(reset.body.tokens_cleared, 4);
  assert.equal((await status(ada)).body.evaluations_sent, false);
});
