// Spaces out emails sent in a loop. Mail providers reject bursts (Mailtrap's
// free sandbox answers "550 Too many emails per second"), so each email after
// the first waits EMAIL_SEND_INTERVAL_MS. Unset or invalid means no wait.
function getEmailIntervalMs(env = process.env) {
  const ms = Number(env.EMAIL_SEND_INTERVAL_MS);
  return Number.isFinite(ms) && ms > 0 ? ms : 0;
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

module.exports = { createEmailPacer, getEmailIntervalMs };
