import { groupStudentsByTeam } from '../evaluationStatus';

// How the evaluation status dialog lays students out: one group per team, teams in natural order
// (Team 2 before Team 10), and the students without a team last (CICD-57, step 3).
const student = (name, team) => ({ name, student_id: name, team });
const names = (groups) => groups.map(([team]) => team);

describe('groupStudentsByTeam', () => {
  test('groups students by team, keeping each team\'s students in the order given', () => {
    const groups = groupStudentsByTeam([student('Ann', 'Alpha'), student('Cy', 'Beta'), student('Ben', 'Alpha')]);

    expect(names(groups)).toEqual(['Alpha', 'Beta']);
    expect(groups[0][1].map((s) => s.name)).toEqual(['Ann', 'Ben']);
    expect(groups[1][1].map((s) => s.name)).toEqual(['Cy']);
  });

  test('puts students with no team under "No Team", and that group last', () => {
    const groups = groupStudentsByTeam([student('Eve', ''), student('Ann', 'Alpha'), student('Zed', null), student('Cy', 'Zulu')]);

    expect(names(groups)).toEqual(['Alpha', 'Zulu', 'No Team']);
    expect(groups[2][1].map((s) => s.name)).toEqual(['Eve', 'Zed']);
  });

  test('orders numbered teams by their number, not letter by letter', () => {
    const groups = groupStudentsByTeam(['Team 10', 'Team 2', 'Team 1', 'Team 11'].map((t) => student(t, t)));
    expect(names(groups)).toEqual(['Team 1', 'Team 2', 'Team 10', 'Team 11']);
  });

  test('compares the words before the number first, then the number, then what follows it', () => {
    const groups = groupStudentsByTeam(['Group 2', 'Alpha 9', 'Group 1B', 'Group 1A', 'Alpha 10'].map((t) => student(t, t)));
    expect(names(groups)).toEqual(['Alpha 9', 'Alpha 10', 'Group 1A', 'Group 1B', 'Group 2']);
  });

  test('falls back to plain alphabetical order when a name has no number', () => {
    const groups = groupStudentsByTeam(['Gamma', 'Alpha', 'Beta 3'].map((t) => student(t, t)));
    expect(names(groups)).toEqual(['Alpha', 'Beta 3', 'Gamma']);
  });

  test('gives nothing for no students, or no list at all', () => {
    expect(groupStudentsByTeam([])).toEqual([]);
    expect(groupStudentsByTeam(undefined)).toEqual([]);
  });
});
