const Evaluation = require('../models/Evaluation');

// Builds the unique index on Evaluation (CICD-33) and says loudly if it could not be built. Mongoose
// builds indexes in the background and a failure is otherwise silent, but without this index two
// submissions at the same moment can both be saved. The index cannot be built while duplicate ratings
// exist; scripts/findDuplicateEvaluations.js lists them. The app keeps running either way, so a
// database with old duplicates does not take the service down.
async function ensureEvaluationIndexes(log = console) {
  try {
    // createIndexes() tries again every time and does nothing when the index already exists;
    // init() would hand back the result of the first attempt.
    await Evaluation.createIndexes();
    return true;
  } catch (err) {
    log.error(
      '⚠️  The unique index on evaluations could not be built, so duplicate-submission protection is OFF: ' +
      `${err.message}. Run "node scripts/findDuplicateEvaluations.js" in src/backend, remove the duplicates, and restart.`
    );
    return false;
  }
}

module.exports = { ensureEvaluationIndexes };
