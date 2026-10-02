const test = require('node:test');
const assert = require('node:assert/strict');
const { isTransactionUnsupported } = require('../utils/saveEvaluations');

// The save has two paths (CICD-33): a transaction on a replica set, and a save-and-roll-back path for
// a standalone mongod. Which one runs depends on recognising the error a standalone server gives.
// The paths themselves are tested against real databases in integration/atomicSubmission.*.
test('TC-16-38: the standalone-server error is recognised by its code or its message', () => {
  assert.equal(isTransactionUnsupported({ code: 20, message: 'anything' }), true);
  assert.equal(
    isTransactionUnsupported({ message: 'Transaction numbers are only allowed on a replica set member or mongos' }),
    true
  );
});

test('TC-16-39: other errors are not mistaken for it, so they are not retried without a transaction', () => {
  assert.equal(isTransactionUnsupported({ code: 11000, message: 'E11000 duplicate key' }), false);
  assert.equal(isTransactionUnsupported(new Error('simulated database failure')), false);
  assert.equal(isTransactionUnsupported(undefined), false);
});
