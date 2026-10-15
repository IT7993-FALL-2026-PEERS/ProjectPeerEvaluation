const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const Student = require('../models/Student');
const { rotateLink } = require('../utils/linkRotation');

// CICD-68: a new link replaces the old one only if the old one is still the student's (compare-and-set).
test('TC-16-62: rotateLink swaps the link only while the old token is still current, and says whether it did', async (t) => {
  const calls = [];
  t.mock.method(Student, 'findOneAndUpdate', async (filter, update) => {
    calls.push({ filter, update });
    return calls.length === 1 ? { _id: filter._id } : null;
  });
  const student = { _id: new mongoose.Types.ObjectId(), evaluation_token: 'old' };
  const deadline = new Date(Date.now() + 86400000);

  assert.equal(await rotateLink(student, 'new', deadline, 'America/New_York', { filter: { evaluation_completed: { $ne: true } } }), true);
  assert.equal(await rotateLink(student, 'new2', deadline, 'UTC', { set: { resubmission_allowed: true } }), false);

  assert.deepEqual(calls[0].filter, { _id: student._id, evaluation_token: 'old', evaluation_completed: { $ne: true } });
  assert.equal(calls[0].update.evaluation_token, 'new');
  assert.equal(calls[0].update.evaluation_token_expires_at.getTime(), deadline.getTime());
  assert.equal(calls[0].update.evaluation_deadline_zone, 'America/New_York');
  assert.equal(calls[1].update.resubmission_allowed, true);
});

test('a student with no link yet is matched on a null token', async (t) => {
  let seen;
  t.mock.method(Student, 'findOneAndUpdate', async (filter) => { seen = filter; return null; });
  await rotateLink({ _id: new mongoose.Types.ObjectId() }, 'new', new Date(Date.now() + 1000), 'UTC');
  assert.equal(seen.evaluation_token, null);
});
