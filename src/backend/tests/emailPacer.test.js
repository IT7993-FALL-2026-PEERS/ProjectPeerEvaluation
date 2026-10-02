const test = require('node:test');
const assert = require('node:assert/strict');
const { createEmailPacer, getEmailIntervalMs, getRecipientLimit, getRequestBudgetMs } = require('../utils/emailPacer');

function recordingSleep() {
  const waits = [];
  return { waits, sleep: async (ms) => { waits.push(ms); } };
}

test('the first email goes out immediately and later ones wait the interval', async () => {
  const { waits, sleep } = recordingSleep();
  const waitTurn = createEmailPacer({ intervalMs: 1500, sleep });

  await waitTurn();
  await waitTurn();
  await waitTurn();

  assert.deepEqual(waits, [1500, 1500]);
});

test('an interval of 0 never waits', async () => {
  const { waits, sleep } = recordingSleep();
  const waitTurn = createEmailPacer({ intervalMs: 0, sleep });

  await waitTurn();
  await waitTurn();

  assert.deepEqual(waits, []);
});

test('reads EMAIL_SEND_INTERVAL_MS and ignores missing or invalid values', () => {
  assert.equal(getEmailIntervalMs({ EMAIL_SEND_INTERVAL_MS: '1500' }), 1500);
  assert.equal(getEmailIntervalMs({}), 0);
  assert.equal(getEmailIntervalMs({ EMAIL_SEND_INTERVAL_MS: 'soon' }), 0);
  assert.equal(getEmailIntervalMs({ EMAIL_SEND_INTERVAL_MS: '-5' }), 0);
});

// CICD-36: one request must finish before the browser's 3-minute timeout, so it can email only as many
// students as fit in the time budget at the current interval.
test('TC-10-34: with no interval there is no recipient limit', () => {
  assert.equal(getRecipientLimit({}), Infinity);
  assert.equal(getRecipientLimit({ EMAIL_SEND_INTERVAL_MS: '0' }), Infinity);
});

test('TC-10-35: staging (11 s interval, default 150 s budget) allows 14 recipients, not the 18 that would time out', () => {
  assert.equal(getRecipientLimit({ EMAIL_SEND_INTERVAL_MS: '11000' }), 14);
  // 14 recipients wait 13 * 11 s = 143 s; 18 would wait 187 s, past the 180 s browser timeout.
  assert.ok(13 * 11 <= 150 && 17 * 11 > 180);
});

test('TC-10-36: the budget and interval come from the environment, and bad values fall back', () => {
  assert.equal(getRecipientLimit({ EMAIL_SEND_INTERVAL_MS: '1000', EMAIL_REQUEST_BUDGET_MS: '10000' }), 11);
  assert.equal(getRequestBudgetMs({ EMAIL_REQUEST_BUDGET_MS: 'soon' }), 150000);
  assert.equal(getRequestBudgetMs({ EMAIL_REQUEST_BUDGET_MS: '-5' }), 150000);
  assert.equal(getRecipientLimit({ EMAIL_SEND_INTERVAL_MS: 'x' }), Infinity);
});
