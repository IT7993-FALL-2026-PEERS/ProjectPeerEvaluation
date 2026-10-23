// Who may register as a professor (CW-11). The system may come to hold student records protected
// under FERPA, so registration is limited to instructor email addresses: the domain must be one
// of ALLOWED_EMAIL_DOMAINS (comma-separated, default kennesaw.edu), matched exactly, so a
// subdomain such as students.kennesaw.edu or a look-alike such as kennesaw.edu.evil.com is refused.
// The address is then confirmed by a link sent to it (utils/emailVerification.js); this check alone
// proves nothing, because anyone can type a kennesaw.edu address.
const { isEmailFormat } = require('./emailFormat');

const DEFAULT_DOMAINS = ['kennesaw.edu'];

// A blank or missing setting means the default, never "allow everyone": there is no wildcard.
function getAllowedDomains(env = process.env) {
  const listed = String(env.ALLOWED_EMAIL_DOMAINS || '')
    .split(',')
    .map((domain) => domain.trim().replace(/^@/, '').toLowerCase())
    .filter(Boolean);
  return listed.length > 0 ? listed : DEFAULT_DOMAINS;
}

function isAllowedInstructorEmail(email, env = process.env) {
  if (!isEmailFormat(email)) return false;
  const domain = email.slice(email.indexOf('@') + 1).toLowerCase();
  return getAllowedDomains(env).includes(domain);
}

module.exports = { getAllowedDomains, isAllowedInstructorEmail };
