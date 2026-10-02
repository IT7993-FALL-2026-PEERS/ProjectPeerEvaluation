const test = require('node:test');
const assert = require('node:assert/strict');
const Evaluation = require('../models/Evaluation');
const { startDatabase, stopDatabase, clearDatabase } = require('./helpers/db');
const { seed, IDS } = require('./helpers/seed');
const { ensureEvaluationIndexes } = require('../utils/ensureIndexes');

// CICD-33: the unique index is what makes a double submit save once. If old duplicate ratings stop it
// from being built, the service must say so at startup instead of silently running without it.
let server;
const INDEX = 'evaluator_id_1_student_id_1_course_id_1';

const RATINGS = {
  professionalism: 4, communication: 4, work_ethic: 4, content_knowledge_skills: 4, overall_contribution: 4, participation: 3,
};
const doc = () => ({
  course_id: IDS.courseAda, evaluator_id: IDS.ann, student_id: IDS.ben,
  evaluation_token: 'a'.repeat(64), ratings: RATINGS, overall_feedback: 'Reliable and prepared every week.',
});
const recorder = () => { const messages = []; return { messages, error: (m) => messages.push(m) }; };

test.before(async () => { server = await startDatabase(); });
test.after(async () => { await stopDatabase(server); });
test.beforeEach(async () => {
  await clearDatabase();
  await seed();
});

test('TC-16-42: with no duplicates the index is built (or already there) and nothing is logged', async () => {
  const log = recorder();
  assert.equal(await ensureEvaluationIndexes(log), true);
  assert.deepEqual(log.messages, []);
  assert.ok((await Evaluation.collection.indexes()).some((i) => i.name === INDEX && i.unique));
});

test('TC-16-43: with duplicate ratings already stored the index cannot be built, and a warning says how to fix it', async () => {
  await Evaluation.collection.dropIndex(INDEX);
  await Evaluation.collection.insertMany([doc(), doc()]);

  const log = recorder();
  assert.equal(await ensureEvaluationIndexes(log), false);
  assert.equal(log.messages.length, 1);
  assert.match(log.messages[0], /duplicate-submission protection is OFF/);
  assert.match(log.messages[0], /findDuplicateEvaluations\.js/);
});
