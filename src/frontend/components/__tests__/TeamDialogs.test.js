import React from 'react';
import { render, screen, within, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TeamsDialog from '../TeamsDialog';
import { EditTeamDialog, CreateTeamDialog } from '../TeamFormDialogs';
import TeamStudentsDialog from '../TeamStudentsDialog';

// The four team dialogs on the course row (CICD-57, step 4). The page owns the data and the
// requests; these show it and report what the professor presses.
const user = userEvent.setup({ delay: null });

const COURSE = { _id: 'c1', course_number: 'CS 4850', course_section: '01', course_name: 'Capstone' };
const TEAMS = [
  { _id: 't10', team_name: 'Team 10', team_status: 'Active', student_count: 3 },
  { _id: 't2', team_name: 'Team 2', team_status: 'Inactive', student_count: 0 },
  { _id: 't1', team_name: 'team 1', student_count: 2 },
];
const NO_SEARCH = { team_name: '', team_status: '' };

const teamsProps = (overrides = {}) => ({
  open: true, course: COURSE, teams: TEAMS, loading: false, search: NO_SEARCH, showSearch: false,
  sendingTeamIds: {},
  onToggleSearch: () => {}, onSearchChange: () => {}, onClearSearch: () => {},
  onCreate: () => {}, onManageStudents: () => {}, onSend: () => {}, onEdit: () => {}, onDelete: () => {},
  onClearAll: () => {}, onClose: () => {},
  ...overrides,
});

// The team names in the table, top to bottom.
const teamNames = () => screen.getAllByRole('row').slice(1).map((row) => within(row).getAllByRole('cell')[0].textContent);

describe('TeamsDialog', () => {
  test('is not shown while closed', () => {
    render(<TeamsDialog {...teamsProps({ open: false })} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  test('names the course in its title', () => {
    render(<TeamsDialog {...teamsProps()} />);
    expect(screen.getByRole('heading', { name: 'Manage Teams for CS 4850 01 - Capstone' })).toBeInTheDocument();
  });

  test('falls back to the course code when there is no course number', () => {
    render(<TeamsDialog {...teamsProps({ course: { _id: 'c1', course_code: 'IT 3100', course_name: 'Databases' } })} />);
    expect(screen.getByRole('heading', { name: 'Manage Teams for IT 3100 - Databases' })).toBeInTheDocument();
  });

  test('shows a loading message instead of the table while the teams load', () => {
    render(<TeamsDialog {...teamsProps({ loading: true })} />);
    expect(screen.getByText('Loading teams...')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  test('lists the teams in natural order, so Team 2 comes before Team 10', () => {
    render(<TeamsDialog {...teamsProps()} />);
    expect(teamNames()).toEqual(['team 1', 'Team 2', 'Team 10']);
  });

  test('does not reorder the list it was given', () => {
    const teams = [...TEAMS];
    render(<TeamsDialog {...teamsProps({ teams })} />);
    expect(teams.map((t) => t._id)).toEqual(['t10', 't2', 't1']);
  });

  test('shows each team\'s student count and status, with Active when it has none', () => {
    render(<TeamsDialog {...teamsProps()} />);
    const row = (name) => screen.getByRole('row', { name: new RegExp(name) });
    expect(row('Team 10')).toHaveTextContent('3');
    expect(row('Team 10')).toHaveTextContent('Active');
    expect(row('Team 2')).toHaveTextContent('Inactive');
    expect(row('team 1')).toHaveTextContent('2');
    expect(row('team 1')).toHaveTextContent('Active');
  });

  test('shows 0 for a team that has no student count yet', () => {
    render(<TeamsDialog {...teamsProps({ teams: [{ _id: 't9', team_name: 'New Team', team_status: 'Active' }] })} />);
    expect(within(screen.getByRole('row', { name: /New Team/ })).getAllByRole('cell')[1]).toHaveTextContent('0');
  });

  test('says there are no teams when the course has none', () => {
    render(<TeamsDialog {...teamsProps({ teams: [] })} />);
    expect(screen.getByText('No teams found for this course.')).toBeInTheDocument();
  });

  test('says nothing matches when the search hides every team', () => {
    render(<TeamsDialog {...teamsProps({ search: { team_name: 'zzz', team_status: '' } })} />);
    expect(screen.getByText('No teams match your search criteria.')).toBeInTheDocument();
  });

  test('filters by name without regard to case', () => {
    render(<TeamsDialog {...teamsProps({ showSearch: true, search: { team_name: 'TEAM 1', team_status: '' } })} />);
    expect(teamNames()).toEqual(['team 1', 'Team 10']);
    expect(screen.getByText('Search Teams (2 of 3)')).toBeInTheDocument();
  });

  test('filters by status', () => {
    render(<TeamsDialog {...teamsProps({ showSearch: true, search: { team_name: '', team_status: 'Inactive' } })} />);
    expect(teamNames()).toEqual(['Team 2']);
    expect(screen.getByText('Search Teams (1 of 3)')).toBeInTheDocument();
  });

  test('the search button reads Show Search or Hide Search and toggles it', async () => {
    const onToggleSearch = jest.fn();
    const { rerender } = render(<TeamsDialog {...teamsProps({ onToggleSearch })} />);
    await user.click(screen.getByRole('button', { name: 'Show Search' }));
    expect(onToggleSearch).toHaveBeenCalledTimes(1);

    rerender(<TeamsDialog {...teamsProps({ onToggleSearch, showSearch: true })} />);
    expect(screen.getByRole('button', { name: 'Hide Search' })).toBeInTheDocument();
  });

  test('the search card is hidden until Show Search', () => {
    const { rerender } = render(<TeamsDialog {...teamsProps()} />);
    expect(screen.getByText(/Search Teams \(/)).not.toBeVisible();

    rerender(<TeamsDialog {...teamsProps({ showSearch: true })} />);
    expect(screen.getByText(/Search Teams \(/)).toBeVisible();
  });

  test('typing a name or choosing a status reports the field and its value', async () => {
    const onSearchChange = jest.fn();
    render(<TeamsDialog {...teamsProps({ showSearch: true, onSearchChange })} />);

    fireEvent.change(screen.getByLabelText('Team Name'), { target: { value: 'al' } });
    expect(onSearchChange).toHaveBeenLastCalledWith('team_name', 'al');

    await user.click(screen.getByRole('combobox'));
    await user.click(screen.getByRole('option', { name: 'Inactive' }));
    expect(onSearchChange).toHaveBeenLastCalledWith('team_status', 'Inactive');
  });

  test('Clear Search is off until a search is typed, then clears it', async () => {
    const onClearSearch = jest.fn();
    const { rerender } = render(<TeamsDialog {...teamsProps({ showSearch: true, onClearSearch })} />);
    expect(screen.getByRole('button', { name: 'Clear Search' })).toBeDisabled();

    rerender(<TeamsDialog {...teamsProps({ showSearch: true, onClearSearch, search: { team_name: '', team_status: 'Active' } })} />);
    await user.click(screen.getByRole('button', { name: 'Clear Search' }));
    expect(onClearSearch).toHaveBeenCalledTimes(1);
  });

  test('the row buttons report the team they belong to', async () => {
    const handlers = { onManageStudents: jest.fn(), onSend: jest.fn(), onEdit: jest.fn(), onDelete: jest.fn() };
    render(<TeamsDialog {...teamsProps(handlers)} />);
    const row = screen.getByRole('row', { name: /Team 2/ });

    await user.click(within(row).getByTitle('Manage Students'));
    await user.click(within(row).getByTitle('Send Evaluations to Team'));
    await user.click(within(row).getByTitle('Edit Team'));
    await user.click(within(row).getByTitle('Delete Team'));

    for (const handler of Object.values(handlers)) expect(handler).toHaveBeenCalledWith(TEAMS[1]);
  });

  test('a team that is being sent to shows a spinner and cannot be sent to again', () => {
    render(<TeamsDialog {...teamsProps({ sendingTeamIds: { t2: true } })} />);
    const sending = within(screen.getByRole('row', { name: /Team 2/ })).getByTitle('Send Evaluations to Team');
    expect(sending).toBeDisabled();
    expect(within(sending).getByRole('progressbar')).toBeInTheDocument();

    const other = within(screen.getByRole('row', { name: /Team 10/ })).getByTitle('Send Evaluations to Team');
    expect(other).toBeEnabled();
  });

  test('Create Team, Clear All Teams and Close call the page\'s handlers', async () => {
    const handlers = { onCreate: jest.fn(), onClearAll: jest.fn(), onClose: jest.fn() };
    render(<TeamsDialog {...teamsProps(handlers)} />);

    await user.click(screen.getByRole('button', { name: 'Create Team' }));
    await user.click(screen.getByRole('button', { name: 'Clear All Teams' }));
    await user.click(screen.getByRole('button', { name: 'Close' }));

    for (const handler of Object.values(handlers)) expect(handler).toHaveBeenCalledTimes(1);
  });

  test('Clear All Teams is off when there are no teams', () => {
    render(<TeamsDialog {...teamsProps({ teams: [] })} />);
    expect(screen.getByRole('button', { name: 'Clear All Teams' })).toBeDisabled();
  });
});

const formProps = (overrides = {}) => ({
  open: true, form: { team_name: 'Alpha', team_status: 'Active' }, onFormChange: () => {}, onClose: () => {},
  ...overrides,
});

describe('EditTeamDialog', () => {
  test('is not shown while closed', () => {
    render(<EditTeamDialog {...formProps({ open: false, onSave: () => {} })} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  test('shows the team\'s name and status', () => {
    render(<EditTeamDialog {...formProps({ onSave: () => {} })} />);
    expect(screen.getByRole('heading', { name: 'Edit Team' })).toBeInTheDocument();
    expect(screen.getByLabelText(/Team Name/)).toHaveValue('Alpha');
    expect(screen.getByRole('combobox')).toHaveTextContent('Active');
  });

  test('typing a name reports the whole form with the new name', () => {
    const onFormChange = jest.fn();
    render(<EditTeamDialog {...formProps({ onFormChange, onSave: () => {} })} />);
    fireEvent.change(screen.getByLabelText(/Team Name/), { target: { value: 'Alpha Squad' } });
    expect(onFormChange).toHaveBeenCalledWith({ team_name: 'Alpha Squad', team_status: 'Active' });
  });

  test('choosing a status reports the whole form with the new status', async () => {
    const onFormChange = jest.fn();
    render(<EditTeamDialog {...formProps({ onFormChange, onSave: () => {} })} />);
    await user.click(screen.getByRole('combobox'));
    await user.click(screen.getByRole('option', { name: 'Inactive' }));
    expect(onFormChange).toHaveBeenCalledWith({ team_name: 'Alpha', team_status: 'Inactive' });
  });

  test('Save Changes is off while the name is empty or only spaces', () => {
    const { rerender } = render(<EditTeamDialog {...formProps({ form: { team_name: '', team_status: 'Active' }, onSave: () => {} })} />);
    expect(screen.getByRole('button', { name: 'Save Changes' })).toBeDisabled();

    rerender(<EditTeamDialog {...formProps({ form: { team_name: '   ', team_status: 'Active' }, onSave: () => {} })} />);
    expect(screen.getByRole('button', { name: 'Save Changes' })).toBeDisabled();
  });

  test('Cancel and Save Changes call the page\'s handlers', async () => {
    const onClose = jest.fn();
    const onSave = jest.fn();
    render(<EditTeamDialog {...formProps({ onClose, onSave })} />);

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onSave).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Save Changes' }));
    expect(onSave).toHaveBeenCalledTimes(1);
  });
});

describe('CreateTeamDialog', () => {
  const createProps = (overrides = {}) => formProps({ form: { team_name: '', team_status: 'Active' }, onCreate: () => {}, ...overrides });

  test('is not shown while closed', () => {
    render(<CreateTeamDialog {...createProps({ open: false })} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  test('has a focused name field that suggests "Team 1"', () => {
    render(<CreateTeamDialog {...createProps()} />);
    expect(screen.getByRole('heading', { name: 'Create New Team' })).toBeInTheDocument();
    const name = screen.getByLabelText(/Team Name/);
    expect(name).toHaveAttribute('placeholder', 'Team 1');
    expect(name).toHaveFocus();
  });

  test('typing a name or choosing a status reports the whole form', async () => {
    const onFormChange = jest.fn();
    render(<CreateTeamDialog {...createProps({ onFormChange })} />);

    fireEvent.change(screen.getByLabelText(/Team Name/), { target: { value: 'Gamma' } });
    expect(onFormChange).toHaveBeenLastCalledWith({ team_name: 'Gamma', team_status: 'Active' });

    await user.click(screen.getByRole('combobox'));
    await user.click(screen.getByRole('option', { name: 'Inactive' }));
    expect(onFormChange).toHaveBeenLastCalledWith({ team_name: '', team_status: 'Inactive' });
  });

  test('Create Team is off until there is a name', () => {
    const { rerender } = render(<CreateTeamDialog {...createProps()} />);
    expect(screen.getByRole('button', { name: 'Create Team' })).toBeDisabled();

    rerender(<CreateTeamDialog {...createProps({ form: { team_name: ' ', team_status: 'Active' } })} />);
    expect(screen.getByRole('button', { name: 'Create Team' })).toBeDisabled();

    rerender(<CreateTeamDialog {...createProps({ form: { team_name: 'Gamma', team_status: 'Active' } })} />);
    expect(screen.getByRole('button', { name: 'Create Team' })).toBeEnabled();
  });

  test('Cancel and Create Team call the page\'s handlers', async () => {
    const onClose = jest.fn();
    const onCreate = jest.fn();
    render(<CreateTeamDialog {...createProps({ form: { team_name: 'Gamma', team_status: 'Active' }, onClose, onCreate })} />);

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: 'Create Team' }));
    expect(onCreate).toHaveBeenCalledTimes(1);
  });
});

const IN_TEAM = [
  { _id: 's1', name: 'Ann Archer', student_id: '1001', email: 'ann@example.edu', group_assignment: 'Alpha' },
];
const AVAILABLE = [
  { _id: 's3', name: 'Cy Cole', student_id: '1003', email: 'cy@example.edu', group_assignment: 'Beta' },
  { _id: 's5', name: 'Eve Evans', student_id: '2001', email: 'eve@example.edu', group_assignment: '' },
];

const studentsProps = (overrides = {}) => ({
  open: true, team: { _id: 't1', team_name: 'Alpha' }, teamStudents: IN_TEAM, availableStudents: AVAILABLE,
  onAdd: () => {}, onRemove: () => {}, onClose: () => {}, ...overrides,
});

describe('TeamStudentsDialog', () => {
  test('is not shown while closed', () => {
    render(<TeamStudentsDialog {...studentsProps({ open: false })} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  test('names the team in its title and counts both lists', () => {
    render(<TeamStudentsDialog {...studentsProps()} />);
    expect(screen.getByRole('heading', { name: 'Manage Students in Alpha' })).toBeInTheDocument();
    expect(screen.getByText('Students in Team (1)')).toBeInTheDocument();
    expect(screen.getByText('Available Students (2)')).toBeInTheDocument();
  });

  test('shows each student\'s name, ID and email', () => {
    render(<TeamStudentsDialog {...studentsProps()} />);
    expect(screen.getByText('Ann Archer')).toBeInTheDocument();
    expect(screen.getByText('1001 • ann@example.edu')).toBeInTheDocument();
    expect(screen.getByText('2001 • eve@example.edu')).toBeInTheDocument();
  });

  test('tells where an available student already is, and says nothing for one without a team', () => {
    render(<TeamStudentsDialog {...studentsProps()} />);
    expect(screen.getAllByText(/Currently in:/)).toHaveLength(1);
    expect(screen.getByText('Currently in: Beta')).toBeInTheDocument();
  });

  test('says so when either list is empty', () => {
    render(<TeamStudentsDialog {...studentsProps({ teamStudents: [], availableStudents: [] })} />);
    expect(screen.getByText('No students in this team')).toBeInTheDocument();
    expect(screen.getByText('No available students')).toBeInTheDocument();
  });

  test('Remove from team reports the student, and so does Add to team', async () => {
    const onAdd = jest.fn();
    const onRemove = jest.fn();
    render(<TeamStudentsDialog {...studentsProps({ onAdd, onRemove })} />);

    await user.click(screen.getByTitle('Remove from team'));
    expect(onRemove).toHaveBeenCalledWith('s1');
    expect(onAdd).not.toHaveBeenCalled();

    const [addCy, addEve] = screen.getAllByTitle('Add to team');
    await user.click(addCy);
    expect(onAdd).toHaveBeenLastCalledWith('s3');
    await user.click(addEve);
    expect(onAdd).toHaveBeenLastCalledWith('s5');
  });

  test('Close calls the page\'s handler', async () => {
    const onClose = jest.fn();
    render(<TeamStudentsDialog {...studentsProps({ onClose })} />);
    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
