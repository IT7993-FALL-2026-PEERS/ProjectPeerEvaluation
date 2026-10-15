// One rule for "has this student submitted?" (CICD-70), used by the status, reminders, send, extend and
// resubmit. A student has submitted when their submitted mark (`evaluation_completed`) is set, or evaluations
// by them exist. The mark matters because it survives the deletion of the evaluations a student wrote, which
// happens when the people they rated are deleted; only a reset clears it. Status and send used to disagree
// (status counted evaluations only), which left students nobody could invite.
const Evaluation = require('../models/Evaluation');

// The ids (as strings) of the students who have evaluations in a course; one query for the whole course.
async function loadSubmitters(courseId) {
  return new Set((await Evaluation.distinct('evaluator_id', { course_id: courseId })).map(String));
}

function hasSubmitted(student, submitters) {
  return Boolean(student.evaluation_completed) || submitters.has(String(student._id));
}

module.exports = { loadSubmitters, hasSubmitted };
