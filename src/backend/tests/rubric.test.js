const test = require('node:test');
const assert = require('node:assert/strict');
const rubric = require('../config/rubric');

// The fixed rubric (FR-13): all six criteria are rated 1-5, participation included (D-19, fixed 17 Oct 2026).
test('TC-13-21: every criterion has five levels, 1 to 5, and participation has the agreed wording', () => {
  assert.equal(rubric.criteria.length, 6);
  for (const criterion of rubric.criteria) {
    assert.equal(criterion.scale, '1-5', criterion.id);
    assert.deepEqual(Object.keys(criterion.scaleDescriptions).map(Number).sort(), [1, 2, 3, 4, 5], criterion.id);
  }
  const participation = rubric.criteria.find((criterion) => criterion.id === 'participation');
  assert.deepEqual(participation.scaleDescriptions, {
    5: 'Participated fully',
    4: 'Participated most of the time',
    3: 'Participated to some extent',
    2: 'Did not participate',
    1: 'Hindered the group',
  });
});
