import { buildCreateTeamBody } from '../teamRequest';

// CICD-52: the Create Team dialog posted a bare array, and the API (which reads req.body.teams)
// answered 400 "Teams array required.", so the button could never create a team. The backend side
// of this contract is tested in src/backend/integration/teams.integration.js (TC-08-21, TC-08-34).
describe('buildCreateTeamBody', () => {
  test('wraps the team in { teams: [...] }, as the API expects', () => {
    const body = buildCreateTeamBody({ team_name: 'Gamma', team_status: 'Active' });
    expect(Array.isArray(body)).toBe(false);
    expect(body).toEqual({ teams: [{ team_name: 'Gamma', team_status: 'Active' }] });
  });

  test('trims the name, as the server does', () => {
    expect(buildCreateTeamBody({ team_name: '  Gamma  ', team_status: 'Inactive' }).teams[0])
      .toEqual({ team_name: 'Gamma', team_status: 'Inactive' });
  });

  test('sends no members, because teams are created empty', () => {
    const [team] = buildCreateTeamBody({ team_name: 'Gamma', team_status: 'Active', students: ['x'] }).teams;
    expect(team).not.toHaveProperty('students');
  });
});
