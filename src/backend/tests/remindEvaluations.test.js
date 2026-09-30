const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

// The controller destructures emailUtils when it loads, so the send function is
// replaced before the controller is required. No database or SMTP is involved.
const emailUtils = require('../utils/emailUtils');
test.mock.method(emailUtils, 'sendEvaluationReminder', async () => ({ success: true }));

const Course = require('../models/Course');
const Student = require('../models/Student');
const Evaluation = require('../models/Evaluation');
const { remindEvaluations } = require('../controllers/evaluationController');

const completed = [new mongoose.Types.ObjectId()];

async function remind(t, body) {
  let filter;
  t.mock.method(Course, 'findById', async () => ({ _id: 'course-1', course_name: 'Capstone' }));
  t.mock.method(Evaluation, 'find', () => ({ distinct: async () => completed }));
  t.mock.method(Student, 'find', async (f) => { filter = f; return []; });
  await remindEvaluations(
    { params: { course_id: 'course-1' }, body },
    { status() { return this; }, json() {} },
    (err) => { throw err; },
  );
  return filter;
}

// API-8: the query object had `_id` twice, so the $nin silently replaced the $in
// and a reminder meant for chosen students went to everyone who hadn't finished.
test('TC-12-01: reminding chosen students only targets those who have not finished', async (t) => {
  const chosen = [String(new mongoose.Types.ObjectId()), String(new mongoose.Types.ObjectId())];
  const filter = await remind(t, { student_ids: chosen });
  assert.deepEqual(filter._id.$in, chosen);
  assert.deepEqual(filter._id.$nin, completed);
});

test('TC-12-02: with no students chosen, everyone who has not finished is reminded', async (t) => {
  const filter = await remind(t, {});
  assert.equal(filter._id.$in, undefined);
  assert.deepEqual(filter._id.$nin, completed);
});
