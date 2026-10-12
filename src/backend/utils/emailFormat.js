// FR-07 (CICD-47): an email is accepted only in the form name@domain.tld: one @, something
// before it, and a domain with a dot that has something on both sides, with no spaces anywhere.
// It checks the form only. It makes no claim that the address exists or can receive mail.
// Used by the roster upload and by adding and updating a student, so all three agree.
function isEmailFormat(value) {
  return typeof value === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

module.exports = { isEmailFormat };