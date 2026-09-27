// Deliberately failing test (Milestone 1, Task 3). Proves a failing frontend
// test blocks the merge. The PR that adds it is closed without merging.
test('deliberately fails to prove the required check blocks the merge', () => {
  expect(1 + 1).toBe(3);
});
