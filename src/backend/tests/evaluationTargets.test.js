const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const Student = require('../models/Student');
const Evaluation = require('../models/Evaluation');
const evaluationStore = require('../utils/saveEvaluations');
const { submitEvaluation } = require('../controllers/evaluationController');

// API-2: a submission used to be saved for whatever student_ids it named, so a
// student could rate themselves, rate someone outside their team, rate one
// teammate twice, or skip a teammate and then be locked out by the duplicate
// guard. The targets must now be exactly the teammates the form shows.
// No database: model calls are stubbed, controller logic runs for real.
const teamId = new mongoose.Types.ObjectId();
const evaluator = {
  _id: new mongoose.Types.ObjectId(),
  course_id: { _id: new mongoose.Types.ObjectId() },
  team_id: teamId,
  evaluation_token_expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000),
};
const bob = new mongoose.Types.ObjectId();
const carol = new mongoose.Types.ObjectId();

function rating(studentId) {
  return {
    student_id: String(studentId),
    ratings: {
      professionalism: 4,
      communication: 4,
      work_ethic: 4,
      content_knowledge_skills: 4,
      overall_contribution: 4,
      participation: 3,
    },
    overall_feedback: 'Reliable teammate, always met deadlines.',
  };
}

async function submit(t, evaluations) {
  const saved = [];
  let teammateQuery;
  t.mock.method(Student, 'findOne', () => ({ populate: async () => evaluator }));
  t.mock.method(Student, 'find', (filter) => {
    teammateQuery = filter;
    return { select: async () => [{ _id: bob }, { _id: carol }] };
  });
  t.mock.method(Evaluation, 'findOne', async () => null);
  // The save itself (transaction, unique index) is tested against a real database in integration/.
  t.mock.method(evaluationStore, 'saveEvaluations', async (evaluations) => {
    saved.push(...evaluations);
  });
  t.mock.method(console, 'error', () => {});

  let error;
  const res = { status() { return this; }, json() {} };
  await submitEvaluation(
    { params: { token: 'tok' }, body: { evaluations } },
    res,
    (err) => { error = err; },
  );
  return { saved, error, teammateQuery };
}

test('TC-13-01: rating every teammate once is saved', async (t) => {
  const { saved, error, teammateQuery } = await submit(t, [rating(bob), rating(carol)]);
  assert.equal(error, undefined);
  assert.equal(saved.length, 2);
  // Teammates are found the same way as for the form: same team, not the evaluator.
  assert.equal(String(teammateQuery.team_id), String(teamId));
  assert.equal(String(teammateQuery._id.$ne), String(evaluator._id));
});

test('TC-13-02: rating yourself is rejected and nothing is saved', async (t) => {
  const { saved, error } = await submit(t, [rating(bob), rating(carol), rating(evaluator._id)]);
  assert.equal(error.status, 400);
  assert.equal(error.code, 'VALIDATION_ERROR');
  assert.equal(saved.length, 0);
});

test('TC-13-03: rating someone outside the team is rejected and nothing is saved', async (t) => {
  const outsider = new mongoose.Types.ObjectId();
  const { saved, error } = await submit(t, [rating(bob), rating(outsider)]);
  assert.equal(error.status, 400);
  assert.equal(saved.length, 0);
});

test('TC-13-04: leaving out a teammate is rejected and nothing is saved', async (t) => {
  const { saved, error } = await submit(t, [rating(bob)]);
  assert.equal(error.status, 400);
  assert.match(error.message, /every teammate/i);
  assert.equal(saved.length, 0);
});

test('TC-16-01: rating the same teammate twice in one submission is rejected', async (t) => {
  const { saved, error } = await submit(t, [rating(bob), rating(bob), rating(carol)]);
  assert.equal(error.status, 400);
  assert.equal(saved.length, 0);
});

test('a malformed student_id is rejected and nothing is saved', async (t) => {
  const { saved, error } = await submit(t, [rating(bob), { ...rating(carol), student_id: { $ne: null } }]);
  assert.equal(error.status, 400);
  assert.equal(saved.length, 0);
});

// String(['<id>']) is '<id>', so the check must not stringify whatever it gets.
test('a student_id sent as an array is rejected before any other check', async (t) => {
  const { saved, error } = await submit(t, [rating(bob), { ...rating(carol), student_id: [String(carol)] }]);
  assert.equal(error.status, 400);
  assert.match(error.message, /current teammates/);
  assert.equal(saved.length, 0);
});

test('without a team, the rest of the course counts as teammates, as on the form', async (t) => {
  const { team_id: _unused, ...noTeam } = evaluator;
  t.mock.method(Student, 'findOne', () => ({ populate: async () => noTeam }));
  let filter;
  t.mock.method(Student, 'find', (f) => { filter = f; return { select: async () => [{ _id: bob }] }; });
  t.mock.method(Evaluation, 'findOne', async () => null);
  t.mock.method(evaluationStore, 'saveEvaluations', async () => {});

  let error;
  await submitEvaluation(
    { params: { token: 'tok' }, body: { evaluations: [rating(bob)] } },
    { status() { return this; }, json() {} },
    (err) => { error = err; },
  );
  assert.equal(error, undefined);
  assert.equal(String(filter.course_id), String(evaluator.course_id._id));
});
