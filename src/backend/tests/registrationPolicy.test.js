const test = require('node:test');
const assert = require('node:assert/strict');
const { getAllowedDomains, isAllowedInstructorEmail } = require('../utils/registrationPolicy');
const {
  VERIFICATION_TTL_MS,
  RESEND_WAIT_MS,
  canSendAnotherLink,
  createVerificationToken,
  hashVerificationToken,
} = require('../utils/emailVerification');

// CW-11 (sponsor decision, 12 Oct 2026): professor registration is limited to authorized KSU
// instructors, because the system may hold student records protected under FERPA. The first
// gate is the email domain; the second is a confirmation link sent to that address.

test('TC-01-40: with no setting, only kennesaw.edu addresses may register', () => {
  assert.deepEqual(getAllowedDomains({}), ['kennesaw.edu']);
  assert.equal(isAllowedInstructorEmail('prof@kennesaw.edu', {}), true);
  assert.equal(isAllowedInstructorEmail('Prof.Name@KENNESAW.EDU', {}), true, 'case does not matter');
});

test('TC-01-41: other addresses are refused, including look-alikes and subdomains', () => {
  for (const email of [
    'prof@gmail.com',
    'prof@students.kennesaw.edu',
    'prof@kennesaw.edu.evil.com',
    'prof@evilkennesaw.edu',
    'prof@mail.kennesaw.edu',
    'kennesaw.edu',
    '@kennesaw.edu',
    'prof@kennesaw',
    'a@b@kennesaw.edu',
    'prof @kennesaw.edu',
    'prof@kennesaw.edu ',
    '',
  ]) {
    assert.equal(isAllowedInstructorEmail(email, {}), false, JSON.stringify(email));
  }
});

test('TC-01-42: a value that is not text is refused', () => {
  for (const value of [undefined, null, 42, {}, ['prof@kennesaw.edu'], { $ne: null }]) {
    assert.equal(isAllowedInstructorEmail(value, {}), false);
  }
});

test('TC-01-43: ALLOWED_EMAIL_DOMAINS replaces the default; a list, spaces, "@" and case are tolerated', () => {
  const env = { ALLOWED_EMAIL_DOMAINS: ' example.edu , @Other.org ,, ' };
  assert.deepEqual(getAllowedDomains(env), ['example.edu', 'other.org']);
  assert.equal(isAllowedInstructorEmail('ada@example.edu', env), true);
  assert.equal(isAllowedInstructorEmail('bob@other.org', env), true);
  assert.equal(isAllowedInstructorEmail('prof@kennesaw.edu', env), false, 'the default no longer applies');
});

test('TC-01-44: an empty or blank setting falls back to the default, never to "allow everyone"', () => {
  for (const blank of ['', '   ', ',', ' , ,']) {
    assert.deepEqual(getAllowedDomains({ ALLOWED_EMAIL_DOMAINS: blank }), ['kennesaw.edu'], JSON.stringify(blank));
  }
  assert.equal(isAllowedInstructorEmail('prof@gmail.com', { ALLOWED_EMAIL_DOMAINS: '' }), false);
  assert.equal(isAllowedInstructorEmail('prof@gmail.com', { ALLOWED_EMAIL_DOMAINS: '*' }), false, '* is not a wildcard');
});

test('TC-01-45: a confirmation token is 32 random bytes, valid for 48 hours, and only its hash is kept', () => {
  const now = Date.UTC(2026, 9, 12, 14, 0, 0);
  const a = createVerificationToken({ now });
  const b = createVerificationToken({ now });
  assert.match(a.token, /^[0-9a-f]{64}$/);
  assert.notEqual(a.token, b.token);
  assert.match(a.hash, /^[0-9a-f]{64}$/);
  assert.notEqual(a.hash, a.token, 'the stored value is not the emailed value');
  assert.equal(a.hash, hashVerificationToken(a.token));
  assert.equal(VERIFICATION_TTL_MS, 48 * 60 * 60 * 1000);
  assert.equal(a.expiresAt.getTime(), now + VERIFICATION_TTL_MS);
});

test('TC-01-69: another link may be sent to a pending address only once the 15-minute wait is over, or if none was ever delivered', () => {
  const now = Date.UTC(2026, 9, 13, 12, 0, 0);
  assert.equal(RESEND_WAIT_MS, 15 * 60 * 1000);
  assert.equal(canSendAnotherLink({ email_verification_sent_at: new Date(now - RESEND_WAIT_MS + 1) }, { now }), false);
  assert.equal(canSendAnotherLink({ email_verification_sent_at: new Date(now - RESEND_WAIT_MS) }, { now }), true);
  assert.equal(canSendAnotherLink({ email_verification_sent_at: new Date(now - 1000) }, { now }), false);
  assert.equal(canSendAnotherLink({}, { now }), true, 'no link was ever delivered');
  assert.equal(canSendAnotherLink({ email_verification_sent_at: undefined }, { now }), true);
});
