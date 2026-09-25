const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const Student = require('../models/Student');
const Evaluation = require('../models/Evaluation');
const { submitEvaluation } = require('../controllers/evaluationController');

// No database here: the model calls that would hit MongoDB are stubbed, while the
// controller logic and Mongoose's own schema validation run for real.
const evaluator = {
  _id: new mongoose.Types.ObjectId(),
  course_id: { _id: new mongoose.Types.ObjectId() },
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
  t.mock.method(Student, 'findByIdAndUpdate', async () => {});
  t.mock.method(Evaluation, 'findOne', async () => null);
  t.mock.method(Evaluation.prototype, 'save', async function save() {
    saved.push(this);
    return this;
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
