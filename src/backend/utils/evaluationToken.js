// Student evaluation links. The token in the link is the student's only
// credential, so it is 32 random bytes from crypto (API-1: it used to come from
// Math.random()). Its expiry is the evaluation deadline the instructor chose
// when sending (CICD-67): the link works until then and not after.
const crypto = require('crypto');

function generateEvaluationToken() {
  return crypto.randomBytes(32).toString('hex');
}

// A token with no expiry date was issued before deadlines existed; it counts as
// expired, and the professor sends again to issue a new one. Written so that an
// unreadable date (NaN) also counts as expired.
function isTokenExpired(student, now = new Date()) {
  const expiresAt = student.evaluation_token_expires_at;
  return !expiresAt || !(new Date(expiresAt).getTime() > now.getTime());
}

// The student has a link that still works.
function isLinkActive(student, now = new Date()) {
  return Boolean(student.evaluation_token) && !isTokenExpired(student, now);
}

module.exports = {
  generateEvaluationToken,
  isLinkActive,
  isTokenExpired,
};
