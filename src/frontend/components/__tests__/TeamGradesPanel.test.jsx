import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import api from '../../services/api';
import TeamGradesPanel, { gradeProblem } from '../TeamGradesPanel';

vi.mock('../../services/api', () => ({
  __esModule: true,
  default: { put: vi.fn() },
}));

// CICD-81: the team grades of the Contribution Multiplier report.
const TEAMS = [
  { _id: 't1', team_name: 'Team 1', teamGrade: 100, teamGradeSource: 'automatic', automaticTeamGrade: 100 },
  { _id: 't2', team_name: 'Team 2', teamGrade: 85, teamGradeSource: 'instructor', automaticTeamGrade: 99 },
  { _id: 't3', team_name: 'Team 3', teamGrade: null, teamGradeSource: null, automaticTeamGrade: null },
];

const user = userEvent.setup({ delay: null });

function renderPanel(props = {}) {
  const onChanged = vi.fn().mockResolvedValue(undefined);
  render(<TeamGradesPanel courseId="c1" teams={TEAMS} onChanged={onChanged} {...props} />);
  return { onChanged };
}

describe('TeamGradesPanel', () => {
  beforeEach(() => {
    api.put.mockReset();
    api.put.mockResolvedValue({ data: {} });
  });

  test('shows each team with its grade, who set it and the grade the app proposes', () => {
    renderPanel();
    const row = (name) => screen.getByRole('row', { name: new RegExp(`^${name}`) });
    expect(row('Team 1')).toHaveTextContent('100%');
    expect(row('Team 1')).toHaveTextContent('Automatic');
    expect(row('Team 2')).toHaveTextContent('85%');
    expect(row('Team 2')).toHaveTextContent('You');
    expect(row('Team 2')).toHaveTextContent('99%');
    expect(row('Team 3')).toHaveTextContent('No ratings yet');
  });

  test('says so when the course has no teams', () => {
    renderPanel({ teams: [] });
    expect(screen.getByText('No teams in this course')).toBeInTheDocument();
  });

  test('saves a grade for a team, refreshes the report and closes', async () => {
    const { onChanged } = renderPanel();
    await user.click(screen.getByRole('button', { name: 'Edit the grade of Team 1' }));
    expect(screen.getByText(/The highest student score in this team is 100%/)).toBeInTheDocument();
    await user.type(screen.getByLabelText('Team grade (0 to 100)'), '88.5');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(api.put).toHaveBeenCalledWith('/courses/c1/teams/t1/grade', { team_grade: 88.5 }));
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  test('Save stays off until the grade is a number from 0 to 100', async () => {
    renderPanel();
    await user.click(screen.getByRole('button', { name: 'Edit the grade of Team 1' }));
    const save = screen.getByRole('button', { name: 'Save' });
    expect(save).toBeDisabled();
    await user.type(screen.getByLabelText('Team grade (0 to 100)'), '101');
    expect(save).toBeDisabled();
    expect(screen.getByText('The grade must be a number from 0 to 100.')).toBeInTheDocument();
    await user.clear(screen.getByLabelText('Team grade (0 to 100)'));
    await user.type(screen.getByLabelText('Team grade (0 to 100)'), '0');
    expect(save).toBeEnabled();
    expect(gradeProblem('')).toMatch(/Enter a grade/);
    expect(gradeProblem('abc')).toMatch(/number/);
    expect(gradeProblem('-1')).toMatch(/number/);
    expect(gradeProblem('100')).toBe('');
  });

  test('a grade the instructor set is shown in the box and can be given up for the automatic one', async () => {
    const { onChanged } = renderPanel();
    await user.click(screen.getByRole('button', { name: 'Edit the grade of Team 2' }));
    expect(screen.getByLabelText('Team grade (0 to 100)')).toHaveValue(85);
    await user.click(screen.getByRole('button', { name: 'Use automatic grade' }));
    await waitFor(() => expect(api.put).toHaveBeenCalledWith('/courses/c1/teams/t2/grade', { team_grade: null }));
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
  });

  test('a team on the automatic grade has no "use automatic" button, and a team without ratings says so', async () => {
    renderPanel();
    await user.click(screen.getByRole('button', { name: 'Edit the grade of Team 1' }));
    expect(screen.queryByRole('button', { name: 'Use automatic grade' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: 'Edit the grade of Team 3' }));
    expect(screen.getByText(/Nobody in this team has ratings yet/)).toBeInTheDocument();
  });

  test('shows the server\'s message when the grade cannot be saved, and keeps the dialog open', async () => {
    api.put.mockRejectedValue({ response: { data: { error: { message: 'Team not found.' } } } });
    const { onChanged } = renderPanel();
    await user.click(screen.getByRole('button', { name: 'Edit the grade of Team 1' }));
    await user.type(screen.getByLabelText('Team grade (0 to 100)'), '90');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Team not found.')).toBeInTheDocument();
    expect(onChanged).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  test('a plain message when the server gives none', async () => {
    api.put.mockRejectedValue(new Error('Network Error'));
    renderPanel();
    await user.click(screen.getByRole('button', { name: 'Edit the grade of Team 1' }));
    await user.type(screen.getByLabelText('Team grade (0 to 100)'), '90');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Could not save the team grade.')).toBeInTheDocument();
  });
});
