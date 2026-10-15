const test = require('node:test');
const assert = require('node:assert/strict');
const Student = require('../models/Student');
const { startDatabase, stopDatabase, clearDatabase } = require('./helpers/db');
const { startApp, sentEmails, failNextEmails, clearEmails, deadlineBody } = require('./helpers/app');
const { seed, IDS } = require('./helpers/seed');

// FR-10 / CICD-68: extending the deadline. Each student in scope who was invited and has not submitted gets a
// new link valid until the new deadline, and the old link stops working, but only once the new one has been
// emailed. Real database, emails captured at the transport.
let replSet;
let app;
let ada;
let bo;

const FRONTEND = 'https://peers.example.test';
const extendPath = (courseId) => `/api/courses/${courseId}/evaluations/extend`;
const send = () => app.request('POST', `/api/courses/${IDS.courseAda}/evaluations/send`, { token: ada, body: deadlineBody(2) });
const linkIn = (email) => (email.html.match(/\/evaluate\/([0-9a-f]{64})/) || [])[1];

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

test('TC-10-71: extending everyone who has not submitted emails each a new link with the new deadline; the old links stop working', async () => {
  await send();
  const before = await Student.find({ course_id: IDS.courseAda });
  clearEmails();
  const body = { ...deadlineBody(9), scope: 'unsubmitted' };
  const res = await app.request('POST', extendPath(IDS.courseAda), { token: ada, body });
  assert.equal(res.status, 200);
  assert.equal(res.body.extended.length, 4);
  assert.equal(sentEmails.length, 4);
  for (const old of before) {
    const now = await Student.findById(old._id);
    assert.notEqual(now.evaluation_token, old.evaluation_token);
    assert.equal(now.evaluation_token_expires_at.getTime(), Date.parse(body.deadline));
    assert.equal((await app.request('GET', `/api/evaluate/${old.evaluation_token}`)).status, 404, 'the old link is dead');
    assert.equal((await app.request('GET', `/api/evaluate/${now.evaluation_token}`)).status, 200);
    const email = sentEmails.find((e) => e.to === old.email);
    assert.equal(linkIn(email), now.evaluation_token, 'the emailed link is the active one');
    assert.match(email.html, /extended your deadline/);
  }
});

test('TC-10-72: scope student and team reach only them; an expired link is extended too; bad scopes and other courses are refused', async () => {
  await send();
  await Student.findByIdAndUpdate(IDS.ann, { evaluation_token_expires_at: new Date(Date.now() - 1000) });
  clearEmails();
  const one = await app.request('POST', extendPath(IDS.courseAda), { token: ada, body: { ...deadlineBody(5), scope: 'student', student_id: String(IDS.ann) } });
  assert.equal(one.status, 200);
  assert.deepEqual(sentEmails.map((e) => e.to), ['ann@example.edu']);
  clearEmails();
  const team = await app.request('POST', extendPath(IDS.courseAda), { token: ada, body: { ...deadlineBody(5), scope: 'team', team_id: String(IDS.teamBeta) } });
  assert.equal(team.status, 200);
  assert.deepEqual(sentEmails.map((e) => e.to).sort(), ['cy@example.edu', 'di@example.edu']);
  clearEmails();

  for (const body of [
    { ...deadlineBody(5) },
    { ...deadlineBody(5), scope: 'everyone' },
    { ...deadlineBody(5), scope: 'student' },
    { ...deadlineBody(5), scope: 'student', student_id: 'nope' },
    { ...deadlineBody(5), scope: 'student', student_id: { $ne: null } },
    { ...deadlineBody(5), scope: 'team', team_id: String(IDS.ann) },
    { ...deadlineBody(5), scope: 'student', student_id: String(IDS.eve) },
    { scope: 'unsubmitted' },
  ]) {
    const res = await app.request('POST', extendPath(IDS.courseAda), { token: ada, body });
    assert.ok([400, 404].includes(res.status), `${res.status} for ${JSON.stringify(body)}`);
  }
  const other = await app.request('POST', extendPath(IDS.courseAda), { token: bo, body: { ...deadlineBody(5), scope: 'unsubmitted' } });
  assert.equal(other.status, 404, 'another professor');
  assert.equal(sentEmails.length, 0);
});

test('TC-10-73: when the email fails the old link and deadline keep working', async () => {
  await send();
  const ann = await Student.findById(IDS.ann);
  failNextEmails(1);
  const res = await app.request('POST', extendPath(IDS.courseAda), { token: ada, body: { ...deadlineBody(9), scope: 'student', student_id: String(IDS.ann) } });
  assert.equal(res.status, 200);
  assert.equal(res.body.failed.length, 1);
  assert.equal(res.body.extended.length, 0);
  const after = await Student.findById(IDS.ann);
  assert.equal(after.evaluation_token, ann.evaluation_token);
  assert.equal(after.evaluation_token_expires_at.getTime(), ann.evaluation_token_expires_at.getTime());
  assert.equal((await app.request('GET', `/api/evaluate/${ann.evaluation_token}`)).status, 200);
});

test('TC-10-74: students who submitted and students never invited are skipped and counted', async () => {
  await app.request('POST', `/api/courses/${IDS.courseAda}/teams/${IDS.teamAlpha}/evaluations/send`, { token: ada, body: deadlineBody(2) });
  await Student.findByIdAndUpdate(IDS.ben, { evaluation_completed: true });
  clearEmails();
  const res = await app.request('POST', extendPath(IDS.courseAda), { token: ada, body: { ...deadlineBody(9), scope: 'unsubmitted' } });
  assert.deepEqual(res.body.extended, ['Ann Archer']);
  assert.deepEqual(res.body.skipped, { submitted: 1, not_invited: 2, changed: 0 });
  assert.deepEqual(sentEmails.map((e) => e.to), ['ann@example.edu']);
});

test('TC-10-75: if the student submits while the extension email is going out, the new link is not activated', async (t) => {
  await send();
  const ann = await Student.findById(IDS.ann);
  // The submission lands between the email and the swap
  const findOneAndUpdate = Student.findOneAndUpdate;
  let landed = false;
  t.mock.method(Student, 'findOneAndUpdate', async function (filter, update, ...rest) {
    if (!landed && update && update.evaluation_token) {
      landed = true;
      await Student.updateOne({ _id: IDS.ann }, { evaluation_completed: true });
    }
    return findOneAndUpdate.call(this, filter, update, ...rest);
  });
  const res = await app.request('POST', extendPath(IDS.courseAda), { token: ada, body: { ...deadlineBody(9), scope: 'student', student_id: String(IDS.ann) } });
  t.mock.restoreAll();
  assert.equal(res.body.skipped.changed, 1);
  assert.equal(res.body.extended.length, 0);
  assert.equal((await Student.findById(IDS.ann)).evaluation_token, ann.evaluation_token, 'not swapped');
});

test('TC-10-76: two extensions for one student at the same moment leave exactly one new link active, and it is one that was emailed', async (t) => {
  await send();
  clearEmails();
  // Both requests are held at the swap until both have read the student and sent their email, so they really
  // overlap. Without this the first can finish before the second starts, which is two extensions one after
  // the other (both rightly win) and made this test flaky on CI.
  const findOneAndUpdate = Student.findOneAndUpdate;
  const atSwap = [];
  t.mock.method(Student, 'findOneAndUpdate', async function (filter, update, ...rest) {
    if (update && update.evaluation_token) {
      await new Promise((resolve) => {
        atSwap.push(resolve);
        if (atSwap.length === 2) atSwap.forEach((release) => release());
        setTimeout(resolve, 5000);
      });
    }
    return findOneAndUpdate.call(this, filter, update, ...rest);
  });
  const body = { ...deadlineBody(9), scope: 'student', student_id: String(IDS.ann) };
  const [a, b] = await Promise.all([
    app.request('POST', extendPath(IDS.courseAda), { token: ada, body }),
    app.request('POST', extendPath(IDS.courseAda), { token: ada, body }),
  ]);
  t.mock.restoreAll();
  assert.equal(atSwap.length, 2, 'both requests reached the swap together');
  assert.equal(a.body.extended.length + b.body.extended.length, 1);
  assert.equal(a.body.skipped.changed + b.body.skipped.changed, 1);
  const { evaluation_token: current } = await Student.findById(IDS.ann);
  assert.ok(sentEmails.map(linkIn).includes(current));
});
