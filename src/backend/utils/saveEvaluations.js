const mongoose = require('mongoose');
const Evaluation = require('../models/Evaluation');
const Student = require('../models/Student');

// Saves a student's whole submission, or none of it (FR-16).
//
// On a replica set (Atlas, and the integration tests) the ratings and the "completed" flag are
// written in one transaction. A standalone mongod, such as a local MongoDB or the Docker Compose
// database, has no transactions, so there the ratings are saved one by one and the ones already
// saved are deleted if anything fails. Either way a duplicate rating is refused by the unique index
// on Evaluation, which is what makes two submissions at the same moment save once.
//
// Throws the database error unchanged; a duplicate has err.code 11000.

// The error a standalone server gives when a transaction is started on it.
function isTransactionUnsupported(err) {
  return Boolean(err) && (err.code === 20 || /Transaction numbers are only allowed/i.test(err.message || ''));
}

async function markCompleted(evaluatorId, options) {
  await Student.updateOne({ _id: evaluatorId }, { evaluation_completed: true }, options);
}

async function saveWithoutTransaction(evaluations, evaluatorId) {
  const savedIds = [];
  try {
    for (const evaluation of evaluations) {
      // Fresh documents: a failed insertMany has already marked the originals as saved.
      await new Evaluation(evaluation.toObject()).save();
      savedIds.push(evaluation._id);
    }
    await markCompleted(evaluatorId);
  } catch (err) {
    // Only what this request saved: another request's ratings are never touched.
    await Evaluation.deleteMany({ _id: { $in: savedIds } });
    throw err;
  }
}

async function saveEvaluations(evaluations, evaluatorId) {
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      await Evaluation.insertMany(evaluations, { session });
      await markCompleted(evaluatorId, { session });
    });
  } catch (err) {
    if (!isTransactionUnsupported(err)) throw err;
    await saveWithoutTransaction(evaluations, evaluatorId);
  } finally {
    await session.endSession();
  }
}

module.exports = { saveEvaluations, isTransactionUnsupported };
