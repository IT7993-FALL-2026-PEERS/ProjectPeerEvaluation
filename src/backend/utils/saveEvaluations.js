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

// The error a standalone server gives when a transaction is started on it. Matched by its message:
// its code (20, IllegalOperation) is shared by unrelated errors, and mistaking one of those for this
// would quietly save a submission without the transaction.
function isTransactionUnsupported(err) {
  return Boolean(err) && /Transaction numbers are only allowed/i.test(err.message || '');
}

async function markCompleted(evaluatorId, options) {
  await Student.updateOne({ _id: evaluatorId }, { evaluation_completed: true }, options);
}

// Best effort, for databases without transactions (local MongoDB, Docker Compose); Atlas uses the
// transaction path. If the process dies mid-way the ratings already written stay, which a real
// transaction would not allow.
async function saveWithoutTransaction(evaluations, evaluatorId) {
  // Every request writes in the same order (by person rated), whatever order the payload listed them
  // in. Two requests at the same moment then collide on the same first rating, one wins whole and the
  // other writes nothing; in different orders each could trip the other's first rating and both roll
  // back, saving nothing.
  const inOrder = [...evaluations].sort((a, b) => String(a.student_id).localeCompare(String(b.student_id)));
  try {
    for (const evaluation of inOrder) {
      // Fresh documents: a failed insertMany has already marked the originals as saved.
      await new Evaluation(evaluation.toObject()).save();
    }
    await markCompleted(evaluatorId);
  } catch (err) {
    // Every _id this request meant to write, saved or not: a write whose acknowledgement was lost
    // may be in the database although save() threw. The ids were generated for this request, so
    // another request's ratings are never matched.
    try {
      await Evaluation.deleteMany({ _id: { $in: evaluations.map((e) => e._id) } });
    } catch (cleanupError) {
      // Report the failure that started it, not the cleanup's.
      console.error('Could not roll back a partly saved submission:', cleanupError.message);
    }
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
