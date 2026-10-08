import { renderHook, act } from '@testing-library/react';
import api from '../../services/api';
import useTeams from '../useTeams';

vi.mock('../../services/api', () => ({
  __esModule: true,
  default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
}));

// The Manage Teams dialog and the dialogs that open from it: edit and create a team, move students
// in and out of a team, the "evaluations were already sent" confirmation, and sending to one team
// (CICD-57, step 6b-3). The page owns the alert, the course list, the students and the evaluation
// reset; the hook owns the teams and what the professor does with them, and hands back the props
// each dialog takes.
const COURSE = { _id: 'c1', course_name: 'Capstone' };
const ALPHA = { _id: 't1', team_name: 'Alpha', team_status: 'Active' };
const BETA = { _id: 't2', team_name: 'Beta', team_status: 'Active' };
const ANN = { _id: 's1', student_id: '1001', name: 'Ann Archer', team_id: 't1', group_assignment: 'Alpha' };
const BEN = { _id: 's2', student_id: '1002', name: 'Ben Baker', team_id: null, group_assignment: '' };
const CY = { _id: 's3', student_id: '1003', name: 'Cy Cole', team_id: 't2', group_assignment: 'Beta' };
const NO_SEARCH = { team_name: '', team_status: '' };

let routes;
let setAlert;
let refreshCourses;
let setStudents;
let resetEvaluationState;
let students;

// api.get answers from `routes` (url -> data); an unknown url fails, like a server that is down.
beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
  Object.values(api).forEach((fn) => fn.mockReset());
  routes = {
    '/courses/c1/teams': [ALPHA, BETA],
    '/courses/c1/students': [ANN, BEN, CY],
    '/courses/c1/evaluations/status': { evaluations_sent: false },
  };
  api.get.mockImplementation(async (url) => {
    if (url in routes) return { data: routes[url] };
    throw new Error(`no route ${url}`);
  });
  api.post.mockResolvedValue({ data: {} });
  api.put.mockResolvedValue({ data: {} });
  api.delete.mockResolvedValue({ data: {} });
  setAlert = vi.fn();
  refreshCourses = vi.fn().mockResolvedValue();
  setStudents = vi.fn();
  resetEvaluationState = vi.fn().mockResolvedValue();
  students = [ANN, BEN, CY];
});

const render = () => renderHook(() => useTeams({ setAlert, refreshCourses, students, setStudents, resetEvaluationState }));

// The hook with the course's teams already open, like the page after "Manage Teams".
async function opened() {
  const view = render();
  await act(() => view.result.current.openTeams(COURSE));
  return view;
}

// ... and with the students of one team open, like the page after "Manage Students" on that team.
async function managing(team = ALPHA) {
  const view = await opened();
  await act(() => view.result.current.teamsDialog.onManageStudents(team));
  return view;
}

describe('useTeams: opening the list', () => {
  test('opens the dialog for the course, shows the loading state, then the teams', async () => {
    const view = render();
    expect(view.result.current.teamsDialog).toMatchObject({ open: false, course: null, teams: [], loading: false });

    let opening;
    let release;
    api.get.mockReturnValue(new Promise((resolve) => { release = resolve; }));
    act(() => { opening = view.result.current.openTeams(COURSE); });
    expect(view.result.current.teamsDialog).toMatchObject({ open: true, course: COURSE, loading: true });

    await act(async () => { release({ data: [ALPHA, BETA] }); await opening; });
    expect(view.result.current.teamsDialog).toMatchObject({ open: true, loading: false, teams: [ALPHA, BETA] });
    expect(api.get).toHaveBeenCalledWith('/courses/c1/teams');
  });

  test('asks for a course by its id when it has no _id', async () => {
    const view = render();
    api.get.mockResolvedValue({ data: [] });

    await act(() => view.result.current.openTeams({ id: 'plain', course_name: 'Legacy' }));

    expect(api.get).toHaveBeenCalledWith('/courses/plain/teams');
  });

  test('shows an empty list, and stops loading, when the teams cannot be fetched', async () => {
    delete routes['/courses/c1/teams'];
    const view = render();

    await act(() => view.result.current.openTeams(COURSE));

    expect(view.result.current.teamsDialog).toMatchObject({ open: true, loading: false, teams: [] });
    expect(setAlert).not.toHaveBeenCalled();
  });

  test('forgets an earlier search, and hides the search fields, each time it opens', async () => {
    const view = await opened();
    act(() => view.result.current.teamsDialog.onToggleSearch());
    act(() => view.result.current.teamsDialog.onSearchChange('team_name', 'alp'));

    await act(() => view.result.current.openTeams(COURSE));

    expect(view.result.current.teamsDialog).toMatchObject({ search: NO_SEARCH, showSearch: false });
  });

  test('closing the list closes the dialog and refreshes the course counts', async () => {
    const view = await opened();

    act(() => view.result.current.teamsDialog.onClose());

    expect(view.result.current.teamsDialog.open).toBe(false);
    expect(refreshCourses).toHaveBeenCalledTimes(1);
  });
});

describe('useTeams: search', () => {
  test('changing one field keeps the other', async () => {
    const view = await opened();

    act(() => view.result.current.teamsDialog.onSearchChange('team_name', 'al'));
    act(() => view.result.current.teamsDialog.onSearchChange('team_status', 'Active'));

    expect(view.result.current.teamsDialog.search).toEqual({ team_name: 'al', team_status: 'Active' });
  });

  test('the toggle shows the search fields and hides them again', async () => {
    const view = await opened();

    act(() => view.result.current.teamsDialog.onToggleSearch());
    expect(view.result.current.teamsDialog.showSearch).toBe(true);
    act(() => view.result.current.teamsDialog.onToggleSearch());
    expect(view.result.current.teamsDialog.showSearch).toBe(false);
  });

  test('clearing empties every field and hides the search fields', async () => {
    const view = await opened();
    act(() => view.result.current.teamsDialog.onToggleSearch());
    act(() => view.result.current.teamsDialog.onSearchChange('team_name', 'x'));

    act(() => view.result.current.teamsDialog.onClearSearch());

    expect(view.result.current.teamsDialog).toMatchObject({ search: NO_SEARCH, showSearch: false });
  });

  test('clearTeamsState, which the page calls after "delete all students", empties the list and the search', async () => {
    const view = await opened();
    act(() => view.result.current.teamsDialog.onToggleSearch());
    act(() => view.result.current.teamsDialog.onSearchChange('team_name', 'x'));

    act(() => view.result.current.clearTeamsState());

    expect(view.result.current.teamsDialog).toMatchObject({ teams: [], search: NO_SEARCH, showSearch: false });
  });
});

describe('useTeams: clearing all teams', () => {
  let confirm;
  beforeEach(() => { confirm = vi.spyOn(window, 'confirm').mockReturnValue(true); });

  test('asks first, naming the course; saying no changes nothing', async () => {
    const view = await opened();
    confirm.mockReturnValue(false);

    await act(() => view.result.current.teamsDialog.onClearAll());

    expect(confirm.mock.calls[0][0]).toBe('Are you sure you want to delete ALL teams for Capstone? This will also unlink all students from their teams.');
    expect(api.delete).not.toHaveBeenCalled();
    expect(view.result.current.teamsDialog.teams).toEqual([ALPHA, BETA]);
  });

  test('deletes them all, shows the server\'s message, empties the list and refreshes the counts', async () => {
    const view = await opened();
    api.delete.mockResolvedValue({ data: { message: 'All teams cleared successfully. 2 teams deleted.' } });

    await act(() => view.result.current.teamsDialog.onClearAll());

    expect(api.delete).toHaveBeenCalledWith('/courses/c1/teams');
    expect(setAlert).toHaveBeenCalledWith({ severity: 'success', message: 'All teams cleared successfully. 2 teams deleted.' });
    expect(view.result.current.teamsDialog.teams).toEqual([]);
    expect(refreshCourses).toHaveBeenCalledTimes(1);
  });

  test('says "Failed to clear teams" and keeps the list when the delete fails', async () => {
    const view = await opened();
    api.delete.mockRejectedValue(new Error('nope'));

    await act(() => view.result.current.teamsDialog.onClearAll());

    expect(setAlert).toHaveBeenCalledWith({ severity: 'error', message: 'Failed to clear teams' });
    expect(view.result.current.teamsDialog.teams).toEqual([ALPHA, BETA]);
    expect(refreshCourses).not.toHaveBeenCalled();
  });

  test('does nothing before a course has been opened', async () => {
    const view = render();

    await act(() => view.result.current.teamsDialog.onClearAll());

    expect(confirm).not.toHaveBeenCalled();
    expect(api.delete).not.toHaveBeenCalled();
  });
});

describe('useTeams: deleting one team', () => {
  let confirm;
  beforeEach(() => { confirm = vi.spyOn(window, 'confirm').mockReturnValue(true); });

  test('asks first, naming the team; saying no changes nothing', async () => {
    const view = await opened();
    confirm.mockReturnValue(false);

    await act(() => view.result.current.teamsDialog.onDelete(ALPHA));

    expect(confirm.mock.calls[0][0]).toBe('Are you sure you want to delete "Alpha"? This will unlink all students from this team.');
    expect(api.delete).not.toHaveBeenCalled();
  });

  test('deletes the team, says so, shows the list the server now has, and refreshes the counts', async () => {
    const view = await opened();
    routes['/courses/c1/teams'] = [BETA];

    await act(() => view.result.current.teamsDialog.onDelete(ALPHA));

    expect(api.delete).toHaveBeenCalledWith('/courses/c1/teams/t1');
    expect(setAlert).toHaveBeenCalledWith({ severity: 'success', message: 'Team "Alpha" deleted successfully' });
    expect(view.result.current.teamsDialog.teams).toEqual([BETA]);
    expect(refreshCourses).toHaveBeenCalledTimes(1);
  });

  test('identifies a team by id when it has no _id', async () => {
    const view = await opened();

    await act(() => view.result.current.teamsDialog.onDelete({ id: 'plain', team_name: 'Old' }));

    expect(api.delete).toHaveBeenCalledWith('/courses/c1/teams/plain');
  });

  test('when only the refresh fails, the delete still shows as done and the team is gone from the list', async () => {
    const view = await opened();
    delete routes['/courses/c1/teams'];

    await act(() => view.result.current.teamsDialog.onDelete(ALPHA));

    expect(setAlert).toHaveBeenCalledWith({ severity: 'success', message: 'Team "Alpha" deleted successfully' });
    expect(view.result.current.teamsDialog.teams).toEqual([BETA]);
  });

  test('says so when the delete itself fails, keeps the list and does not refresh the counts', async () => {
    const view = await opened();
    api.delete.mockRejectedValue(new Error('nope'));

    await act(() => view.result.current.teamsDialog.onDelete(ALPHA));

    expect(setAlert).toHaveBeenCalledWith({ severity: 'error', message: 'Failed to delete team "Alpha"' });
    expect(view.result.current.teamsDialog.teams).toEqual([ALPHA, BETA]);
    expect(refreshCourses).not.toHaveBeenCalled();
  });

  test('does nothing for a team with no id, or before a course has been opened', async () => {
    const view = await opened();
    await act(() => view.result.current.teamsDialog.onDelete({ team_name: 'Ghost' }));
    expect(confirm).not.toHaveBeenCalled();

    const utils = render();
    await act(() => utils.result.current.teamsDialog.onDelete(ALPHA));
    expect(confirm).not.toHaveBeenCalled();
    expect(api.delete).not.toHaveBeenCalled();
  });
});

describe('useTeams: editing a team', () => {
  const change = (view, form) => act(() => view.result.current.editTeamDialog.onFormChange(form));

  test('opens with the team\'s name and status, and cancelling closes it', async () => {
    const view = await opened();
    expect(view.result.current.editTeamDialog).toMatchObject({ open: false, form: { team_name: '', team_status: 'Active' } });

    act(() => view.result.current.teamsDialog.onEdit(BETA));
    expect(view.result.current.editTeamDialog).toMatchObject({ open: true, form: { team_name: 'Beta', team_status: 'Active' } });

    act(() => view.result.current.teamsDialog.onEdit({ ...ALPHA, team_status: 'Inactive' }));
    expect(view.result.current.editTeamDialog.form).toEqual({ team_name: 'Alpha', team_status: 'Inactive' });

    act(() => view.result.current.editTeamDialog.onClose());
    expect(view.result.current.editTeamDialog.open).toBe(false);
  });

  test('refuses an empty or blank name, and sends nothing', async () => {
    const view = await opened();
    act(() => view.result.current.teamsDialog.onEdit(ALPHA));
    change(view, { team_name: '   ', team_status: 'Active' });

    await act(() => view.result.current.editTeamDialog.onSave());

    expect(setAlert).toHaveBeenCalledWith({ severity: 'error', message: 'Team name is required' });
    expect(api.put).not.toHaveBeenCalled();
    expect(view.result.current.editTeamDialog.open).toBe(true);
  });

  test('saves the change, says so, shows the server\'s list, closes and empties the form', async () => {
    const view = await opened();
    act(() => view.result.current.teamsDialog.onEdit(ALPHA));
    change(view, { team_name: 'Alpha 2', team_status: 'Inactive' });
    routes['/courses/c1/teams'] = [{ ...ALPHA, team_name: 'Alpha 2', team_status: 'Inactive' }, BETA];

    await act(() => view.result.current.editTeamDialog.onSave());

    expect(api.put).toHaveBeenCalledWith('/courses/c1/teams/t1', { team_name: 'Alpha 2', team_status: 'Inactive' });
    expect(setAlert).toHaveBeenCalledWith({ severity: 'success', message: 'Team "Alpha 2" updated successfully' });
    expect(view.result.current.teamsDialog.teams[0]).toMatchObject({ team_name: 'Alpha 2', team_status: 'Inactive' });
    expect(view.result.current.editTeamDialog).toMatchObject({ open: false, form: { team_name: '', team_status: 'Active' } });
  });

  test('when only the refresh fails, shows the change in the list it already had', async () => {
    const view = await opened();
    act(() => view.result.current.teamsDialog.onEdit(ALPHA));
    change(view, { team_name: 'Alpha 2', team_status: 'Active' });
    delete routes['/courses/c1/teams'];

    await act(() => view.result.current.editTeamDialog.onSave());

    expect(setAlert).toHaveBeenCalledWith({ severity: 'success', message: 'Team "Alpha 2" updated successfully' });
    expect(view.result.current.teamsDialog.teams).toEqual([{ ...ALPHA, team_name: 'Alpha 2' }, BETA]);
  });

  test('a renamed team makes the page reload its students, which show the team name', async () => {
    const view = await opened();
    act(() => view.result.current.teamsDialog.onEdit(ALPHA));
    change(view, { team_name: 'Alpha 2', team_status: 'Active' });

    await act(() => view.result.current.editTeamDialog.onSave());

    expect(api.get).toHaveBeenCalledWith('/courses/c1/students');
    expect(setStudents).toHaveBeenCalledWith([ANN, BEN, CY]);
  });

  test('a change of status alone does not reload the students', async () => {
    const view = await opened();
    act(() => view.result.current.teamsDialog.onEdit(ALPHA));
    change(view, { team_name: 'Alpha', team_status: 'Inactive' });

    await act(() => view.result.current.editTeamDialog.onSave());

    expect(setStudents).not.toHaveBeenCalled();
    expect(api.get).not.toHaveBeenCalledWith('/courses/c1/students');
  });

  test('a rename does not reload the students when the page has none loaded', async () => {
    students = [];
    const view = await opened();
    act(() => view.result.current.teamsDialog.onEdit(ALPHA));
    change(view, { team_name: 'Alpha 2', team_status: 'Active' });

    await act(() => view.result.current.editTeamDialog.onSave());

    expect(setStudents).not.toHaveBeenCalled();
  });

  test('a failed students reload does not fail the save', async () => {
    const view = await opened();
    act(() => view.result.current.teamsDialog.onEdit(ALPHA));
    change(view, { team_name: 'Alpha 2', team_status: 'Active' });
    delete routes['/courses/c1/students'];

    await act(() => view.result.current.editTeamDialog.onSave());

    expect(view.result.current.editTeamDialog.open).toBe(false);
    expect(setAlert).not.toHaveBeenCalledWith(expect.objectContaining({ severity: 'error' }));
  });

  test('says "Failed to update team" and keeps the dialog open when the save fails', async () => {
    const view = await opened();
    act(() => view.result.current.teamsDialog.onEdit(ALPHA));
    api.put.mockRejectedValue(new Error('nope'));

    await act(() => view.result.current.editTeamDialog.onSave());

    expect(setAlert).toHaveBeenCalledWith({ severity: 'error', message: 'Failed to update team' });
    expect(view.result.current.editTeamDialog.open).toBe(true);
  });

  test('does nothing when no team is being edited', async () => {
    const view = await opened();
    await act(() => view.result.current.editTeamDialog.onSave());
    expect(api.put).not.toHaveBeenCalled();
    expect(setAlert).not.toHaveBeenCalled();
  });
});

describe('useTeams: creating a team', () => {
  const fill = (view, form) => act(() => view.result.current.createTeamDialog.onFormChange(form));

  test('opens from the list and cancelling closes it', async () => {
    const view = await opened();
    expect(view.result.current.createTeamDialog).toMatchObject({ open: false, form: { team_name: '', team_status: 'Active' } });

    act(() => view.result.current.teamsDialog.onCreate());
    expect(view.result.current.createTeamDialog.open).toBe(true);

    act(() => view.result.current.createTeamDialog.onClose());
    expect(view.result.current.createTeamDialog.open).toBe(false);
  });

  test('refuses an empty or blank name, and sends nothing', async () => {
    const view = await opened();
    fill(view, { team_name: '  ', team_status: 'Active' });

    await act(() => view.result.current.createTeamDialog.onCreate());

    expect(setAlert).toHaveBeenCalledWith({ severity: 'error', message: 'Team name is required' });
    expect(api.post).not.toHaveBeenCalled();
  });

  test('creates the team with a trimmed name, says so, shows the new list, closes, empties the form and refreshes the counts', async () => {
    const view = await opened();
    fill(view, { team_name: ' Gamma ', team_status: 'Active' });
    act(() => view.result.current.teamsDialog.onCreate());
    const GAMMA = { _id: 't3', team_name: 'Gamma', team_status: 'Active' };
    routes['/courses/c1/teams'] = [ALPHA, BETA, GAMMA];

    await act(() => view.result.current.createTeamDialog.onCreate());

    expect(api.post).toHaveBeenCalledWith('/courses/c1/teams', { teams: [{ team_name: 'Gamma', team_status: 'Active' }] });
    expect(setAlert).toHaveBeenCalledWith({ severity: 'success', message: 'Team " Gamma " created successfully' });
    expect(view.result.current.teamsDialog.teams).toHaveLength(3);
    expect(view.result.current.createTeamDialog).toMatchObject({ open: false, form: { team_name: '', team_status: 'Active' } });
    expect(refreshCourses).toHaveBeenCalledTimes(1);
  });

  test('shows the server\'s reason when it refuses the team, and keeps the dialog open', async () => {
    const view = await opened();
    fill(view, { team_name: 'Alpha', team_status: 'Active' });
    act(() => view.result.current.teamsDialog.onCreate());
    api.post.mockRejectedValue({ response: { data: { error: { message: 'Team name already used' } } } });

    await act(() => view.result.current.createTeamDialog.onCreate());

    expect(setAlert).toHaveBeenCalledWith({ severity: 'error', message: 'Team name already used' });
    expect(view.result.current.createTeamDialog.open).toBe(true);
  });

  test('says "Failed to create team" when the server gives no reason', async () => {
    const view = await opened();
    fill(view, { team_name: 'Gamma', team_status: 'Active' });
    api.post.mockRejectedValue(new Error('network'));

    await act(() => view.result.current.createTeamDialog.onCreate());

    expect(setAlert).toHaveBeenCalledWith({ severity: 'error', message: 'Failed to create team' });
  });

  test('does nothing before a course has been opened', async () => {
    const view = render();
    fill(view, { team_name: 'Gamma', team_status: 'Active' });

    await act(() => view.result.current.createTeamDialog.onCreate());

    expect(api.post).not.toHaveBeenCalled();
    expect(setAlert).not.toHaveBeenCalled();
  });
});

describe('useTeams: a team\'s students', () => {
  test('opens for the team and splits the course\'s students into those in it and those who are not', async () => {
    const view = render();
    await act(() => view.result.current.openTeams(COURSE));
    expect(view.result.current.teamStudentsDialog).toMatchObject({ open: false, team: null, teamStudents: [], availableStudents: [] });

    await act(() => view.result.current.teamsDialog.onManageStudents(ALPHA));

    expect(view.result.current.teamStudentsDialog).toMatchObject({
      open: true, team: ALPHA, teamStudents: [ANN], availableStudents: [BEN, CY],
    });
  });

  test('puts a student in the team by its name when the student has no team id (existing behaviour)', async () => {
    const byName = { _id: 's4', student_id: '1004', name: 'Di Doe', team_id: undefined, group_assignment: 'Alpha' };
    routes['/courses/c1/students'] = [ANN, byName];
    const view = await managing();

    expect(view.result.current.teamStudentsDialog.teamStudents).toEqual([ANN, byName]);
    // ... and, because a student with no team id also counts as "not in a team", in the other list too.
    expect(view.result.current.teamStudentsDialog.availableStudents).toEqual([byName]);
  });

  test('puts a student in the team by its id even when the student carries an old team name', async () => {
    const renamed = { _id: 's5', student_id: '1005', name: 'Ed Eng', team_id: 't1', group_assignment: 'Alpha (old name)' };
    routes['/courses/c1/students'] = [renamed, BEN];
    const view = await managing();

    expect(view.result.current.teamStudentsDialog.teamStudents).toEqual([renamed]);
    expect(view.result.current.teamStudentsDialog.availableStudents).toEqual([BEN]);
  });

  test('says "Failed to load team students" when the students cannot be fetched, but still opens the dialog', async () => {
    delete routes['/courses/c1/students'];
    const view = await opened();

    await act(() => view.result.current.teamsDialog.onManageStudents(ALPHA));

    expect(setAlert).toHaveBeenCalledWith({ severity: 'error', message: 'Failed to load team students' });
    expect(view.result.current.teamStudentsDialog.open).toBe(true);
  });

  test('closing the dialog closes it', async () => {
    const view = await managing();

    act(() => view.result.current.teamStudentsDialog.onClose());

    expect(view.result.current.teamStudentsDialog.open).toBe(false);
  });

  test('adds a student to the team, shows the new lists and the team counts, and says so', async () => {
    const view = await managing();
    const DI = { _id: 's4', student_id: '1004', name: 'Di Doe', team_id: 't1', group_assignment: 'Alpha' };
    routes['/courses/c1/students'] = [{ ...ANN }, { ...BEN, team_id: 't1', group_assignment: 'Alpha' }, DI, CY];
    routes['/courses/c1/teams'] = [{ ...ALPHA, student_count: 3 }, BETA];

    await act(() => view.result.current.teamStudentsDialog.onAdd('s2'));

    expect(api.post).toHaveBeenCalledWith('/courses/c1/teams/t1/students/s2');
    expect(setAlert).toHaveBeenCalledWith({ severity: 'success', message: 'Student added to Alpha' });
    // Whatever the server now says, including a student who joined from somewhere else.
    expect(view.result.current.teamStudentsDialog.teamStudents.map((s) => s._id)).toEqual(['s1', 's2', 's4']);
    expect(view.result.current.teamStudentsDialog.availableStudents).toEqual([CY]);
    expect(view.result.current.teamsDialog.teams[0]).toMatchObject({ student_count: 3 });
  });

  test('removes a student from the team, shows the new lists, and says so', async () => {
    const view = await managing();
    routes['/courses/c1/students'] = [{ ...ANN, team_id: null, group_assignment: '' }, BEN, CY];
    routes['/courses/c1/teams'] = [{ ...ALPHA, student_count: 0 }, BETA];

    await act(() => view.result.current.teamStudentsDialog.onRemove('s1'));

    expect(api.delete).toHaveBeenCalledWith('/courses/c1/teams/t1/students/s1');
    expect(setAlert).toHaveBeenCalledWith({ severity: 'success', message: 'Student removed from Alpha' });
    expect(view.result.current.teamStudentsDialog.teamStudents).toEqual([]);
    expect(view.result.current.teamStudentsDialog.availableStudents.map((s) => s._id)).toEqual(['s1', 's2', 's3']);
    expect(view.result.current.teamsDialog.teams[0]).toMatchObject({ student_count: 0 });
  });

  test('says so when the add or the remove fails', async () => {
    const view = await managing();
    api.post.mockRejectedValue(new Error('nope'));
    api.delete.mockRejectedValue(new Error('nope'));

    await act(() => view.result.current.teamStudentsDialog.onAdd('s2'));
    expect(setAlert).toHaveBeenLastCalledWith({ severity: 'error', message: 'Failed to add student to team' });

    await act(() => view.result.current.teamStudentsDialog.onRemove('s1'));
    expect(setAlert).toHaveBeenLastCalledWith({ severity: 'error', message: 'Failed to remove student from team' });
  });

  test('does nothing before a team has been chosen', async () => {
    const view = await opened();

    await act(() => view.result.current.teamStudentsDialog.onAdd('s2'));
    await act(() => view.result.current.teamStudentsDialog.onRemove('s1'));

    expect(api.post).not.toHaveBeenCalled();
    expect(api.delete).not.toHaveBeenCalled();
    expect(api.get).not.toHaveBeenCalledWith('/courses/c1/evaluations/status');
  });
});

describe('useTeams: changing a team after the evaluations were sent', () => {
  const evaluationsSent = () => { routes['/courses/c1/evaluations/status'] = { evaluations_sent: true }; };

  test('asks first instead of changing anything', async () => {
    evaluationsSent();
    const view = await managing();
    expect(view.result.current.evaluationResetDialog.open).toBe(false);

    await act(() => view.result.current.teamStudentsDialog.onAdd('s2'));
    expect(view.result.current.evaluationResetDialog.open).toBe(true);
    expect(api.post).not.toHaveBeenCalled();

    act(() => view.result.current.evaluationResetDialog.onCancel());
    await act(() => view.result.current.teamStudentsDialog.onRemove('s1'));
    expect(view.result.current.evaluationResetDialog.open).toBe(true);
    expect(api.delete).not.toHaveBeenCalled();
  });

  test('Cancel closes the question and changes nothing, now or later', async () => {
    evaluationsSent();
    const view = await managing();
    await act(() => view.result.current.teamStudentsDialog.onAdd('s2'));

    act(() => view.result.current.evaluationResetDialog.onCancel());
    expect(view.result.current.evaluationResetDialog.open).toBe(false);

    await act(() => view.result.current.evaluationResetDialog.onConfirm());
    expect(resetEvaluationState).not.toHaveBeenCalled();
    expect(api.post).not.toHaveBeenCalled();
  });

  test('Continue resets the evaluation state first, then makes the add', async () => {
    evaluationsSent();
    const view = await managing();
    await act(() => view.result.current.teamStudentsDialog.onAdd('s2'));
    const order = [];
    resetEvaluationState.mockImplementation(async () => { order.push('reset'); });
    api.post.mockImplementation(async () => { order.push('add'); return { data: {} }; });

    await act(() => view.result.current.evaluationResetDialog.onConfirm());

    expect(resetEvaluationState).toHaveBeenCalledWith('c1');
    expect(order).toEqual(['reset', 'add']);
    expect(api.post).toHaveBeenCalledWith('/courses/c1/teams/t1/students/s2');
    expect(view.result.current.evaluationResetDialog.open).toBe(false);
  });

  test('Continue resets the evaluation state first, then makes the remove', async () => {
    evaluationsSent();
    const view = await managing();
    await act(() => view.result.current.teamStudentsDialog.onRemove('s1'));
    const order = [];
    resetEvaluationState.mockImplementation(async () => { order.push('reset'); });
    api.delete.mockImplementation(async () => { order.push('remove'); return { data: {} }; });

    await act(() => view.result.current.evaluationResetDialog.onConfirm());

    expect(order).toEqual(['reset', 'remove']);
    expect(api.delete).toHaveBeenCalledWith('/courses/c1/teams/t1/students/s1');
  });

  test('the question is not repeated once it has been answered', async () => {
    evaluationsSent();
    const view = await managing();
    await act(() => view.result.current.teamStudentsDialog.onAdd('s2'));
    await act(() => view.result.current.evaluationResetDialog.onConfirm());
    resetEvaluationState.mockClear();
    api.post.mockClear();

    await act(() => view.result.current.evaluationResetDialog.onConfirm());

    expect(resetEvaluationState).not.toHaveBeenCalled();
    expect(api.post).not.toHaveBeenCalled();
  });

  test('says so when the check itself fails, and changes nothing', async () => {
    const view = await managing();
    delete routes['/courses/c1/evaluations/status'];

    await act(() => view.result.current.teamStudentsDialog.onAdd('s2'));

    expect(setAlert).toHaveBeenCalledWith({ severity: 'error', message: 'Failed to add student to team' });
    expect(api.post).not.toHaveBeenCalled();
  });
});

describe('useTeams: sending the evaluations to one team', () => {
  test('emails the team, says so, refreshes the counts, and is busy only while it runs', async () => {
    const view = await opened();
    let release;
    api.post.mockReturnValue(new Promise((resolve) => { release = resolve; }));

    let sending;
    act(() => { sending = view.result.current.teamsDialog.onSend(ALPHA); });
    expect(view.result.current.teamsDialog.sendingTeamIds).toEqual({ t1: true });

    await act(async () => { release({ data: { emails_sent: 2, total_students: 2, failed: [] } }); await sending; });

    expect(api.post).toHaveBeenCalledWith('/courses/c1/teams/t1/evaluations/send', {});
    expect(setAlert).toHaveBeenCalledWith({ severity: 'success', message: 'Evaluation invitations sent to team "Alpha".' });
    expect(refreshCourses).toHaveBeenCalledTimes(1);
    expect(view.result.current.teamsDialog.sendingTeamIds).toEqual({ t1: false });
  });

  test('names the students who did not get one', async () => {
    const view = await opened();
    api.post.mockResolvedValue({ data: { emails_sent: 1, total_students: 2, failed: ['Ben Baker (ben@example.edu): refused'] } });

    await act(() => view.result.current.teamsDialog.onSend(ALPHA));

    expect(setAlert).toHaveBeenCalledWith({ severity: 'warning', message: 'Sent 1 of 2 emails. Not sent to: Ben Baker.' });
  });

  test('shows the user message of a failure, or says it failed', async () => {
    const view = await opened();
    api.post.mockRejectedValueOnce({ userMessage: 'Mail is down' });
    await act(() => view.result.current.teamsDialog.onSend(ALPHA));
    expect(setAlert).toHaveBeenLastCalledWith({ severity: 'error', message: 'Mail is down' });

    api.post.mockRejectedValueOnce({ response: { data: { error: { message: 'No students in this team' } } } });
    await act(() => view.result.current.teamsDialog.onSend(ALPHA));
    expect(setAlert).toHaveBeenLastCalledWith({ severity: 'error', message: 'No students in this team' });

    api.post.mockRejectedValueOnce(new Error('network'));
    await act(() => view.result.current.teamsDialog.onSend(ALPHA));
    expect(setAlert).toHaveBeenLastCalledWith({ severity: 'error', message: 'Failed to send evaluations to team "Alpha".' });
    expect(view.result.current.teamsDialog.sendingTeamIds).toEqual({ t1: false });
    expect(refreshCourses).not.toHaveBeenCalled();
  });

  test('does nothing without a team, or before a course has been opened', async () => {
    const view = await opened();
    await act(() => view.result.current.teamsDialog.onSend(undefined));
    const utils = render();
    await act(() => utils.result.current.teamsDialog.onSend(ALPHA));

    expect(api.post).not.toHaveBeenCalled();
    expect(setAlert).not.toHaveBeenCalled();
    expect(utils.result.current.teamsDialog.sendingTeamIds).toEqual({});
  });

  test('identifies a team by id when it has no _id', async () => {
    const view = await opened();

    await act(() => view.result.current.teamsDialog.onSend({ id: 'plain', team_name: 'Old' }));

    expect(api.post).toHaveBeenCalledWith('/courses/c1/teams/plain/evaluations/send', {});
    expect(view.result.current.teamsDialog.sendingTeamIds).toEqual({ plain: false });
  });
});
