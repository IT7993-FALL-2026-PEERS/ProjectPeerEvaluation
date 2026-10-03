const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const Student = require('../models/Student');
const Evaluation = require('../models/Evaluation');
const evaluationStore = require('../utils/saveEvaluations');
const { submitEvaluation } = require('../controllers/evaluationController');

// No database here: the model calls that would hit MongoDB are stubbed, while the
// controller logic and Mongoose's own schema validation run for real.
const evaluator = {
  _id: new mongoose.Types.ObjectId(),
  course_id: { _id: new mongoose.Types.ObjectId() },
  evaluation_token_expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000),
};

function validEvaluation(overrides = {}) {
  return {
    student_id: new mongoose.Types.ObjectId().toString(),
    ratings: {
      professionalism: 4,
      communication: 4,
      work_ethic: 4,
      content_knowledge_skills: 4,
      overall_contribution: 4,
      participation: 3,
    },
    overall_feedback: 'Reliable teammate, always met deadlines.',
    ...overrides,
  };
}

async function submit(t, evaluations) {
  const saved = [];
  t.mock.method(Student, 'findOne', () => ({ populate: async () => evaluator }));
  // Everyone rated is a teammate here; who may be rated is tested in evaluationTargets.test.js.
  t.mock.method(Student, 'find', () => ({ select: async () => evaluations.map((e) => ({ _id: e.student_id })) }));
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
  return { saved, error };
}

test('saves nothing when a later evaluation fails the feedback check', async (t) => {
  const { saved, error } = await submit(t, [
    validEvaluation(),
    validEvaluation({ overall_feedback: 'too short' }),
  ]);
  assert.equal(error.status, 400);
  assert.equal(saved.length, 0);
});

test('saves nothing when a later evaluation fails schema validation', async (t) => {
  const bad = validEvaluation();
  bad.ratings.participation = 5; // schema max is 4
  const { saved, error } = await submit(t, [validEvaluation(), bad]);
  assert.equal(error.status, 400);
  assert.equal(saved.length, 0);
});

test('saves every evaluation when all are valid', async (t) => {
  const { saved, error } = await submit(t, [validEvaluation(), validEvaluation()]);
  assert.equal(error, undefined);
  assert.equal(saved.length, 2);
});

// CICD-55: the form only sends whole numbers, but the endpoint is public, so it must not save
// anything else. Mongoose alone accepts 4.5 and casts true to 1 and "4" to 4.
test('TC-16-46: a rating that is not a whole number is refused and nothing is saved', async (t) => {
  for (const value of [4.5, '4', true, [4], NaN]) {
    const bad = validEvaluation();
    bad.ratings.communication = value;
    const { saved, error } = await submit(t, [validEvaluation(), bad]);
    assert.equal(error && error.status, 400, `communication = ${JSON.stringify(value)} should be a 400`);
    assert.equal(error.code, 'VALIDATION_ERROR');
    assert.equal(saved.length, 0);
  }
});

test('TC-16-47: feedback that is not text is a 400, not a server error', async (t) => {
  for (const value of [{}, 123, ['Reliable teammate, always met deadlines.'], true]) {
    const { saved, error } = await submit(t, [validEvaluation({ overall_feedback: value })]);
    assert.equal(error && error.status, 400, `overall_feedback = ${JSON.stringify(value)} should be a 400`);
    assert.equal(error.code, 'VALIDATION_ERROR');
    assert.equal(saved.length, 0);
  }
});
