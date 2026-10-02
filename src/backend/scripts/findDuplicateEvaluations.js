// Read-only check to run BEFORE deploying the unique index on Evaluation (backlog CICD-33).
//
//   cd src/backend && node scripts/findDuplicateEvaluations.js
//
// Uses MONGODB_URI (or MONGO_URI, or src/backend/.env). To check staging, set MONGODB_URI to the
// staging connection string for this one command only; nothing is changed in the database.
//
// Exit code 0: no duplicates, the index can be built. Exit code 1: duplicates are listed. The index
// cannot be built while they exist; keep one rating per evaluator and person and delete the rest.
const mongoose = require('mongoose');
const Evaluation = require('../models/Evaluation');

// One entry per evaluator, person and course that has more than one rating.
function findDuplicateEvaluations() {
  return Evaluation.aggregate([
    {
      $group: {
        _id: { evaluator_id: '$evaluator_id', student_id: '$student_id', course_id: '$course_id' },
        ratings: { $sum: 1 },
        evaluation_ids: { $push: '$_id' },
      },
    },
    { $match: { ratings: { $gt: 1 } } },
  ]);
}

async function main() {
  await mongoose.connect(require('./mongoUri'));
  const duplicates = await findDuplicateEvaluations();
  if (duplicates.length === 0) {
    console.log('No duplicate evaluations. The unique index can be built.');
  } else {
    console.log(`${duplicates.length} duplicate group(s) found. The unique index cannot be built until they are removed:`);
    duplicates.forEach((d) => {
      console.log(`  evaluator ${d._id.evaluator_id}, student ${d._id.student_id}, course ${d._id.course_id}: ${d.ratings} ratings (${d.evaluation_ids.join(', ')})`);
    });
  }
  await mongoose.disconnect();
  process.exitCode = duplicates.length === 0 ? 0 : 1;
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(2);
  });
}

module.exports = { findDuplicateEvaluations };
