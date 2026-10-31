const test = require('node:test');
const assert = require('node:assert/strict');
const Student = require('../models/Student');
const { generateEvaluationToken } = require('../utils/evaluationToken');
const { startDatabase, stopDatabase, clearDatabase } = require('./helpers/db');
const { startApp, sentEmails, clearEmails, deadlineBody } = require('./helpers/app');
const { seed, IDS } = require('./helpers/seed');

// CICD-72: a student alone on a team has nobody to rate, so send, reminders, extend, status and submit all
// treat them the same way. CICD-79: so does a student with no team (they do not rate the rest of the course).
// Real database, emails captured at the transport.
let replSet;
let app;
let ada;

const course = (path) => `/api/courses/${IDS.courseAda}/${path}`;
const sendCourse = () => app.request('POST', course('evaluations/send'), { token: ada, body: deadlineBody(5) });
const sendTeam = (teamId) => app.request('POST', course(`teams/${teamId}/evaluations/send`), { token: ada, body: deadlineBody(5) });
const moveBenToBeta = () => Student.updateOne({ _id: IDS.ben }, { team_id: IDS.teamBeta, group_assignment: 'Team 2' });
const moveBenToAlpha = () => Student.updateOne({ _id: IDS.ben }, { team_id: IDS.teamAlpha, group_assignment: 'Team 1' });

test.before(async () => {
  process.env.FRONTEND_URL = 'https://peers.example.test';
  replSet = await startDatabase();
  app = await startApp();
  ada = app.tokenFor(IDS.ada, 'ada@example.edu');
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
  await moveBenToBeta(); // Ann is now alone on Team 1; Team 2 is Ben, Cy and Di
});

test('TC-10-78: a course send skips the student alone on a team, names them, and emails the others', async () => {
  const { status, body } = await sendCourse();
  assert.equal(status, 200);
  assert.deepEqual(body.no_teammates, ['Ann Archer']);
  assert.equal(body.emails_sent, 3);
  assert.equal(sentEmails.some((mail) => mail.to === 'ann@example.edu'), false);
  const ann = await Student.findById(IDS.ann);
  assert.ok(!ann.evaluation_token, 'no link was issued');
});

test('TC-10-79: sending to the lone student\'s team reaches nobody and says why', async () => {
  const { status, body } = await sendTeam(IDS.teamAlpha);
  assert.equal(status, 200);
  assert.equal(body.emails_sent, 0);
  assert.deepEqual(body.no_teammates, ['Ann Archer']);
  assert.equal(sentEmails.length, 0);
  assert.doesNotMatch(body.message, /already has an active link or has submitted/i);
});

test('TC-10-80: once a teammate is added, the next send reaches the student', async () => {
  await sendCourse();
  clearEmails();
  await moveBenToAlpha();
  const { body } = await sendCourse();
  assert.deepEqual(body.no_teammates, []);
  assert.equal(sentEmails.filter((mail) => mail.to === 'ann@example.edu').length, 1);
});

const remind = () => app.request('POST', course('evaluations/remind'), { token: ada, body: {} });

test('TC-12-28: a reminder does not count the lone student as not invited, and names them', async () => {
  await sendCourse(); // Ben, Cy and Di hold links; Ann was skipped
  clearEmails();
  const { body } = await remind();
  assert.equal(body.reminders_sent, 3);
  assert.equal(body.not_invited, 0);
  assert.deepEqual(body.no_teammates, ['Ann Archer']);
});

test('TC-12-29: when only a lone student is unfinished, the answer does not say everything is completed', async () => {
  await Student.updateMany({ _id: { $in: [IDS.ben, IDS.cy, IDS.di] } }, { evaluation_completed: true });
  const { body } = await remind();
  assert.equal(body.reminders_sent, 0);
  assert.deepEqual(body.no_teammates, ['Ann Archer']);
  assert.doesNotMatch(body.message, /all evaluations completed/i);
});

const status = () => app.request('GET', course('evaluations/status'), { token: ada });

test('TC-11-34: status lists the lone student as having nobody to rate and leaves them out of the counts', async () => {
  await sendCourse();
  const { body } = await status();
  const row = (name) => body.students.find((student) => student.name === name);
  assert.equal(row('Ann Archer').nobody_to_rate, true);
  assert.equal(row('Cy Cole').nobody_to_rate, false);
  assert.equal(body.students.length, 4);
  assert.equal(body.total_count, 3);
  assert.equal(body.pending_count, 3);
});

test('TC-11-35: the course reads 100% when everyone with someone to rate has submitted, and a lone student who submitted earlier still counts', async () => {
  await sendCourse();
  await Student.updateMany({ _id: { $in: [IDS.ben, IDS.cy, IDS.di] } }, { evaluation_completed: true });
  let { body } = await status();
  assert.equal(body.completed_count, 3);
  assert.equal(body.total_count, 3);
  assert.equal(body.completion_rate, 100);

  await Student.updateOne({ _id: IDS.ann }, { evaluation_completed: true }); // submitted before her team shrank
  ({ body } = await status());
  assert.equal(body.students.find((student) => student.name === 'Ann Archer').nobody_to_rate, false);
  assert.equal(body.total_count, 4);
  assert.equal(body.completed_count, 4);
});

// Ann holds a link from before her team shrank to one
const giveAnnALink = async () => {
  const token = generateEvaluationToken();
  await Student.updateOne({ _id: IDS.ann }, { evaluation_token: token, evaluation_token_expires_at: new Date(Date.now() + 3600 * 1000) });
  return token;
};

test('TC-16-74: a student with nobody to rate sees an empty teammate list and a submit is refused with a clear reason', async () => {
  const token = await giveAnnALink();
  const form = await app.request('GET', `/api/evaluate/${token}`);
  assert.equal(form.status, 200);
  assert.deepEqual(form.body.teammates, []);

  const submit = await app.request('POST', `/api/evaluate/${token}`, { body: { evaluations: [] } });
  assert.equal(submit.status, 409);
  assert.equal(submit.body.error.code, 'NO_TEAMMATES');
  assert.match(submit.body.error.message, /no teammates to rate/i);
});

test('TC-10-81: extending everyone does not email the lone student a new link, and counts them', async () => {
  const token = await giveAnnALink();
  clearEmails();
  const { status, body } = await app.request('POST', course('evaluations/extend'), { token: ada, body: { scope: 'unsubmitted', ...deadlineBody(5) } });
  assert.equal(status, 200);
  assert.equal(body.skipped.no_teammates, 1);
  assert.equal(sentEmails.some((mail) => mail.to === 'ann@example.edu'), false);
  assert.equal((await Student.findById(IDS.ann)).evaluation_token, token, 'her link is untouched');
});

test('TC-10-82: extending one student in a team of two still works (the counts come from the whole course)', async () => {
  await moveBenToAlpha(); // Team 1 is Ann and Ben again
  await sendCourse();
  clearEmails();
  const { body } = await app.request('POST', course('evaluations/extend'), { token: ada, body: { scope: 'student', student_id: String(IDS.ann), ...deadlineBody(9) } });
  assert.deepEqual(body.extended, ['Ann Archer']);
  assert.equal(body.skipped.no_teammates, 0);
});

test('TC-16-75: a resubmission is refused for a student with nobody to rate', async () => {
  await Student.updateOne({ _id: IDS.ann }, { evaluation_completed: true });
  clearEmails();
  const { status, body } = await app.request('POST', `/api/courses/${IDS.courseAda}/students/${IDS.ann}/evaluations/resubmit`, { token: ada, body: deadlineBody(5) });
  assert.equal(status, 409);
  assert.equal(body.error.code, 'NO_TEAMMATES');
  assert.equal(sentEmails.length, 0);
});

test('TC-11-36: before anything is sent, the status names the students a send cannot invite', async () => {
  const { body } = await status();
  assert.equal(body.evaluations_sent, false);
  assert.deepEqual(body.no_teammates, ['Ann Archer']);
});

test('TC-11-37: a course whose only student has no team and nobody to rate says so, instead of only offering to send', async () => {
  const bo = app.tokenFor(IDS.bo, 'bo@example.edu');
  const { body } = await app.request('GET', `/api/courses/${IDS.courseBo}/evaluations/status`, { token: bo });
  assert.equal(body.evaluations_sent, false);
  assert.deepEqual(body.no_teammates, ['Eve Evans']);
});

// CICD-79: the team is optional, and a student without one is not asked to rate anybody (the instructor is
// told instead). Before CICD-79 such a student rated the whole course.
const takeAnnOutOfHerTeam = () => Student.updateOne({ _id: IDS.ann }, { team_id: null, group_assignment: null });

test('TC-10-83: a course send skips a student with no team, names them, and emails the others', async () => {
  await takeAnnOutOfHerTeam();
  const { status, body } = await sendCourse();
  assert.equal(status, 200);
  assert.deepEqual(body.no_teammates, ['Ann Archer']);
  assert.equal(body.emails_sent, 3);
  assert.equal(sentEmails.some((mail) => mail.to === 'ann@example.edu'), false);
  assert.ok(!(await Student.findById(IDS.ann)).evaluation_token, 'no link was issued');
});

test('TC-16-77: a student with no team gets an empty form, and a submit is refused with the no-teammates reason', async () => {
  const token = await giveAnnALink();
  await takeAnnOutOfHerTeam();

  const form = await app.request('GET', `/api/evaluate/${token}`);
  assert.equal(form.status, 200);
  assert.deepEqual(form.body.teammates, []);

  const submit = await app.request('POST', `/api/evaluate/${token}`, { body: { evaluations: [{ student_id: String(IDS.cy), ratings: {}, overall_feedback: 'x' }] } });
  assert.equal(submit.status, 409);
  assert.equal(submit.body.error.code, 'NO_TEAMMATES');
});

test('TC-11-38: before anything is sent, the status names a student with no team and marks them as having nobody to rate', async () => {
  await takeAnnOutOfHerTeam();
  const { body } = await status();
  assert.equal(body.evaluations_sent, false);
  assert.deepEqual(body.no_teammates, ['Ann Archer']);
});

// CICD-80: the instructor is told BEFORE sending who a send cannot reach (alone on a team, or no team), so the
// assignment can be checked. A preview changes nothing: no link is issued and no email goes out.
const preview = (path = 'evaluations/send-preview', token = ada) => app.request('GET', course(path), { token });

test('TC-10-84: the send preview names the students a course send cannot reach and counts the others, and sends nothing', async () => {
  const { status, body } = await preview();
  assert.equal(status, 200);
  assert.deepEqual(body.no_teammates, ['Ann Archer']);
  assert.equal(body.will_invite, 3);
  assert.equal(sentEmails.length, 0);
  assert.equal(await Student.countDocuments({ evaluation_token: { $ne: null } }), 0, 'no link was issued');

  // A student with no team is named too (CICD-79), and a student who already has a link is not counted again.
  await Student.updateOne({ _id: IDS.ben }, { team_id: null, group_assignment: null });
  await Student.updateOne({ _id: IDS.cy }, { evaluation_token: generateEvaluationToken(), evaluation_token_expires_at: new Date(Date.now() + 3600 * 1000) });
  const again = await preview();
  assert.deepEqual([...again.body.no_teammates].sort(), ['Ann Archer', 'Ben Baker']);
  assert.equal(again.body.will_invite, 1);
});

test('TC-10-85: the team send preview names a student alone on the team, and is empty for a team of three', async () => {
  const alone = await preview(`teams/${IDS.teamAlpha}/evaluations/send-preview`);
  assert.equal(alone.status, 200);
  assert.deepEqual(alone.body.no_teammates, ['Ann Archer']);
  assert.equal(alone.body.will_invite, 0);

  const three = await preview(`teams/${IDS.teamBeta}/evaluations/send-preview`);
  assert.deepEqual(three.body.no_teammates, []);
  assert.equal(three.body.will_invite, 3);
  assert.equal(sentEmails.length, 0);
});

test('TC-10-86: the send previews are for the course\'s own professor, and a team of another course is not found', async () => {
  const bo = app.tokenFor(IDS.bo, 'bo@example.edu');
  assert.equal((await preview('evaluations/send-preview', bo)).status, 404, 'another professor, course');
  assert.equal((await preview(`teams/${IDS.teamAlpha}/evaluations/send-preview`, bo)).status, 404, 'another professor, team');
  const wrongCourse = await app.request('GET', `/api/courses/${IDS.courseBo}/teams/${IDS.teamAlpha}/evaluations/send-preview`, { token: bo });
  assert.equal(wrongCourse.status, 404, 'a team of another course');
  assert.equal((await preview('evaluations/send-preview', '')).status, 401, 'not logged in');
});
