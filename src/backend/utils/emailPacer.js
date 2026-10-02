// Spaces out emails sent in a loop. Mail providers reject bursts (Mailtrap's
// free sandbox answers "550 Too many emails per second"), so each email after
// the first waits EMAIL_SEND_INTERVAL_MS. Unset or invalid means no wait.
function getEmailIntervalMs(env = process.env) {
  const ms = Number(env.EMAIL_SEND_INTERVAL_MS);
  return Number.isFinite(ms) && ms > 0 ? ms : 0;
}

// One send or reminder request sends its emails one after another inside a single HTTP request, and
// the browser gives up on a request after 3 minutes (frontend/services/api.js). Spacing emails by the
// interval means n recipients take about (n - 1) * interval plus the time the mail server needs, so
// beyond a certain n the request cannot finish in time and the professor sees a false failure after
// half the emails have gone out. EMAIL_REQUEST_BUDGET_MS (default 150 s, leaving room under the 180 s
// timeout for the mail server) is the time one request may spend waiting between emails.
const DEFAULT_REQUEST_BUDGET_MS = 150000;

function getRequestBudgetMs(env = process.env) {
  const ms = Number(env.EMAIL_REQUEST_BUDGET_MS);
  return Number.isFinite(ms) && ms > 0 ? ms : DEFAULT_REQUEST_BUDGET_MS;
}

// The most recipients one request can email within the budget; Infinity when emails are not spaced.
function getRecipientLimit(env = process.env) {
  const intervalMs = getEmailIntervalMs(env);
  if (intervalMs === 0) return Infinity;
  return Math.floor(getRequestBudgetMs(env) / intervalMs) + 1; // the first email needs no wait
}

const defaultSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function createEmailPacer({ intervalMs = getEmailIntervalMs(), sleep = defaultSleep } = {}) {
  let first = true;
  return async function waitTurn() {
    if (first) {
      first = false;
      return;
    }
    if (intervalMs > 0) await sleep(intervalMs);
  };
}

module.exports = { createEmailPacer, getEmailIntervalMs, getRecipientLimit, getRequestBudgetMs };
