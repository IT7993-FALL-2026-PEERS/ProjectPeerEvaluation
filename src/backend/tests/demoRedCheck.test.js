const test = require('node:test');
const assert = require('node:assert/strict');

// DEMO ONLY (Milestone 2 review). This test fails on purpose so the pull request shows a red required
// check that blocks the merge. The pull request is never merged; close it after the demo.
test('DEMO: this test fails on purpose to show that a red check blocks the merge', () => {
  assert.equal(1 + 1, 3);
});
