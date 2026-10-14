const test = require('node:test');
const assert = require('node:assert/strict');
const Student = require('../../models/Student');
const Evaluation = require('../../models/Evaluation');
const { startDatabase, stopDatabase, clearDatabase } = require('./db');
const { startApp, clearEmails, deadlineBody } = require('./app');
const { seed, IDS } = require('./seed');
const { STUDENT_RATINGS: RATINGS } = require('./evaluations');

// FR-16 / CICD-33: a submission is all or nothing, and a double submit saves once. The same cases
// run on a replica set (transactions) and on a standalone mongod (no transactions), because both
// are in use: Atlas and these tests use a replica set; a local MongoDB and Docker Compose do not.
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
    await app.request('POST', `/api/courses/${IDS.courseAda}/evaluations/send`, { token: ada, body: deadlineBody() });
  });

  const tokenOf = (studentId) => Student.findById(studentId).then((s) => s.evaluation_token);

  // A third member for team Alpha, so Ann has two teammates to rate.
  async function addFay() {
    const fay = await Student.create({
      student_id: '1007', name: 'Fay Fox', email: 'fay@example.edu',
      course_id: IDS.courseAda, team_id: IDS.teamAlpha, group_assignment: 'Alpha',
    });
    await app.request('POST', `/api/courses/${IDS.courseAda}/evaluations/send`, { token: ada, body: deadlineBody() });
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

  // The fallback path only runs without transactions, so these are for the standalone server.
  if (standalone) {
    test(`TC-16-44 (${kind}): double submits that list the teammates in different orders still save exactly one`, async () => {
      const fay = await addFay();
      const token = await tokenOf(IDS.ann);
      const forward = { evaluations: [rating(IDS.ben), rating(fay._id)] };
      const backward = { evaluations: [rating(fay._id), rating(IDS.ben)] };
      const results = await Promise.all(
        Array.from({ length: 8 }, (_, i) => app.request('POST', `/api/evaluate/${token}`, { body: i % 2 ? backward : forward }))
      );
      assert.equal(results.filter((r) => r.status === 201).length, 1, JSON.stringify(results.map((r) => r.status)));
      assert.equal(await Evaluation.countDocuments({ evaluator_id: IDS.ann }), 2, 'the winner is saved in full');
    });

    test(`TC-16-40 (${kind}): a rating written but not acknowledged is rolled back too, and the student can retry`, async (t) => {
      const fay = await addFay();
      const token = await tokenOf(IDS.ann);
      const body = { evaluations: [rating(IDS.ben), rating(fay._id)] };

      // The second rating reaches the database, then the connection "drops" before save() returns.
      const save = Evaluation.prototype.save;
      let calls = 0;
      const mock = t.mock.method(Evaluation.prototype, 'save', async function lostAcknowledgement(...args) {
        calls += 1;
        const saved = await save.apply(this, args);
        if (calls === 2) throw new Error('connection lost after the write');
        return saved;
      });

      const failed = await app.request('POST', `/api/evaluate/${token}`, { body });
      assert.equal(failed.status, 500);
      assert.equal(await Evaluation.countDocuments({ evaluator_id: IDS.ann }), 0, 'the unacknowledged rating is rolled back too');

      mock.mock.restore();
      assert.equal((await app.request('POST', `/api/evaluate/${token}`, { body })).status, 201);
    });

    test(`TC-16-41 (${kind}): if the rollback itself fails, the error returned is the one that started it`, async (t) => {
      const token = await tokenOf(IDS.ann);
      t.mock.method(Student, 'updateOne', async () => { throw new Error('simulated database failure'); });
      t.mock.method(Evaluation, 'deleteMany', async () => { throw new Error('cleanup failed'); });

      const res = await app.request('POST', `/api/evaluate/${token}`, { body: { evaluations: [rating(IDS.ben)] } });
      assert.equal(res.status, 500);
      assert.equal(res.body.error.message, 'simulated database failure');
    });
  }

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
    await app.request('POST', `/api/courses/${IDS.courseAda}/evaluations/send`, { token: ada, body: deadlineBody() });
    const second = await app.request('POST', `/api/evaluate/${await tokenOf(IDS.ann)}`, { body: { evaluations: [rating(IDS.ben)] } });
    assert.equal(second.status, 201);
    assert.equal(await Evaluation.countDocuments({ evaluator_id: IDS.ann }), 1);
  });

  // CICD-68: the save itself checks that the submission's link is still the student's, still before its
  // deadline. Something changes it between the submission's own checks and the save: an extension swaps in a
  // new link, or the deadline passes. One of the two hooks fires, depending on the database mode.
  function changeDuringSave(t, change) {
    let done = false;
    const once = async () => { if (!done) { done = true; await change(); } };
    const insertMany = Evaluation.insertMany;
    t.mock.method(Evaluation, 'insertMany', async function (...args) { await once(); return insertMany.apply(this, args); });
    const save = Evaluation.prototype.save;
    t.mock.method(Evaluation.prototype, 'save', async function (...args) { await once(); return save.apply(this, args); });
  }

  test(`TC-16-60 (${kind}): a submission whose link is replaced before it saves is refused and saves nothing`, async (t) => {
    const token = await tokenOf(IDS.ann);
    changeDuringSave(t, () => Student.updateOne({ _id: IDS.ann }, { evaluation_token: 'n'.repeat(64) }));
    const res = await app.request('POST', `/api/evaluate/${token}`, { body: { evaluations: [rating(IDS.ben)] } });
    t.mock.restoreAll();
    assert.equal(res.status, 409);
    assert.equal(res.body.error.code, 'LINK_CHANGED');
    assert.equal(await Evaluation.countDocuments({ evaluator_id: IDS.ann }), 0);
    assert.equal((await Student.findById(IDS.ann)).evaluation_completed, false);
  });

  test(`TC-16-61 (${kind}): a submission that reaches the save after its deadline passed is refused and saves nothing`, async (t) => {
    const token = await tokenOf(IDS.ann);
    changeDuringSave(t, () => Student.updateOne({ _id: IDS.ann }, { evaluation_token_expires_at: new Date(Date.now() - 1000) }));
    const res = await app.request('POST', `/api/evaluate/${token}`, { body: { evaluations: [rating(IDS.ben)] } });
    t.mock.restoreAll();
    assert.equal(res.status, 409);
    assert.equal(res.body.error.code, 'LINK_CHANGED');
    assert.equal(await Evaluation.countDocuments({ evaluator_id: IDS.ann }), 0);
  });

  // CICD-68: an approved resubmission replaces the earlier evaluations once, in both database modes.
  async function approvedResubmission() {
    const first = await tokenOf(IDS.ann);
    const ok = await app.request('POST', `/api/evaluate/${first}`, { body: { evaluations: [{ ...rating(IDS.ben), overall_feedback: 'First version of my feedback.' }] } });
    assert.equal(ok.status, 201);
    const allowed = await app.request('POST', `/api/courses/${IDS.courseAda}/students/${IDS.ann}/evaluations/resubmit`, { token: ada, body: deadlineBody(4) });
    assert.equal(allowed.status, 200);
    return tokenOf(IDS.ann);
  }

  test(`TC-16-64 (${kind}): two resubmissions at the same moment save once; the other is refused and the approval is used up`, async () => {
    const second = await approvedResubmission();
    const [a, b] = await Promise.all(['Version A of the second try.', 'Version B of the second try.'].map((feedback) =>
      app.request('POST', `/api/evaluate/${second}`, { body: { evaluations: [{ ...rating(IDS.ben), overall_feedback: feedback }] } })));
    assert.deepEqual([a.status, b.status].sort(), [201, 409]);
    assert.equal(await Evaluation.countDocuments({ evaluator_id: IDS.ann }), 1);
    assert.equal((await Student.findById(IDS.ann)).resubmission_allowed, false);
  });

  test(`TC-16-65 (${kind}): a resubmission that fails mid-save keeps the earlier evaluations and the approval`, async (t) => {
    const second = await approvedResubmission();
    t.mock.method(Evaluation, 'insertMany', async () => { throw new Error('disk full'); });
    t.mock.method(Evaluation.prototype, 'save', async () => { throw new Error('disk full'); });
    const res = await app.request('POST', `/api/evaluate/${second}`, { body: { evaluations: [{ ...rating(IDS.ben), overall_feedback: 'This one will not be saved.' }] } });
    t.mock.restoreAll();
    assert.equal(res.status, 500);
    const kept = await Evaluation.find({ evaluator_id: IDS.ann });
    assert.equal(kept.length, 1);
    assert.equal(kept[0].overall_feedback, 'First version of my feedback.');
    assert.equal((await Student.findById(IDS.ann)).resubmission_allowed, true, 'they can try again');
  });

  // Codex review #4: the deadline is checked against the clock when the guarded write runs, not when the
  // request started, so a slow save cannot slip past the deadline.
  test(`TC-16-69 (${kind}): a save that finishes after the deadline is refused even though it started before it`, async (t) => {
    const token = await tokenOf(IDS.ann);
    await Student.updateOne({ _id: IDS.ann }, { evaluation_token_expires_at: new Date(Date.now() + 400) });
    changeDuringSave(t, () => new Promise((resolve) => { setTimeout(resolve, 600); }));
    const res = await app.request('POST', `/api/evaluate/${token}`, { body: { evaluations: [rating(IDS.ben)] } });
    t.mock.restoreAll();
    assert.equal(res.status, 409);
    assert.equal(await Evaluation.countDocuments({ evaluator_id: IDS.ann }), 0);
  });

  // Codex review #1: a failure while reading or deleting the earlier evaluations loses nothing.
  test(`TC-16-70 (${kind}): a resubmission whose delete of the earlier evaluations fails keeps them and the approval`, async (t) => {
    const second = await approvedResubmission();
    const deleteMany = Evaluation.deleteMany;
    t.mock.method(Evaluation, 'deleteMany', async function (...args) {
      await deleteMany.apply(this, args); // applied, but the acknowledgement is lost
      throw new Error('connection reset');
    });
    const res = await app.request('POST', `/api/evaluate/${second}`, { body: { evaluations: [{ ...rating(IDS.ben), overall_feedback: 'This one will not be saved.' }] } });
    t.mock.restoreAll();
    assert.equal(res.status, 500);
    const kept = await Evaluation.find({ evaluator_id: IDS.ann });
    assert.equal(kept.length, 1);
    assert.equal(kept[0].overall_feedback, 'First version of my feedback.');
    assert.equal((await Student.findById(IDS.ann)).resubmission_allowed, true);
  });

  // Codex review #2: a failed attempt only gives the approval back if the link is still the one it used.
  test(`TC-16-71 (${kind}): a failed resubmission does not switch on an approval after the link changed`, { skip: !standalone && 'the transaction path has no restore step' }, async (t) => {
    const second = await approvedResubmission();
    t.mock.method(Evaluation.prototype, 'save', async function () {
      // Meanwhile the instructor issued a newer link and that approval was used
      await Student.updateOne({ _id: IDS.ann }, { evaluation_token: 'z'.repeat(64), resubmission_allowed: false });
      throw new Error('disk full');
    });
    const res = await app.request('POST', `/api/evaluate/${second}`, { body: { evaluations: [{ ...rating(IDS.ben), overall_feedback: 'This one will not be saved.' }] } });
    t.mock.restoreAll();
    assert.equal(res.status, 500);
    assert.equal((await Student.findById(IDS.ann)).resubmission_allowed, false, 'not switched back on');
  });
}

module.exports = { registerAtomicSubmissionTests };
