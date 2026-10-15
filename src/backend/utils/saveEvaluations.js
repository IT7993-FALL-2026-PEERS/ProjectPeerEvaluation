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

// Marks the evaluator done, but only while the link the submission came through is still theirs and still
// before its deadline (CICD-68). If an extension swapped in a new link, or the deadline passed, after the
// submission's own checks, this matches nothing and the save is abandoned (rolled back), so a replaced or
// expired link can never complete a submission.
function linkChangedError() {
  const err = new Error('The evaluation link changed during the submission.');
  err.code = 'LINK_CHANGED';
  return err;
}

async function markCompleted(evaluatorId, { token }, options) {
  // The clock is read here, when the write runs (also on a transaction retry), not when the request began
  const result = await Student.updateOne(
    { _id: evaluatorId, evaluation_token: typeof token === 'string' ? token : '', evaluation_token_expires_at: { $gt: new Date() } },
    { evaluation_completed: true },
    options
  );
  if (result.matchedCount === 0) throw linkChangedError();
}

// Best effort, for databases without transactions (local MongoDB, Docker Compose); Atlas uses the
// transaction path. If the process dies mid-way the ratings already written stay, which a real
// transaction would not allow.
async function saveWithoutTransaction(evaluations, evaluatorId, link) {
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
    await markCompleted(evaluatorId, link);
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

async function saveEvaluations(evaluations, evaluatorId, { token } = {}) {
  const link = { token };
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      await Evaluation.insertMany(evaluations, { session });
      await markCompleted(evaluatorId, link, { session });
    });
  } catch (err) {
    if (!isTransactionUnsupported(err)) throw err;
    await saveWithoutTransaction(evaluations, evaluatorId, link);
  } finally {
    await session.endSession();
  }
}

// An approved resubmission (CICD-68): the student's earlier evaluations are replaced by the new ones and the
// approval is used up, all or nothing. The approval is taken first with one conditional update that also
// checks the link, so of two submissions at the same moment only one goes ahead; the other is told the link
// changed.
async function useApproval(evaluatorId, { token }, options) {
  const result = await Student.updateOne(
    {
      _id: evaluatorId,
      resubmission_allowed: true,
      evaluation_token: typeof token === 'string' ? token : '',
      evaluation_token_expires_at: { $gt: new Date() }
    },
    { resubmission_allowed: false, evaluation_completed: true },
    options
  );
  if (result.matchedCount === 0) throw linkChangedError();
}

// Best effort without transactions. The earlier evaluations are read before the approval is used, so a
// failed read changes nothing; every step after the approval is inside the recovery, which puts back what
// it can, each step on its own: the new evaluations out, the earlier ones in (through the driver, so it
// does not depend on the Mongoose save that just failed; ones never deleted are left as they are), and the
// approval, only while the link is still the one this attempt used, so an old attempt can never switch on
// an approval that a newer link has since replaced (Codex review).
async function restoreStep(what, step) {
  try {
    await step();
  } catch (error) {
    console.error(`Could not ${what} after a failed resubmission:`, error.message);
  }
}

async function replaceWithoutTransaction(evaluations, evaluatorId, courseId, link) {
  const earlier = await Evaluation.find({ course_id: courseId, evaluator_id: evaluatorId }).lean();
  await useApproval(evaluatorId, link);
  try {
    await Evaluation.deleteMany({ course_id: courseId, evaluator_id: evaluatorId });
    for (const evaluation of evaluations) {
      await new Evaluation(evaluation.toObject()).save();
    }
  } catch (err) {
    await restoreStep('remove the new evaluations', () => Evaluation.deleteMany({ _id: { $in: evaluations.map((e) => e._id) } }));
    if (earlier.length > 0) {
      await restoreStep('put back the earlier evaluations', async () => {
        try {
          await Evaluation.collection.insertMany(earlier, { ordered: false });
        } catch (insertError) {
          const duplicatesOnly = (insertError.writeErrors || []).length > 0 && insertError.writeErrors.every((w) => w.code === 11000);
          if (!duplicatesOnly && insertError.code !== 11000) throw insertError;
        }
      });
    }
    await restoreStep('give the approval back', () => Student.updateOne(
      { _id: evaluatorId, evaluation_token: typeof link.token === 'string' ? link.token : '', resubmission_allowed: false },
      { resubmission_allowed: true }
    ));
    throw err;
  }
}

async function replaceEvaluations(evaluations, evaluatorId, { token } = {}) {
  const link = { token };
  const courseId = evaluations[0].course_id;
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      await useApproval(evaluatorId, link, { session });
      await Evaluation.deleteMany({ course_id: courseId, evaluator_id: evaluatorId }, { session });
      await Evaluation.insertMany(evaluations, { session });
    });
  } catch (err) {
    if (!isTransactionUnsupported(err)) throw err;
    await replaceWithoutTransaction(evaluations, evaluatorId, courseId, link);
  } finally {
    await session.endSession();
  }
}

module.exports = { saveEvaluations, replaceEvaluations, isTransactionUnsupported };
