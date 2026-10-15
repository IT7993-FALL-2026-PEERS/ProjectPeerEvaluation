const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const Evaluation = require('../models/Evaluation');
const { loadSubmitters, hasSubmitted } = require('../utils/submitted');

// CICD-70: one rule for "has this student submitted?", used by status, reminders, send, extend and
// resubmit. A student has submitted when their submitted mark is set (it survives the deletion of the
// evaluations they wrote, when the people they rated are deleted) or evaluations by them exist.
const id = () => new mongoose.Types.ObjectId();

test('TC-11-30: a student has submitted when the mark is set or evaluations by them exist, and not otherwise', async (t) => {
  const withEvaluations = id();
  const asked = [];
  t.mock.method(Evaluation, 'distinct', async (field, filter) => { asked.push([field, filter]); return [withEvaluations]; });
  const courseId = id();
  const submitters = await loadSubmitters(courseId);

  assert.deepEqual(asked, [['evaluator_id', { course_id: courseId }]]);
  assert.equal(hasSubmitted({ _id: withEvaluations, evaluation_completed: false }, submitters), true, 'evaluations exist');
  assert.equal(hasSubmitted({ _id: id(), evaluation_completed: true }, submitters), true, 'the mark is set, no evaluations');
  assert.equal(hasSubmitted({ _id: id(), evaluation_completed: false }, submitters), false);
  assert.equal(hasSubmitted({ _id: id() }, submitters), false, 'no mark at all');
});
