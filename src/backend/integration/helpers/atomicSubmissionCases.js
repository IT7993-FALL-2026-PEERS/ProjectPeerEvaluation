const test = require('node:test');
const assert = require('node:assert/strict');
const Student = require('../../models/Student');
const Evaluation = require('../../models/Evaluation');
const { startDatabase, stopDatabase, clearDatabase } = require('./db');
const { startApp, clearEmails } = require('./app');
const { seed, IDS } = require('./seed');

// FR-16 / CICD-33: a submission is all or nothing, and a double submit saves once. The same cases
// run on a replica set (transactions) and on a standalone mongod (no transactions), because both
// are in use: Atlas and these tests use a replica set; a local MongoDB and Docker Compose do not.
const RATINGS = {
  professionalism: 4, communication: 5, work_ethic: 4, content_knowledge_skills: 3, overall_contribution: 4, participation: 3,
};
const rating = (studentId) => ({
  student_id: String(studentId),
  ratings: RATINGS,
  overall_feedback: 'Reliable, prepared and easy to work with.',
});

function registerAtomicSubmissionTests({ standalone }) {
  const kind = standalone ? 'standalone mongod' : 'replica set';
  let server;
  let app;
  let ada;

  test.before(async () => {
    server = await startDatabase({ standalone });
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
    clearEmails();
    await app.request('POST', `/api/courses/${IDS.courseAda}/evaluations/send`, { token: ada, body: {} });
  });

  const tokenOf = (studentId) => Student.findById(studentId).then((s) => s.evaluation_token);

  // A third member for team Alpha, so Ann has two teammates to rate.
  async function addFay() {
    const fay = await Student.create({
      student_id: '1007', name: 'Fay Fox', email: 'fay@example.edu',
      course_id: IDS.courseAda, team_id: IDS.teamAlpha, group_assignment: 'Alpha',
    });
    await app.request('POST', `/api/courses/${IDS.courseAda}/evaluations/send`, { token: ada, body: {} });
    return fay;
  }

  test(`TC-16-30 (${kind}): ten submissions at the same moment save exactly one`, async () => {
    const token = await tokenOf(IDS.ann);
    const results = await Promise.all(
      Array.from({ length: 10 }, () => app.request('POST', `/api/evaluate/${token}`, { body: { evaluations: [rating(IDS.ben)] } }))
    );
    const statuses = results.map((r) => r.status).sort();
    assert.deepEqual(statuses, [201, 409, 409, 409, 409, 409, 409, 409, 409, 409]);
    assert.equal(await Evaluation.countDocuments({ evaluator_id: IDS.ann }), 1);
    assert.equal((await Student.findById(IDS.ann)).evaluation_completed, true);
  });

  test(`TC-16-31 (${kind}): a concurrent double submit with two teammates saves two ratings, not four`, async () => {
    const fay = await addFay();
    const token = await tokenOf(IDS.ann);
    const body = { evaluations: [rating(IDS.ben), rating(fay._id)] };
    const results = await Promise.all(Array.from({ length: 6 }, () => app.request('POST', `/api/evaluate/${token}`, { body })));
    assert.equal(results.filter((r) => r.status === 201).length, 1);
    assert.equal(await Evaluation.countDocuments({ evaluator_id: IDS.ann }), 2);
  });

  test(`TC-16-32 (${kind}): a failure after the ratings are written leaves nothing saved, and the student can retry`, async (t) => {
    const fay = await addFay();
    const token = await tokenOf(IDS.ann);
    const body = { evaluations: [rating(IDS.ben), rating(fay._id)] };

    // The write that marks the student done fails, whichever way the code issues it.
    const failing = async () => { throw new Error('simulated database failure'); };
    const mocks = ['findByIdAndUpdate', 'findOneAndUpdate', 'updateOne'].map((name) => t.mock.method(Student, name, failing));

    const failed = await app.request('POST', `/api/evaluate/${token}`, { body });
    assert.equal(failed.status, 500);
    assert.equal(await Evaluation.countDocuments({ evaluator_id: IDS.ann }), 0, 'no rating is left behind');

    mocks.forEach((m) => m.mock.restore());
    const retry = await app.request('POST', `/api/evaluate/${token}`, { body });
    assert.equal(retry.status, 201, 'the student can submit again');
    assert.equal(await Evaluation.countDocuments({ evaluator_id: IDS.ann }), 2);
  });

  test(`TC-16-33 (${kind}): the database refuses a second rating of the same person by the same evaluator`, async () => {
    const make = (feedback) => new Evaluation({
      course_id: IDS.courseAda, student_id: IDS.ben, evaluator_id: IDS.ann, evaluation_token: 'a'.repeat(64),
      ratings: RATINGS, overall_feedback: feedback,
    });
    await make('Reliable, prepared and easy to work with.').save();
    await assert.rejects(make('Second attempt that must not be stored.').save(), (err) => err.code === 11000);
    assert.equal(await Evaluation.countDocuments({ evaluator_id: IDS.ann }), 1);
  });

  test(`TC-16-34 (${kind}): after a reset and a new invitation the same student can submit again`, async () => {
    const first = await app.request('POST', `/api/evaluate/${await tokenOf(IDS.ann)}`, { body: { evaluations: [rating(IDS.ben)] } });
    assert.equal(first.status, 201);

    await app.request('DELETE', `/api/courses/${IDS.courseAda}/evaluations/reset`, { token: ada });
    await app.request('POST', `/api/courses/${IDS.courseAda}/evaluations/send`, { token: ada, body: {} });
    const second = await app.request('POST', `/api/evaluate/${await tokenOf(IDS.ann)}`, { body: { evaluations: [rating(IDS.ben)] } });
    assert.equal(second.status, 201);
    assert.equal(await Evaluation.countDocuments({ evaluator_id: IDS.ann }), 1);
  });
}

module.exports = { registerAtomicSubmissionTests };
