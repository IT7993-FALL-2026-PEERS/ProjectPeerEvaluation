// Student evaluation links. The token in the link is the student's only
// credential, so it is 32 random bytes from crypto (API-1: it used to come from
// Math.random()) and it expires EVALUATION_TOKEN_TTL_DAYS after the latest
// invitation or reminder.
const crypto = require('crypto');

const DEFAULT_TTL_DAYS = 14;
const DAY_MS = 24 * 60 * 60 * 1000;

function generateEvaluationToken() {
  return crypto.randomBytes(32).toString('hex');
}

// Unset or invalid means the default.
function getTokenTtlDays(env = process.env) {
  const days = Number(env.EVALUATION_TOKEN_TTL_DAYS);
  return Number.isFinite(days) && days > 0 ? days : DEFAULT_TTL_DAYS;
}

// A token with no expiry date was issued before links expired; it counts as
// expired, and the professor re-sends to issue a new one. Written so that an
// unreadable date (NaN) also counts as expired.
function isTokenExpired(student, now = new Date()) {
  const expiresAt = student.evaluation_token_expires_at;
  return !expiresAt || !(new Date(expiresAt).getTime() > now.getTime());
}

// For each invitation or reminder: keep a still-valid token so links already
// sent keep working, otherwise issue a new one; either way the expiry restarts.
function refreshEvaluationToken(student, { now = new Date(), env = process.env } = {}) {
  const token = student.evaluation_token && !isTokenExpired(student, now)
    ? student.evaluation_token
    : generateEvaluationToken();
  const expiresAt = new Date(now.getTime() + getTokenTtlDays(env) * DAY_MS);
  return { token, expiresAt };
}

module.exports = {
  generateEvaluationToken,
  getTokenTtlDays,
  isTokenExpired,
  refreshEvaluationToken,
};
