// FR-07 (CICD-47): an email is accepted only in the form name@domain.tld: one @, something
// before it, and a domain with a dot that has something on both sides, with no spaces anywhere.
// It checks the form only. It makes no claim that the address exists or can receive mail.
// Used by the roster upload and by adding and updating a student, so all three agree.
// Plain string checks on purpose, not one regular expression: a pattern such as
// /^[^\s@]+@[^\s@]+\.[^\s@]+$/ can take polynomial time on crafted input (CodeQL
// js/polynomial-redos), and these checks stay linear however long the value is.
function isEmailFormat(value) {
  if (typeof value !== 'string' || /\s/.test(value)) return false;
  const at = value.indexOf('@');
  if (at < 1 || at !== value.lastIndexOf('@')) return false;
  const domain = value.slice(at + 1);
  return domain.slice(1, -1).includes('.');
}

module.exports = { isEmailFormat };