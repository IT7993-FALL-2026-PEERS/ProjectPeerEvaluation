// Deliberately failing test (Milestone 1, Task 3). Proves a failing backend
// test blocks the merge. The PR that adds it is closed without merging.
const test = require('node:test');
const assert = require('node:assert');

test('deliberately fails to prove the required check blocks the merge', () => {
  assert.strictEqual(1 + 1, 3);
});
