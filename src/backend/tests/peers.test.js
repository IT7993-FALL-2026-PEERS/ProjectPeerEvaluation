const test = require('node:test');
const assert = require('node:assert/strict');
const { countPeers, hasNobodyToRate } = require('../utils/peers');

// CICD-72 and CICD-79: a student rates the rest of their team, and a student with no team rates nobody (the
// rule findTeammates uses). Nobody to rate means the form would be empty and a submission could never be accepted.
const member = (team) => ({ team_id: team });

test('TC-11-31: a student alone on a team has nobody to rate; a team of two has', () => {
  const students = [member('a'), member('b'), member('b')];
  const counts = countPeers(students);
  assert.equal(hasNobodyToRate(students[0], counts), true);
  assert.equal(hasNobodyToRate(students[1], counts), false);
  assert.equal(hasNobodyToRate(students[2], counts), false);
});

test('TC-11-32: a student with no team has nobody to rate, whoever else is in the course (CICD-79)', () => {
  const alone = [member(null)];
  assert.equal(hasNobodyToRate(alone[0], countPeers(alone)), true);
  const withOthers = [member(null), member('a'), member('a'), member(null)];
  assert.equal(hasNobodyToRate(withOthers[0], countPeers(withOthers)), true);
  assert.equal(hasNobodyToRate(withOthers[3], countPeers(withOthers)), true);
  // The students in the team are not affected by the ones without a team.
  assert.equal(hasNobodyToRate(withOthers[1], countPeers(withOthers)), false);
});

test('TC-11-33: a populated team and a plain team id count as the same team', () => {
  const students = [member({ _id: 'a' }), member('a')];
  const counts = countPeers(students);
  assert.equal(hasNobodyToRate(students[0], counts), false);
  assert.equal(hasNobodyToRate(students[1], counts), false);
});
