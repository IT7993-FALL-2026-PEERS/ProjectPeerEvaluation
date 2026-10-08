import { renderHook, act, waitFor } from '@testing-library/react';
import api from '../../services/api';
import useStudents from '../useStudents';

vi.mock('../../services/api', () => ({
  __esModule: true,
  default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
}));

// The Manage Students dialog and the four dialogs that open from it: add, edit, roster upload and
// delete all (CICD-57, step 6b-2). The page owns the alert, the course list and the teams; the hook
// owns the students and what the professor does with them, and hands back the props each dialog
// takes.
const COURSE = { _id: 'c1', course_name: 'Capstone' };
const ANN = { _id: 's1', student_id: '1001', name: 'Ann Archer', email: 'ann@example.edu', group_assignment: 'Alpha' };
const BEN = { _id: 's2', student_id: '1002', name: 'Ben Baker', email: 'ben@example.edu', group_assignment: '' };
const NO_SEARCH = { student_id: '', name: '', email: '', team: '' };
const EMPTY_FORM = { student_id: '', name: '', email: '', group_assignment: '' };

let setAlert;
let refreshCourses;
let onAllStudentsDeleted;

beforeEach(() => {
  vi.restoreAllMocks();
  Object.values(api).forEach((fn) => fn.mockReset());
  api.get.mockResolvedValue({ data: [ANN, BEN] });
  setAlert = vi.fn();
  refreshCourses = vi.fn().mockResolvedValue();
  onAllStudentsDeleted = vi.fn();
});

const render = () => renderHook(() => useStudents({ setAlert, refreshCourses, onAllStudentsDeleted }));

// Renders the hook with the course's students already open, like the page after "Manage Students".
async function opened() {
  const view = render();
  await act(() => view.result.current.openStudents(COURSE));
  return view;
}

const file = (name) => new File(['x'], name, { type: 'text/csv' });

describe('useStudents: opening the list', () => {
  test('opens the dialog for the course, shows the loading state, then the students', async () => {
    const view = render();
    expect(view.result.current.studentsDialog).toMatchObject({ open: false, course: null, students: [], loading: false });

    let opening;
    let release;
    api.get.mockReturnValue(new Promise((resolve) => { release = resolve; }));
    act(() => { opening = view.result.current.openStudents(COURSE); });
    expect(view.result.current.studentsDialog).toMatchObject({ open: true, course: COURSE, loading: true });

    await act(async () => { release({ data: [ANN, BEN] }); await opening; });
    expect(view.result.current.studentsDialog).toMatchObject({ open: true, loading: false, students: [ANN, BEN] });
    expect(api.get).toHaveBeenCalledWith('/courses/c1/students');
  });

  test('asks for a course by its id when it has no _id', async () => {
    const view = render();

    await act(() => view.result.current.openStudents({ id: 'plain', course_name: 'Legacy' }));

    expect(api.get).toHaveBeenCalledWith('/courses/plain/students');
  });

  test('shows an empty list, and stops loading, when the students cannot be fetched', async () => {
    api.get.mockRejectedValue(new Error('down'));
    const view = render();

    await act(() => view.result.current.openStudents(COURSE));

    expect(view.result.current.studentsDialog).toMatchObject({ open: true, loading: false, students: [] });
    expect(setAlert).not.toHaveBeenCalled();
  });

  test('forgets an earlier search, and hides the search fields, each time it opens', async () => {
    const view = await opened();
    act(() => view.result.current.studentsDialog.onToggleSearch());
    act(() => view.result.current.studentsDialog.onSearchChange('name', 'ann'));

    await act(() => view.result.current.openStudents(COURSE));

    expect(view.result.current.studentsDialog).toMatchObject({ search: NO_SEARCH, showSearch: false });
  });

  test('closing the list closes the dialog and refreshes the course counts', async () => {
    const view = await opened();

    act(() => view.result.current.studentsDialog.onClose());

    expect(view.result.current.studentsDialog.open).toBe(false);
    expect(refreshCourses).toHaveBeenCalledTimes(1);
  });
});

describe('useStudents: search', () => {
  test('changing one field keeps the others', async () => {
    const view = await opened();

    act(() => view.result.current.studentsDialog.onSearchChange('name', 'an'));
    act(() => view.result.current.studentsDialog.onSearchChange('team', 'Al'));

    expect(view.result.current.studentsDialog.search).toEqual({ ...NO_SEARCH, name: 'an', team: 'Al' });
  });

  test('the toggle shows the search fields and hides them again', async () => {
    const view = await opened();

    act(() => view.result.current.studentsDialog.onToggleSearch());
    expect(view.result.current.studentsDialog.showSearch).toBe(true);
    act(() => view.result.current.studentsDialog.onToggleSearch());
    expect(view.result.current.studentsDialog.showSearch).toBe(false);
  });

  test('clearing empties every field and hides the search fields', async () => {
    const view = await opened();
    act(() => view.result.current.studentsDialog.onToggleSearch());
    act(() => view.result.current.studentsDialog.onSearchChange('email', 'ben'));

    act(() => view.result.current.studentsDialog.onClearSearch());

    expect(view.result.current.studentsDialog).toMatchObject({ search: NO_SEARCH, showSearch: false });
  });
});

describe('useStudents: adding a student', () => {
  const fill = (view, form) => act(() => view.result.current.addStudentDialog.onFormChange(form));

  test('the Add Student dialog opens from the list and closes with its error cleared', async () => {
    const view = await opened();
    expect(view.result.current.addStudentDialog).toMatchObject({ open: false, form: EMPTY_FORM, error: '' });

    act(() => view.result.current.studentsDialog.onAddStudent());
    expect(view.result.current.addStudentDialog.open).toBe(true);

    await act(() => view.result.current.addStudentDialog.onSubmit());
    expect(view.result.current.addStudentDialog.error).toBe('Student ID, name, and email are required.');
    act(() => view.result.current.addStudentDialog.onClose());
    expect(view.result.current.addStudentDialog).toMatchObject({ open: false, error: '' });
  });

  test.each([
    ['student id', { student_id: '', name: 'Cy', email: 'cy@example.edu', group_assignment: '' }],
    ['name', { student_id: '3', name: '', email: 'cy@example.edu', group_assignment: '' }],
    ['email', { student_id: '3', name: 'Cy', email: '', group_assignment: '' }],
  ])('refuses a student with no %s, and sends nothing', async (_field, form) => {
    const view = await opened();
    fill(view, form);

    await act(() => view.result.current.addStudentDialog.onSubmit());

    expect(view.result.current.addStudentDialog.error).toBe('Student ID, name, and email are required.');
    expect(api.post).not.toHaveBeenCalled();
  });

  test('does nothing before a course has been opened', async () => {
    const view = render();
    fill(view, { student_id: '3', name: 'Cy', email: 'cy@example.edu', group_assignment: '' });

    await act(() => view.result.current.addStudentDialog.onSubmit());

    expect(api.post).not.toHaveBeenCalled();
    expect(view.result.current.addStudentDialog.error).toBe('');
  });

  test('saves the student, says so, closes the dialog, empties the form and reloads the list', async () => {
    const view = await opened();
    const CY = { student_id: '3', name: 'Cy', email: 'cy@example.edu', group_assignment: 'Beta' };
    fill(view, CY);
    act(() => view.result.current.studentsDialog.onAddStudent());
    act(() => view.result.current.studentsDialog.onToggleSearch());
    act(() => view.result.current.studentsDialog.onSearchChange('name', 'zzz'));
    api.post.mockResolvedValue({});
    api.get.mockResolvedValue({ data: [ANN, BEN, { _id: 's3', ...CY }] });

    await act(() => view.result.current.addStudentDialog.onSubmit());

    expect(api.post).toHaveBeenCalledWith('/courses/c1/students', CY);
    expect(setAlert).toHaveBeenCalledWith({ severity: 'success', message: 'Student added successfully' });
    expect(view.result.current.addStudentDialog).toMatchObject({ open: false, form: EMPTY_FORM, error: '' });
    expect(view.result.current.studentsDialog.students).toHaveLength(3);
    // The new student must not be hidden by a search typed before.
    expect(view.result.current.studentsDialog.search).toEqual(NO_SEARCH);
    expect(view.result.current.studentsDialog.open).toBe(true);
  });

  test('shows the reason the server gives when it refuses the student', async () => {
    const view = await opened();
    fill(view, { student_id: '1001', name: 'Dup', email: 'dup@example.edu', group_assignment: '' });
    api.post.mockRejectedValue({ response: { data: { error: { message: 'Student ID already in this course' } } } });

    await act(() => view.result.current.addStudentDialog.onSubmit());

    expect(view.result.current.addStudentDialog.error).toBe('Student ID already in this course');
    expect(setAlert).not.toHaveBeenCalled();
  });

  test('says "Failed to add student." when the server gives no reason', async () => {
    const view = await opened();
    fill(view, { student_id: '3', name: 'Cy', email: 'cy@example.edu', group_assignment: '' });
    api.post.mockRejectedValue(new Error('network'));

    await act(() => view.result.current.addStudentDialog.onSubmit());

    expect(view.result.current.addStudentDialog.error).toBe('Failed to add student.');
  });

  test('clears an earlier error when it tries again', async () => {
    const view = await opened();
    await act(() => view.result.current.addStudentDialog.onSubmit());
    expect(view.result.current.addStudentDialog.error).not.toBe('');
    fill(view, { student_id: '3', name: 'Cy', email: 'cy@example.edu', group_assignment: '' });
    api.post.mockResolvedValue({});

    await act(() => view.result.current.addStudentDialog.onSubmit());

    expect(view.result.current.addStudentDialog.error).toBe('');
  });
});

describe('useStudents: editing a student', () => {
  test('opens with the student\'s details, an empty team when there is none', async () => {
    const view = await opened();

    act(() => view.result.current.studentsDialog.onEdit(ANN));
    expect(view.result.current.editStudentDialog).toMatchObject({
      open: true, form: { student_id: '1001', name: 'Ann Archer', email: 'ann@example.edu', group_assignment: 'Alpha' },
    });

    act(() => view.result.current.studentsDialog.onEdit(BEN));
    expect(view.result.current.editStudentDialog.form.group_assignment).toBe('');

    act(() => view.result.current.studentsDialog.onEdit({ _id: 's3', student_id: '3', name: 'Cy', email: 'cy@example.edu' }));
    expect(view.result.current.editStudentDialog.form.group_assignment).toBe('');
  });

  test('saves the changes, says so, closes, empties the form and reloads the list', async () => {
    const view = await opened();
    act(() => view.result.current.studentsDialog.onEdit(ANN));
    act(() => view.result.current.editStudentDialog.onFormChange({ ...ANN, name: 'Ann A.', _id: undefined }));
    api.put.mockResolvedValue({});
    api.get.mockResolvedValue({ data: [{ ...ANN, name: 'Ann A.' }, BEN] });

    await act(() => view.result.current.editStudentDialog.onSave());

    expect(api.put).toHaveBeenCalledWith('/courses/c1/students/s1', expect.objectContaining({ name: 'Ann A.' }));
    expect(setAlert).toHaveBeenCalledWith({ severity: 'success', message: 'Student updated successfully' });
    expect(view.result.current.editStudentDialog).toMatchObject({ open: false, form: EMPTY_FORM });
    expect(view.result.current.studentsDialog.students[0].name).toBe('Ann A.');
  });

  test('identifies a student by id when it has no _id', async () => {
    const view = await opened();
    act(() => view.result.current.studentsDialog.onEdit({ id: 'plain', student_id: '9', name: 'Old', email: 'o@example.edu' }));
    api.put.mockResolvedValue({});

    await act(() => view.result.current.editStudentDialog.onSave());

    expect(api.put).toHaveBeenCalledWith('/courses/c1/students/plain', expect.any(Object));
  });

  test('says "Failed to update student" and keeps the dialog open when the save fails', async () => {
    const view = await opened();
    act(() => view.result.current.studentsDialog.onEdit(ANN));
    api.put.mockRejectedValue(new Error('nope'));

    await act(() => view.result.current.editStudentDialog.onSave());

    expect(setAlert).toHaveBeenCalledWith({ severity: 'error', message: 'Failed to update student' });
    expect(view.result.current.editStudentDialog.open).toBe(true);
  });

  test('does nothing when no student is being edited', async () => {
    const view = await opened();

    await act(() => view.result.current.editStudentDialog.onSave());

    expect(api.put).not.toHaveBeenCalled();
    expect(setAlert).not.toHaveBeenCalled();
  });

  test('cancelling closes the dialog and empties the form', async () => {
    const view = await opened();
    act(() => view.result.current.studentsDialog.onEdit(ANN));

    act(() => view.result.current.editStudentDialog.onClose());

    expect(view.result.current.editStudentDialog).toMatchObject({ open: false, form: EMPTY_FORM });
    await act(() => view.result.current.editStudentDialog.onSave());
    expect(api.put).not.toHaveBeenCalled();
  });
});

describe('useStudents: deleting one student', () => {
  let confirm;
  beforeEach(() => {
    confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  test('asks first, naming the student, the team and what will be lost; saying no changes nothing', async () => {
    const view = await opened();
    confirm.mockReturnValue(false);

    await act(() => view.result.current.studentsDialog.onDelete(ANN));

    const message = confirm.mock.calls[0][0];
    expect(message).toContain('Are you sure you want to delete "Ann Archer" (ID: 1001)?');
    expect(message).toContain('Team: Alpha');
    expect(message).toContain('Delete their evaluation data');
    expect(api.delete).not.toHaveBeenCalled();
    expect(setAlert).not.toHaveBeenCalled();
  });

  test('says when the student is not in a team', async () => {
    const view = await opened();
    confirm.mockReturnValue(false);

    await act(() => view.result.current.studentsDialog.onDelete(BEN));

    expect(confirm.mock.calls[0][0]).toContain('Not assigned to any team');
  });

  test('deletes the student, says so, and reloads the list', async () => {
    const view = await opened();
    api.delete.mockResolvedValue({});
    api.get.mockResolvedValue({ data: [BEN] });

    await act(() => view.result.current.studentsDialog.onDelete(ANN));

    expect(api.delete).toHaveBeenCalledWith('/courses/c1/students/s1');
    expect(setAlert).toHaveBeenCalledWith({ severity: 'success', message: 'Student "Ann Archer" deleted successfully' });
    expect(view.result.current.studentsDialog.students).toEqual([BEN]);
  });

  test('identifies a student by id when it has no _id', async () => {
    const view = await opened();
    api.delete.mockResolvedValue({});

    await act(() => view.result.current.studentsDialog.onDelete({ id: 'plain', student_id: '8', name: 'Old' }));

    expect(api.delete).toHaveBeenCalledWith('/courses/c1/students/plain');
  });

  test('names a student with no name by their id number', async () => {
    const view = await opened();
    api.delete.mockResolvedValue({});

    await act(() => view.result.current.studentsDialog.onDelete({ _id: 's9', student_id: '777' }));

    expect(setAlert).toHaveBeenCalledWith({ severity: 'success', message: 'Student "Student 777" deleted successfully' });
  });

  test('says so when the delete fails, and leaves the list as it was', async () => {
    const view = await opened();
    api.delete.mockRejectedValue(new Error('nope'));

    await act(() => view.result.current.studentsDialog.onDelete(ANN));

    expect(setAlert).toHaveBeenCalledWith({ severity: 'error', message: 'Failed to delete student "Ann Archer"' });
    expect(view.result.current.studentsDialog.students).toEqual([ANN, BEN]);
  });

  test('refuses a student with no id, and asks nothing', async () => {
    const view = await opened();

    await act(() => view.result.current.studentsDialog.onDelete({ student_id: '5', name: 'Ghost' }));

    expect(setAlert).toHaveBeenCalledWith({ severity: 'error', message: 'Student ID is missing. Cannot delete.' });
    expect(confirm).not.toHaveBeenCalled();
    expect(api.delete).not.toHaveBeenCalled();
  });

  test('does nothing before a course has been opened', async () => {
    const view = render();

    await act(() => view.result.current.studentsDialog.onDelete(ANN));

    expect(confirm).not.toHaveBeenCalled();
    expect(api.delete).not.toHaveBeenCalled();
  });
});

describe('useStudents: uploading a roster', () => {
  test('the upload dialog opens from the list', async () => {
    const view = await opened();
    expect(view.result.current.csvUploadDialog).toMatchObject({ open: false, file: null, uploading: false, error: '', results: null });

    act(() => view.result.current.studentsDialog.onUploadCsv());

    expect(view.result.current.csvUploadDialog.open).toBe(true);
  });

  test('keeps a file whose name ends in .csv, in any case, and clears an earlier error', async () => {
    const view = await opened();
    act(() => view.result.current.csvUploadDialog.onFileChange({ target: { files: [file('notes.txt')] } }));
    expect(view.result.current.csvUploadDialog.error).not.toBe('');

    const roster = file('Roster.CSV');
    act(() => view.result.current.csvUploadDialog.onFileChange({ target: { files: [roster] } }));

    expect(view.result.current.csvUploadDialog).toMatchObject({ file: roster, error: '' });
  });

  test('refuses any other file, and forgets the one chosen before', async () => {
    const view = await opened();
    act(() => view.result.current.csvUploadDialog.onFileChange({ target: { files: [file('a.csv')] } }));

    act(() => view.result.current.csvUploadDialog.onFileChange({ target: { files: [file('roster.xlsx')] } }));

    expect(view.result.current.csvUploadDialog).toMatchObject({ file: null, error: 'Please choose a file whose name ends in .csv' });
  });

  test('does nothing without a file', async () => {
    const view = await opened();

    await act(() => view.result.current.csvUploadDialog.onUpload());

    expect(api.post).not.toHaveBeenCalled();
  });

  test('sends the file, shows the result and the message, reloads the list and forgets the file', async () => {
    const view = await opened();
    const roster = file('roster.csv');
    act(() => view.result.current.csvUploadDialog.onFileChange({ target: { files: [roster] } }));
    const RESULT = { message: '3 students added', students: [] };
    api.post.mockResolvedValue({ data: RESULT });
    api.get.mockResolvedValue({ data: [ANN, BEN, { _id: 's3', student_id: '3', name: 'Cy' }] });

    await act(() => view.result.current.csvUploadDialog.onUpload());

    const [url, body, options] = api.post.mock.calls[0];
    expect(url).toBe('/courses/c1/roster');
    expect(body.get('file')).toBe(roster);
    expect(options).toEqual({ headers: { 'Content-Type': 'multipart/form-data' } });
    expect(setAlert).toHaveBeenCalledWith({ severity: 'success', message: '3 students added' });
    expect(view.result.current.csvUploadDialog).toMatchObject({ results: RESULT, file: null, uploading: false, error: '' });
    expect(view.result.current.studentsDialog.students).toHaveLength(3);
  });

  test('is uploading while the request runs, and shows no old result', async () => {
    const view = await opened();
    act(() => view.result.current.csvUploadDialog.onFileChange({ target: { files: [file('roster.csv')] } }));
    let release;
    api.post.mockReturnValue(new Promise((resolve) => { release = resolve; }));

    let uploading;
    act(() => { uploading = view.result.current.csvUploadDialog.onUpload(); });
    expect(view.result.current.csvUploadDialog).toMatchObject({ uploading: true, results: null, error: '' });

    await act(async () => { release({ data: { message: 'done' } }); await uploading; });
    expect(view.result.current.csvUploadDialog.uploading).toBe(false);
  });

  test('forgets the previous upload result as soon as the next one starts', async () => {
    const view = await opened();
    act(() => view.result.current.csvUploadDialog.onFileChange({ target: { files: [file('first.csv')] } }));
    api.post.mockResolvedValue({ data: { message: 'first done', students: [] } });
    await act(() => view.result.current.csvUploadDialog.onUpload());
    expect(view.result.current.csvUploadDialog.results).not.toBeNull();
    act(() => view.result.current.csvUploadDialog.onFileChange({ target: { files: [file('second.csv')] } }));
    let release;
    api.post.mockReturnValue(new Promise((resolve) => { release = resolve; }));

    let uploading;
    act(() => { uploading = view.result.current.csvUploadDialog.onUpload(); });

    expect(view.result.current.csvUploadDialog.results).toBeNull();
    await act(async () => { release({ data: { message: 'second done' } }); await uploading; });
  });

  test('shows the server\'s reason when the file is refused, in the dialog and as an alert, and keeps the file', async () => {
    const view = await opened();
    const roster = file('roster.csv');
    act(() => view.result.current.csvUploadDialog.onFileChange({ target: { files: [roster] } }));
    api.post.mockRejectedValue({ response: { data: { error: { message: 'Row 3 has no email' } } } });

    await act(() => view.result.current.csvUploadDialog.onUpload());

    expect(view.result.current.csvUploadDialog).toMatchObject({ error: 'Row 3 has no email', file: roster, uploading: false });
    expect(setAlert).toHaveBeenCalledWith({ severity: 'error', message: 'Row 3 has no email' });
  });

  test('says "Failed to upload CSV file" when the server gives no reason', async () => {
    const view = await opened();
    act(() => view.result.current.csvUploadDialog.onFileChange({ target: { files: [file('roster.csv')] } }));
    api.post.mockRejectedValue(new Error('network'));

    await act(() => view.result.current.csvUploadDialog.onUpload());

    expect(view.result.current.csvUploadDialog.error).toBe('Failed to upload CSV file');
  });

  test('closing the dialog clears the error and the result', async () => {
    const view = await opened();
    act(() => view.result.current.studentsDialog.onUploadCsv());
    act(() => view.result.current.csvUploadDialog.onFileChange({ target: { files: [file('x.txt')] } }));

    act(() => view.result.current.csvUploadDialog.onClose());

    expect(view.result.current.csvUploadDialog).toMatchObject({ open: false, error: '', results: null });
  });
});

describe('useStudents: deleting all students', () => {
  test('opens from the list, counts the students it would delete, and closes', async () => {
    const view = await opened();
    expect(view.result.current.deleteAllStudentsDialog).toMatchObject({ open: false, studentCount: 2, loading: false });

    act(() => view.result.current.studentsDialog.onDeleteAll());
    expect(view.result.current.deleteAllStudentsDialog.open).toBe(true);

    act(() => view.result.current.deleteAllStudentsDialog.onClose());
    expect(view.result.current.deleteAllStudentsDialog.open).toBe(false);
  });

  test('a wrong confirmation phrase is reported as an alert', async () => {
    const view = await opened();

    act(() => view.result.current.deleteAllStudentsDialog.onMismatch());

    expect(setAlert).toHaveBeenCalledWith({ severity: 'error', message: 'Please type "DELETE ALL" to confirm' });
  });

  test('deletes them all, says how many, empties the list and the search, tells the page, closes and refreshes the counts', async () => {
    const view = await opened();
    act(() => view.result.current.studentsDialog.onDeleteAll());
    act(() => view.result.current.studentsDialog.onToggleSearch());
    act(() => view.result.current.studentsDialog.onSearchChange('name', 'ann'));
    api.delete.mockResolvedValue({ data: { message: 'All students deleted', deleted_students: 2, deleted_teams: 1 } });

    await act(() => view.result.current.deleteAllStudentsDialog.onConfirm());

    expect(api.delete).toHaveBeenCalledWith('/courses/c1/students');
    expect(setAlert).toHaveBeenCalledWith({ severity: 'success', message: 'All students deleted (2 students, 1 teams deleted)' });
    expect(view.result.current.studentsDialog).toMatchObject({ students: [], search: NO_SEARCH, showSearch: false });
    expect(onAllStudentsDeleted).toHaveBeenCalledTimes(1);
    expect(view.result.current.deleteAllStudentsDialog).toMatchObject({ open: false, loading: false });
    expect(refreshCourses).toHaveBeenCalledTimes(1);
  });

  test('is loading while the request runs', async () => {
    const view = await opened();
    let release;
    api.delete.mockReturnValue(new Promise((resolve) => { release = resolve; }));

    let deleting;
    act(() => { deleting = view.result.current.deleteAllStudentsDialog.onConfirm(); });
    expect(view.result.current.deleteAllStudentsDialog.loading).toBe(true);

    await act(async () => { release({ data: { message: 'ok', deleted_students: 0, deleted_teams: 0 } }); await deleting; });
    expect(view.result.current.deleteAllStudentsDialog.loading).toBe(false);
  });

  test('on a failure shows the server\'s reason, keeps the list and the dialog, and stops loading', async () => {
    const view = await opened();
    act(() => view.result.current.studentsDialog.onDeleteAll());
    api.delete.mockRejectedValue({ response: { data: { error: { message: 'Course is locked' } } } });

    await act(() => view.result.current.deleteAllStudentsDialog.onConfirm());

    expect(setAlert).toHaveBeenCalledWith({ severity: 'error', message: 'Course is locked' });
    expect(view.result.current.studentsDialog.students).toEqual([ANN, BEN]);
    expect(view.result.current.deleteAllStudentsDialog).toMatchObject({ open: true, loading: false });
    expect(onAllStudentsDeleted).not.toHaveBeenCalled();
  });

  test('says "Failed to delete all students" when the server gives no reason', async () => {
    const view = await opened();
    api.delete.mockRejectedValue(new Error('network'));

    await act(() => view.result.current.deleteAllStudentsDialog.onConfirm());

    expect(setAlert).toHaveBeenCalledWith({ severity: 'error', message: 'Failed to delete all students' });
  });

  test('does nothing before a course has been opened', async () => {
    const view = render();

    await act(() => view.result.current.deleteAllStudentsDialog.onConfirm());

    expect(api.delete).not.toHaveBeenCalled();
    expect(setAlert).not.toHaveBeenCalled();
    expect(view.result.current.deleteAllStudentsDialog.loading).toBe(false);
  });
});

describe('useStudents: what the page can reach', () => {
  test('exposes the students and a way to replace them, for the team dialogs that refresh them', async () => {
    const view = await opened();
    expect(view.result.current.students).toEqual([ANN, BEN]);

    act(() => view.result.current.setStudents([BEN]));

    expect(view.result.current.students).toEqual([BEN]);
    expect(view.result.current.studentsDialog.students).toEqual([BEN]);
    await waitFor(() => expect(view.result.current.deleteAllStudentsDialog.studentCount).toBe(1));
  });
});
