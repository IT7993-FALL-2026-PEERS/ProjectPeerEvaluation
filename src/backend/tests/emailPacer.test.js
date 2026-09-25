const test = require('node:test');
const assert = require('node:assert/strict');
const { createEmailPacer, getEmailIntervalMs } = require('../utils/emailPacer');

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
