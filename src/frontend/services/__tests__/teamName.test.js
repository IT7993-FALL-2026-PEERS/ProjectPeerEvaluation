import { isTeamName, TEAM_NAME_HELP } from '../teamName';

// Team names are numbered: Team 1, Team 2, ... The server writes "team 3", "Team3" and a bare "3" as Team 3;
// this is the same check, so the dialogs can say so before anything is sent.
describe('isTeamName', () => {
  test.each(['Team 1', 'team 3', 'TEAM 12', '  Team 3  ', 'Team3', '3', ' 3 ', 'Team 03', '10'])('accepts %j', (value) => {
    expect(isTeamName(value)).toBe(true);
  });

  test.each(['Alpha', 'Team A', 'Team', 'Team 0', '0', '-1', 'Team 1.5', 'Team 1 2', 'Team 3 B', '3rd', '', '   ', null, undefined])('refuses %j', (value) => {
    expect(isTeamName(value)).toBe(false);
  });

  test('says what a team name looks like', () => {
    expect(TEAM_NAME_HELP).toBe('Team names are numbered: Team 1, Team 2, Team 3, ...');
  });
});
