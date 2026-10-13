// Email confirmation for new professor accounts (CW-11). A new account cannot log in until its
// owner opens the link emailed to the address. The link carries a random token; only its SHA-256
// hash is stored, so a copy of the database does not hand out working links.
const crypto = require('crypto');

const VERIFICATION_TTL_MS = 48 * 60 * 60 * 1000;

// A pending address is sent another link no sooner than this after the last one. Registering needs no
// password, so anyone can submit someone else's address; without a wait they could keep replacing the
// link in that person's mailbox faster than it can be used (Codex review, 13 Oct).
const RESEND_WAIT_MS = 15 * 60 * 1000;

// True when a link may be sent to this pending account now: none was ever delivered, or the wait is over.
function canSendAnotherLink(professor, { now = Date.now() } = {}) {
  const sentAt = professor.email_verification_sent_at;
  return !sentAt || now - new Date(sentAt).getTime() >= RESEND_WAIT_MS;
}

function hashVerificationToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

// `now` is in milliseconds.
function createVerificationToken({ now = Date.now() } = {}) {
  const token = crypto.randomBytes(32).toString('hex');
  return { token, hash: hashVerificationToken(token), expiresAt: new Date(now + VERIFICATION_TTL_MS) };
}

module.exports = { VERIFICATION_TTL_MS, RESEND_WAIT_MS, canSendAnotherLink, createVerificationToken, hashVerificationToken };
