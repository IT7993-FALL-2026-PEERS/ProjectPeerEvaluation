const test = require('node:test');
const assert = require('node:assert/strict');
const Evaluation = require('../models/Evaluation');
const { startDatabase, stopDatabase, clearDatabase } = require('./helpers/db');
const { seed, IDS } = require('./helpers/seed');
const { findDuplicateEvaluations } = require('../scripts/findDuplicateEvaluations');
const { ORDINARY_RATINGS: RATINGS } = require('./helpers/evaluations');

// CICD-33: the check that runs before the unique index is deployed to a database that already has data.
let server;

const doc = (evaluator, student) => ({
  course_id: IDS.courseAda, evaluator_id: evaluator, student_id: student,
  evaluation_token: 'a'.repeat(64), ratings: RATINGS, overall_feedback: 'Reliable and prepared every week.',
});

test.before(async () => { server = await startDatabase(); });
test.after(async () => { await stopDatabase(server); });
test.beforeEach(async (t) => {
  t.mock.method(console, 'log', () => {});
  await clearDatabase();
  await seed();
});

test('TC-16-36: no duplicates are reported when every evaluator rated each person once', async () => {
  await Evaluation.create([doc(IDS.ann, IDS.ben), doc(IDS.ben, IDS.ann)]);
  assert.deepEqual(await findDuplicateEvaluations(), []);
});

test('TC-16-37: duplicates written before the unique index existed are found and listed', async () => {
  // Data from before the fix: the unique index is not there, so a second rating can be written.
  await Evaluation.collection.dropIndex('evaluator_id_1_student_id_1_course_id_1');
  await Evaluation.collection.insertMany([doc(IDS.ann, IDS.ben), doc(IDS.ann, IDS.ben), doc(IDS.ben, IDS.ann)]);

  const duplicates = await findDuplicateEvaluations();
  assert.equal(duplicates.length, 1);
  assert.equal(String(duplicates[0]._id.evaluator_id), String(IDS.ann));
  assert.equal(duplicates[0].ratings, 2);
  assert.equal(duplicates[0].evaluation_ids.length, 2);
});
