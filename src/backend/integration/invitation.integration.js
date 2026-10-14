const test = require('node:test');
const assert = require('node:assert/strict');
const Student = require('../models/Student');
const Course = require('../models/Course');
const Evaluation = require('../models/Evaluation');
const { startDatabase, stopDatabase, clearDatabase } = require('./helpers/db');
const { startApp, sentEmails, failNextEmails, clearEmails } = require('./helpers/app');
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
const teamSendPath = (courseId, teamId) => `/api/courses/${courseId}/teams/${teamId}/evaluations/send`;

// CICD-67: every send carries the instructor's deadline.
const DAY_MS = 24 * 60 * 60 * 1000;
const dueIn = (days) => new Date(Date.now() + days * DAY_MS).toISOString();
const sendBody = (days = 7) => ({ deadline: dueIn(days), deadline_zone: 'America/New_York' });
const submittedBy = (studentId, aboutId) => Evaluation.create({
  course_id: IDS.courseAda, student_id: aboutId, evaluator_id: studentId, evaluation_token: 'e'.repeat(64),
  ratings: { professionalism: 4, communication: 4, work_ethic: 4, content_knowledge_skills: 4, overall_contribution: 4, participation: 3 },
  overall_feedback: 'Reliable and prepared every week.',
});

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
  const res = await app.request('POST', sendPath(IDS.courseAda), { token: ada, body: sendBody() });
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

test('TC-10-21: the deadline is each link\'s expiry, is saved on the course, and is shown in the email in the instructor\'s zone', async () => {
  const body = sendBody(3);
  const res = await app.request('POST', sendPath(IDS.courseAda), { token: ada, body });
  assert.equal(res.body.deadline, body.deadline);
  const ann = await Student.findById(IDS.ann);
  assert.equal(ann.evaluation_token_expires_at.getTime(), Date.parse(body.deadline));
  const course = await Course.findById(IDS.courseAda);
  assert.equal(course.last_evaluation_deadline.getTime(), Date.parse(body.deadline));
  assert.equal(course.last_evaluation_deadline_zone, 'America/New_York');
  assert.match(sentEmails[0].html, /Deadline:<\/strong> [^<]*E[DS]T/, 'the deadline is written in the instructor\'s zone');
});

test('TC-10-22: sending again leaves students who have an active link alone: same link, same deadline, no new email', async () => {
  await app.request('POST', sendPath(IDS.courseAda), { token: ada, body: sendBody() });
  const before = await Student.findById(IDS.ann);
  clearEmails();
  const again = await app.request('POST', sendPath(IDS.courseAda), { token: ada, body: sendBody(30) });
  assert.equal(again.status, 200);
  assert.equal(again.body.emails_sent, 0);
  assert.equal(again.body.already_invited, 4);
  assert.equal(sentEmails.length, 0);
  const after = await Student.findById(IDS.ann);
  assert.equal(after.evaluation_token, before.evaluation_token);
  assert.equal(after.evaluation_token_expires_at.getTime(), before.evaluation_token_expires_at.getTime(), 'and the deadline did not move');
});

test('TC-10-23: sending after a link expired issues a new link with the new deadline', async () => {
  await app.request('POST', sendPath(IDS.courseAda), { token: ada, body: sendBody() });
  const old = (await Student.findById(IDS.ann)).evaluation_token;
  await Student.findByIdAndUpdate(IDS.ann, { evaluation_token_expires_at: new Date(Date.now() - 1000) });
  assert.equal((await app.request('GET', `/api/evaluate/${old}`)).status, 410);

  clearEmails();
  const body = sendBody(10);
  const res = await app.request('POST', sendPath(IDS.courseAda), { token: ada, body });
  assert.equal(res.body.emails_sent, 1, 'only the student whose link expired');
  const fresh = await Student.findById(IDS.ann);
  assert.notEqual(fresh.evaluation_token, old);
  assert.equal(fresh.evaluation_token_expires_at.getTime(), Date.parse(body.deadline));
  assert.equal((await app.request('GET', `/api/evaluate/${fresh.evaluation_token}`)).status, 200);
  assert.equal((await app.request('GET', `/api/evaluate/${old}`)).status, 404, 'the old link no longer exists');
});

test('TC-10-24: sending to one team emails only that team', async () => {
  const res = await app.request('POST', teamSendPath(IDS.courseAda, IDS.teamBeta), { token: ada, body: sendBody() });
  assert.equal(res.status, 200);
  assert.deepEqual(sentEmails.map((e) => e.to).sort(), ['cy@example.edu', 'di@example.edu']);
  assert.equal((await Student.findById(IDS.ann)).evaluation_token, null);
});

test('TC-10-25: another professor cannot send for the course, and no email goes out', async () => {
  for (const path of [sendPath(IDS.courseAda), teamSendPath(IDS.courseAda, IDS.teamBeta)]) {
    const res = await app.request('POST', path, { token: bo, body: sendBody() });
    assert.equal(res.status, 404, path);
  }
  assert.equal(sentEmails.length, 0);
  assert.equal((await Student.findById(IDS.ann)).evaluation_token, null);
});

test('TC-10-26: sending with no request body is refused with a clear 400, not a crash', async () => {
  const post = (path) => fetch(`${app.baseUrl}${path}`, { method: 'POST', headers: { Authorization: `Bearer ${ada}` } });
  const course = await post(sendPath(IDS.courseAda));
  assert.equal(course.status, 400);
  assert.equal((await course.json()).error.code, 'VALIDATION_ERROR');
  const team = await post(teamSendPath(IDS.courseAda, IDS.teamBeta));
  assert.equal(team.status, 400);
  assert.equal(sentEmails.length, 0);
});

test('TC-10-40: a missing, past, far-off or malformed deadline is refused and nothing is sent or stored', async () => {
  const bodies = [{}, { deadline: 'tomorrow' }, { deadline: new Date(Date.now() - DAY_MS).toISOString() },
    { deadline: dueIn(400) }, { deadline: dueIn(1), deadline_zone: 'Nowhere/City' }];
  for (const body of bodies) {
    for (const path of [sendPath(IDS.courseAda), teamSendPath(IDS.courseAda, IDS.teamBeta)]) {
      const res = await app.request('POST', path, { token: ada, body });
      assert.equal(res.status, 400, `${path} ${JSON.stringify(body)}`);
      assert.equal(res.body.error.code, 'VALIDATION_ERROR');
    }
  }
  assert.equal(sentEmails.length, 0);
  assert.equal((await Student.findById(IDS.ann)).evaluation_token, null);
  assert.equal((await Course.findById(IDS.courseAda)).last_evaluation_deadline, null);
});

test('TC-10-41: the answer counts who was invited, who already had a link and who had already submitted', async () => {
  await app.request('POST', teamSendPath(IDS.courseAda, IDS.teamAlpha), { token: ada, body: sendBody() }); // Ann and Ben have links
  await submittedBy(IDS.cy, IDS.di); // Cy has submitted
  clearEmails();
  const res = await app.request('POST', sendPath(IDS.courseAda), { token: ada, body: sendBody() });
  assert.equal(res.body.emails_sent, 1, 'only Di is invited');
  assert.equal(res.body.total_students, 1);
  assert.equal(res.body.already_invited, 2);
  assert.equal(res.body.already_submitted, 1);
  assert.deepEqual(sentEmails.map((e) => e.to), ['di@example.edu']);
});

test('TC-10-42: when nobody needs an invitation it is a 200 that says so, and the course\'s last deadline is not touched', async () => {
  await app.request('POST', sendPath(IDS.courseAda), { token: ada, body: sendBody(5) });
  const kept = (await Course.findById(IDS.courseAda)).last_evaluation_deadline.getTime();
  clearEmails();
  const res = await app.request('POST', sendPath(IDS.courseAda), { token: ada, body: sendBody(50) });
  assert.equal(res.status, 200);
  assert.equal(res.body.emails_sent, 0);
  assert.match(res.body.message, /nobody needs an invitation/i);
  assert.equal((await Course.findById(IDS.courseAda)).last_evaluation_deadline.getTime(), kept);
});

test('TC-10-44: an email that fails leaves no active link, so a later send reaches that student', async () => {
  failNextEmails(1);
  const first = await app.request('POST', teamSendPath(IDS.courseAda, IDS.teamBeta), { token: ada, body: sendBody() });
  assert.equal(first.status, 200);
  assert.equal(first.body.emails_sent, 1);
  assert.equal(first.body.failed.length, 1);
  const failedEmailOf = first.body.failed[0].match(/\(([^)]+)\)/)[1];
  const failedStudent = await Student.findOne({ email: failedEmailOf, course_id: IDS.courseAda });
  assert.equal(failedStudent.evaluation_token, null, 'the claimed link was given back');
  assert.equal(failedStudent.evaluation_token_expires_at, null);

  clearEmails();
  const second = await app.request('POST', teamSendPath(IDS.courseAda, IDS.teamBeta), { token: ada, body: sendBody() });
  assert.equal(second.body.emails_sent, 1);
  assert.deepEqual(sentEmails.map((e) => e.to), [failedEmailOf]);
  assert.match((await Student.findById(failedStudent._id)).evaluation_token, /^[0-9a-f]{64}$/);
});

test('TC-10-45: students who have submitted are skipped even when their link has expired', async () => {
  await app.request('POST', sendPath(IDS.courseAda), { token: ada, body: sendBody() });
  await submittedBy(IDS.ann, IDS.ben);
  await Student.findByIdAndUpdate(IDS.ann, { evaluation_token_expires_at: new Date(Date.now() - 1000) });
  clearEmails();
  const res = await app.request('POST', sendPath(IDS.courseAda), { token: ada, body: sendBody() });
  assert.equal(res.body.emails_sent, 0);
  assert.equal(res.body.already_submitted, 1);
  assert.equal(sentEmails.length, 0);
});

test('TC-10-47: two sends at the same moment issue one link per student, and each student is emailed once', async () => {
  const [a, b] = await Promise.all([
    app.request('POST', sendPath(IDS.courseAda), { token: ada, body: sendBody() }),
    app.request('POST', sendPath(IDS.courseAda), { token: ada, body: sendBody() }),
  ]);
  assert.equal(a.status, 200);
  assert.equal(b.status, 200);
  assert.equal(a.body.emails_sent + b.body.emails_sent, 4, 'four students, four emails in total');
  assert.equal(sentEmails.length, 4);
  for (const email of sentEmails) {
    const student = await Student.findOne({ email: email.to, course_id: IDS.courseAda });
    assert.equal(linkIn(email), `${FRONTEND}/evaluate/${student.evaluation_token}`, 'the emailed link is the stored one');
  }
});

test('TC-10-46: a reminder keeps the same link and deadline, and skips students whose deadline has passed', async () => {
  await app.request('POST', sendPath(IDS.courseAda), { token: ada, body: sendBody(5) });
  const ann = await Student.findById(IDS.ann);
  await Student.findByIdAndUpdate(IDS.ben, { evaluation_token_expires_at: new Date(Date.now() - 1000) });
  clearEmails();
  const res = await app.request('POST', `/api/courses/${IDS.courseAda}/evaluations/remind`, { token: ada, body: {} });
  assert.equal(res.status, 200);
  assert.equal(res.body.reminders_sent, 3);
  assert.deepEqual(res.body.deadline_passed, ['Ben Baker']);
  assert.ok(!sentEmails.some((e) => e.to === 'ben@example.edu'));
  const annAfter = await Student.findById(IDS.ann);
  assert.equal(annAfter.evaluation_token, ann.evaluation_token);
  assert.equal(annAfter.evaluation_token_expires_at.getTime(), ann.evaluation_token_expires_at.getTime());
  assert.equal(linkIn(sentEmails.find((e) => e.to === 'ann@example.edu')), `${FRONTEND}/evaluate/${ann.evaluation_token}`);
  assert.match(sentEmails[0].html, /Due:<\/strong> [^<]*E[DS]T/, 'written in the zone of the last send');
});

// Codex review: different sends can use different zones, so each student's reminder uses the zone of their own send.
test('TC-10-49: a reminder writes each student\'s deadline in the zone of the send that invited them', async () => {
  await app.request('POST', teamSendPath(IDS.courseAda, IDS.teamAlpha), { token: ada, body: { deadline: dueIn(5), deadline_zone: 'America/New_York' } });
  await app.request('POST', teamSendPath(IDS.courseAda, IDS.teamBeta), { token: ada, body: { deadline: dueIn(5), deadline_zone: 'Asia/Tokyo' } });
  clearEmails();
  const res = await app.request('POST', `/api/courses/${IDS.courseAda}/evaluations/remind`, { token: ada, body: {} });
  assert.equal(res.body.reminders_sent, 4);
  const due = (to) => sentEmails.find((e) => e.to === to).html.match(/Due:<\/strong> ([^<]*)</)[1];
  assert.match(due('ann@example.edu'), /E[DS]T/);
  assert.match(due('cy@example.edu'), /GMT\+9|JST/);
});

test('TC-10-48: the form and the status show the deadline before it, and every path refuses with the new message after it', async () => {
  const body = sendBody(2);
  await app.request('POST', sendPath(IDS.courseAda), { token: ada, body });
  const { evaluation_token: link } = await Student.findById(IDS.ann);
  const form = await app.request('GET', `/api/evaluate/${link}`);
  assert.equal(form.status, 200);
  assert.equal(form.body.deadline, body.deadline);
  assert.equal((await app.request('GET', `/api/evaluate/${link}/status`)).body.deadline, body.deadline);

  await Student.findByIdAndUpdate(IDS.ann, { evaluation_token_expires_at: new Date(Date.now() - 1000) });
  for (const [method, path, payload] of [['GET', `/api/evaluate/${link}`], ['GET', `/api/evaluate/${link}/status`], ['POST', `/api/evaluate/${link}`, { evaluations: [] }]]) {
    const res = await app.request(method, path, payload ? { body: payload } : {});
    assert.equal(res.status, 410, `${method} ${path}`);
    assert.equal(res.body.error.code, 'EVALUATION_LINK_EXPIRED');
    assert.equal(res.body.error.message, 'The deadline for this evaluation has passed. Ask your instructor for an extension.');
  }
});

// Codex review: deleting the students someone rated also deletes that evaluation, but the student did
// submit. Only a reset (or, in stage two, an approved resubmission) makes them eligible again.
test('TC-10-43: a student marked as submitted is not invited again, even with no evaluations left, until a reset', async () => {
  await Student.findByIdAndUpdate(IDS.ann, { evaluation_completed: true, evaluation_token: 'f'.repeat(64), evaluation_token_expires_at: new Date(Date.now() - 1000) });
  const res = await app.request('POST', teamSendPath(IDS.courseAda, IDS.teamAlpha), { token: ada, body: sendBody() });
  assert.equal(res.body.already_submitted, 1);
  assert.deepEqual(sentEmails.map((e) => e.to), ['ben@example.edu']);

  const reset = await app.request('DELETE', `/api/courses/${IDS.courseAda}/evaluations/reset`, { token: ada });
  assert.equal(reset.status, 200);
  assert.equal((await Student.findById(IDS.ann)).evaluation_completed, false, 'a reset clears it');
  clearEmails();
  await app.request('POST', teamSendPath(IDS.courseAda, IDS.teamAlpha), { token: ada, body: sendBody() });
  assert.deepEqual(sentEmails.map((e) => e.to).sort(), ['ann@example.edu', 'ben@example.edu']);
});
