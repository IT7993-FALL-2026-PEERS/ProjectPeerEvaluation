// Replacing a student's evaluation link (CICD-68: extension and approved resubmission). The new link is
// emailed first; this then swaps it in only if the student's link is still the one read before the email
// (compare-and-set). If anything changed meanwhile (the student submitted, another extension won, a reset),
// nothing is written and the caller reports that the new link was not activated. A failed email never gets
// here, so the old link keeps working.
const Student = require('../models/Student');

async function rotateLink(student, newToken, deadline, zone, extra = {}) {
  const updated = await Student.findOneAndUpdate(
    { _id: student._id, evaluation_token: student.evaluation_token || null, ...(extra.filter || {}) },
    {
      evaluation_token: newToken,
      evaluation_token_expires_at: new Date(Number(deadline)),
      evaluation_deadline_zone: typeof zone === 'string' ? zone : 'UTC',
      ...(extra.set || {})
    }
  );
  return Boolean(updated);
}

module.exports = { rotateLink };
