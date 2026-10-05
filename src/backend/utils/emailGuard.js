// Staging email isolation (backlog CICD-44).
//
// Staging must never email a real student or professor. On staging the mailer may only use
// Mailtrap's sandbox, which catches every message in a test inbox and delivers nothing. Any other
// transport (Gmail, an SMTP_SERVICE, Mailtrap's live sending hosts, a typo) is refused before a
// message leaves the app, so a wrong environment variable can't turn into a real email.
//
// Staging is DEPLOY_ENV=staging (set in render.yaml), or a Render service whose name ends in
// "-staging" (Render sets RENDER_SERVICE_NAME), so losing the variable doesn't switch the guard off.
// Everywhere else (local development, tests, Docker Compose) nothing changes.

// Mailtrap Email Testing (the sandbox). smtp.mailtrap.io is its older host name. Mailtrap's
// sending hosts (live.smtp.mailtrap.io, bulk.smtp.mailtrap.io) deliver real mail and are refused.
const SANDBOX_HOSTS = ['sandbox.smtp.mailtrap.io', 'smtp.mailtrap.io'];

function isStaging(env = process.env) {
  return env.DEPLOY_ENV === 'staging' || /-staging$/.test(env.RENDER_SERVICE_NAME || '');
}

// Returns { allowed: true } or { allowed: false, reason }.
function checkTransport(env = process.env) {
  if (!isStaging(env)) return { allowed: true };
  if (env.SMTP_SERVICE) {
    return { allowed: false, reason: `Staging only sends email through the Mailtrap sandbox, but SMTP_SERVICE is set (${env.SMTP_SERVICE}). No email was sent.` };
  }
  const host = (env.SMTP_HOST || '').trim().toLowerCase();
  if (!SANDBOX_HOSTS.includes(host)) {
    return { allowed: false, reason: `Staging only sends email through the Mailtrap sandbox (SMTP_HOST=${SANDBOX_HOSTS[0]}), but SMTP_HOST is "${host || 'not set'}". No email was sent.` };
  }
  return { allowed: true };
}

module.exports = { SANDBOX_HOSTS, isStaging, checkTransport };
