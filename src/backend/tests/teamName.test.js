const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeTeamName, TEAM_NAME_HELP } = require('../utils/teamName');

// Team names are numbered: Team 1, Team 2, Team 3, ... Typed another way ("team 3", "Team3", a bare
// "3") the same team is meant and the name is written the one way; any other name is refused.
test('TC-08-60: "Team 3", team 3, Team3 and a bare 3 all mean Team 3; any other name is refused', () => {
  for (const value of ['Team 3', 'team 3', 'TEAM 3', '  Team 3  ', 'Team3', '3', ' 3 ', 'Team 03', '03']) {
    assert.equal(normalizeTeamName(value), 'Team 3', JSON.stringify(value));
  }
  assert.equal(normalizeTeamName('Team 12'), 'Team 12');
  assert.equal(normalizeTeamName('Team 100'), 'Team 100');

  const refused = ['Alpha', 'Team A', 'Team', 'Team 0', '0', '-1', 'Team -1', 'Team 1.5', 'Team 1 2', 'Team 3 B', '3rd', '', '   ',
    null, undefined, 5, {}, ['Team 1']];
  for (const value of refused) assert.equal(normalizeTeamName(value), null, JSON.stringify(value));
  assert.match(TEAM_NAME_HELP, /Team 1, Team 2, Team 3/);
});
