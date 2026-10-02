const test = require('node:test');
const assert = require('node:assert/strict');
const Student = require('../models/Student');
const Evaluation = require('../models/Evaluation');
const { startDatabase, stopDatabase, clearDatabase } = require('./helpers/db');
const { startApp, sentEmails, clearEmails } = require('./helpers/app');
const { seed, IDS } = require('./helpers/seed');

// FR-09 / FR-16: the student path, from the invitation to a saved evaluation. The student has no
// login; the link token is the only credential, and it is taken from the captured email, as a
// student would.
let replSet;
let app;
let ada;

const RATINGS = {
  professionalism: 4, communication: 5, work_ethic: 4, content_knowledge_skills: 3, overall_contribution: 4, participation: 3,
};
const rating = (studentId, overrides = {}) => ({
  student_id: String(studentId),
  ratings: { ...RATINGS, ...overrides.ratings },
  overall_feedback: overrides.overall_feedback ?? 'Reliable, prepared and easy to work with.',
});

// Sends the invitations as Ada and returns the token from the link in a student's email.
async function tokenFromEmail(address) {
  const email = sentEmails.find((e) => e.to === address);
  return email.html.match(/\/evaluate\/([0-9a-f]{64})/)[1];
}

test.before(async () => {
  replSet = await startDatabase();
  app = await startApp();
  ada = app.tokenFor(IDS.ada, 'ada@example.edu');
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
  clearEmails();
  await app.request('POST', `/api/courses/${IDS.courseAda}/evaluations/send`, { token: ada, body: {} });
});

test('TC-16-20: a student opens the link from the email and sees only their teammate and the rubric', async () => {
  const token = await tokenFromEmail('ann@example.edu');
  const res = await app.request('GET', `/api/evaluate/${token}`);
  assert.equal(res.status, 200);
  assert.equal(res.body.evaluator.name, 'Ann Archer');
  assert.equal(res.body.evaluator.team, 'Alpha');
  assert.deepEqual(res.body.teammates.map((t) => t.name), ['Ben Baker']);
  assert.equal(res.body.rubric.criteria.length, 6);
});

test('TC-16-21: a complete submission is saved against the right people and marks the student done', async () => {
  const token = await tokenFromEmail('ann@example.edu');
  const res = await app.request('POST', `/api/evaluate/${token}`, { body: { evaluations: [rating(IDS.ben)] } });
  assert.equal(res.status, 201);

  const saved = await Evaluation.find({ course_id: IDS.courseAda });
  assert.equal(saved.length, 1);
  assert.equal(String(saved[0].evaluator_id), String(IDS.ann));
  assert.equal(String(saved[0].student_id), String(IDS.ben));
  assert.equal(saved[0].ratings.communication, 5);
  assert.equal((await Student.findById(IDS.ann)).evaluation_completed, true);
  assert.equal((await Student.findById(IDS.ben)).evaluation_completed, false);
});

test('TC-16-22: the professor sees the submission in the course status', async () => {
  const token = await tokenFromEmail('ann@example.edu');
  await app.request('POST', `/api/evaluate/${token}`, { body: { evaluations: [rating(IDS.ben)] } });
  const status = await app.request('GET', `/api/courses/${IDS.courseAda}/evaluations/status`, { token: ada });
  assert.equal(status.status, 200);
  assert.equal(status.body.total_count, 4);
  assert.equal(status.body.completed_count, 1);
  assert.deepEqual(status.body.students.filter((s) => s.completed).map((s) => s.name), ['Ann Archer']);
});

test('TC-16-23: a second submission with the same link gets 409 and saves nothing more', async () => {
  const token = await tokenFromEmail('ann@example.edu');
  await app.request('POST', `/api/evaluate/${token}`, { body: { evaluations: [rating(IDS.ben)] } });
  const again = await app.request('POST', `/api/evaluate/${token}`, { body: { evaluations: [rating(IDS.ben, { overall_feedback: 'Changed my mind about this.' })] } });
  assert.equal(again.status, 409);
  assert.equal(await Evaluation.countDocuments({ course_id: IDS.courseAda }), 1);

  const form = await app.request('GET', `/api/evaluate/${token}`);
  assert.equal(form.body.completed, true);
});

test('TC-16-24: rating someone outside the team or yourself gets 400 and saves nothing (API-2)', async () => {
  const token = await tokenFromEmail('ann@example.edu');
  for (const target of [IDS.cy, IDS.ann]) {
    const res = await app.request('POST', `/api/evaluate/${token}`, { body: { evaluations: [rating(target)] } });
    assert.equal(res.status, 400);
  }
  assert.equal(await Evaluation.countDocuments({}), 0);
  assert.equal((await Student.findById(IDS.ann)).evaluation_completed, false);
});

test('TC-16-25: invalid ratings or feedback get 400 and save nothing, so the student can try again', async () => {
  const token = await tokenFromEmail('ann@example.edu');
  const bad = [
    rating(IDS.ben, { ratings: { communication: 6 } }),
    rating(IDS.ben, { ratings: { participation: 5 } }),
    rating(IDS.ben, { overall_feedback: 'too short' }),
  ];
  for (const evaluation of bad) {
    const res = await app.request('POST', `/api/evaluate/${token}`, { body: { evaluations: [evaluation] } });
    assert.equal(res.status, 400);
  }
  assert.equal(await Evaluation.countDocuments({}), 0);
  const ok = await app.request('POST', `/api/evaluate/${token}`, { body: { evaluations: [rating(IDS.ben)] } });
  assert.equal(ok.status, 201);
});

test('TC-16-26: a team of three needs a rating for each teammate, and a bad second one saves neither', async () => {
  const fay = await Student.create({
    student_id: '1007', name: 'Fay Fox', email: 'fay@example.edu',
    course_id: IDS.courseAda, team_id: IDS.teamAlpha, group_assignment: 'Alpha',
  });
  await app.request('POST', `/api/courses/${IDS.courseAda}/evaluations/send`, { token: ada, body: {} });
  const token = (await Student.findById(IDS.ann)).evaluation_token;

  const onlyOne = await app.request('POST', `/api/evaluate/${token}`, { body: { evaluations: [rating(IDS.ben)] } });
  assert.equal(onlyOne.status, 400, 'a missing teammate is refused');

  const badSecond = await app.request('POST', `/api/evaluate/${token}`, {
    body: { evaluations: [rating(IDS.ben), rating(fay._id, { ratings: { communication: 9 } })] },
  });
  assert.equal(badSecond.status, 400);
  assert.equal(await Evaluation.countDocuments({}), 0, 'the valid first rating was not saved alone');

  const both = await app.request('POST', `/api/evaluate/${token}`, { body: { evaluations: [rating(IDS.ben), rating(fay._id)] } });
  assert.equal(both.status, 201);
  assert.equal(await Evaluation.countDocuments({ evaluator_id: IDS.ann }), 2);
});

test('TC-16-27: an unknown token gets 404 and an expired one gets 410, with nothing saved', async () => {
  const unknown = await app.request('POST', `/api/evaluate/${'0'.repeat(64)}`, { body: { evaluations: [rating(IDS.ben)] } });
  assert.equal(unknown.status, 404);

  const token = await tokenFromEmail('ann@example.edu');
  await Student.findByIdAndUpdate(IDS.ann, { evaluation_token_expires_at: new Date(Date.now() - 1000) });
  const expired = await app.request('POST', `/api/evaluate/${token}`, { body: { evaluations: [rating(IDS.ben)] } });
  assert.equal(expired.status, 410);
  assert.equal(await Evaluation.countDocuments({}), 0);
});
