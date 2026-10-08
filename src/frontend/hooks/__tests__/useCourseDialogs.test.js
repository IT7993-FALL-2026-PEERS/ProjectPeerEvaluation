import { renderHook, act } from '@testing-library/react';
import api from '../../services/api';
import useCourseDialogs from '../useCourseDialogs';

vi.mock('../../services/api', () => ({
  __esModule: true,
  default: { post: vi.fn(), put: vi.fn(), delete: vi.fn() },
}));

// The four course dialogs: create, edit, delete and the roster upload from a course row (CICD-57,
// step 6b-5). The page owns the alert and the course list; the hook owns the dialogs, their forms
// and the requests, and hands back the props each dialog takes.
const CAPSTONE = { _id: 'c1', course_name: 'Capstone', course_number: 'CS 4850', course_section: '01', semester: 'Fall 2026', course_status: 'Active' };
const EMPTY_NEW = { course_name: '', course_number: '', course_section: '', semester: '' };
const EMPTY_EDIT = { course_name: '', course_number: '', course_section: '', semester: '', course_status: 'Active' };

let setAlert;
let refreshCourses;

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
  Object.values(api).forEach((fn) => fn.mockReset());
  api.post.mockResolvedValue({ data: { students: [] } });
  api.put.mockResolvedValue({ data: {} });
  api.delete.mockResolvedValue({ data: {} });
  setAlert = vi.fn();
  refreshCourses = vi.fn();
});

const render = () => renderHook(() => useCourseDialogs({ setAlert, refreshCourses }));
const csv = (name = 'roster.csv') => new File(['x'], name, { type: 'text/csv' });

describe('useCourseDialogs: creating a course', () => {
  const fill = (view, form) => act(() => view.result.current.createCourseDialog.onFormChange(form));
  const NEW = { course_name: 'Databases', course_number: 'IT 3100', course_section: '02', semester: 'Fall 2026' };

  test('opens with an empty form, and cancelling closes it', () => {
    const view = render();
    expect(view.result.current.createCourseDialog).toMatchObject({ open: false, form: EMPTY_NEW });

    act(() => view.result.current.openCreate());
    expect(view.result.current.createCourseDialog.open).toBe(true);

    act(() => view.result.current.createCourseDialog.onClose());
    expect(view.result.current.createCourseDialog.open).toBe(false);
  });

  test('creates the course, says so, closes, empties the form and refreshes the list', async () => {
    const view = render();
    act(() => view.result.current.openCreate());
    fill(view, NEW);

    await act(() => view.result.current.createCourseDialog.onCreate());

    expect(api.post).toHaveBeenCalledWith('/courses', NEW);
    expect(setAlert).toHaveBeenCalledWith({ severity: 'success', message: 'Course created successfully' });
    expect(view.result.current.createCourseDialog).toMatchObject({ open: false, form: EMPTY_NEW });
    expect(refreshCourses).toHaveBeenCalledTimes(1);
  });

  test('says "Failed to create course" and keeps the dialog and what was typed when it fails', async () => {
    const view = render();
    act(() => view.result.current.openCreate());
    fill(view, NEW);
    api.post.mockRejectedValue({ response: { status: 409, data: { error: { message: 'exists' } } } });

    await act(() => view.result.current.createCourseDialog.onCreate());

    expect(setAlert).toHaveBeenCalledWith({ severity: 'error', message: 'Failed to create course' });
    expect(view.result.current.createCourseDialog).toMatchObject({ open: true, form: NEW });
    expect(refreshCourses).not.toHaveBeenCalled();
  });
});

describe('useCourseDialogs: editing a course', () => {
  test('opens with the course\'s details', () => {
    const view = render();
    expect(view.result.current.editCourseDialog).toMatchObject({ open: false, form: EMPTY_EDIT });

    act(() => view.result.current.startEdit(CAPSTONE));

    expect(view.result.current.editCourseDialog).toMatchObject({
      open: true,
      form: { course_name: 'Capstone', course_number: 'CS 4850', course_section: '01', semester: 'Fall 2026', course_status: 'Active' },
    });
  });

  test('falls back to the old course code, an empty section and Active', () => {
    const view = render();

    act(() => view.result.current.startEdit({ id: 'old', course_name: 'Legacy', course_code: 'IT 1000', semester: 'Fall 2020' }));

    expect(view.result.current.editCourseDialog.form).toEqual({
      course_name: 'Legacy', course_number: 'IT 1000', course_section: '', semester: 'Fall 2020', course_status: 'Active',
    });

    act(() => view.result.current.startEdit({ _id: 'x', course_name: 'Bare', semester: 'Spring 2021' }));
    expect(view.result.current.editCourseDialog.form.course_number).toBe('');
  });

  test('keeps an Inactive status', () => {
    const view = render();

    act(() => view.result.current.startEdit({ ...CAPSTONE, course_status: 'Inactive' }));

    expect(view.result.current.editCourseDialog.form.course_status).toBe('Inactive');
  });

  test('saves the changes, says so, closes and refreshes the list', async () => {
    const view = render();
    act(() => view.result.current.startEdit(CAPSTONE));
    act(() => view.result.current.editCourseDialog.onFormChange({ ...view.result.current.editCourseDialog.form, semester: 'Spring 2027' }));

    await act(() => view.result.current.editCourseDialog.onSave());

    expect(api.put).toHaveBeenCalledWith('/courses/c1', { course_name: 'Capstone', course_number: 'CS 4850', course_section: '01', semester: 'Spring 2027', course_status: 'Active' });
    expect(setAlert).toHaveBeenCalledWith({ severity: 'success', message: 'Course updated successfully' });
    expect(view.result.current.editCourseDialog.open).toBe(false);
    expect(refreshCourses).toHaveBeenCalledTimes(1);
  });

  test('forgets the course once it is saved, so Save cannot be pressed again for it', async () => {
    const view = render();
    act(() => view.result.current.startEdit(CAPSTONE));
    await act(() => view.result.current.editCourseDialog.onSave());
    api.put.mockClear();

    await act(() => view.result.current.editCourseDialog.onSave());

    expect(api.put).not.toHaveBeenCalled();
  });

  test('identifies a course by id when it has no _id', async () => {
    const view = render();
    act(() => view.result.current.startEdit({ id: 'plain', course_name: 'Legacy', semester: 'Fall 2020' }));

    await act(() => view.result.current.editCourseDialog.onSave());

    expect(api.put).toHaveBeenCalledWith('/courses/plain', expect.any(Object));
  });

  test('says "Failed to update course" and keeps the dialog open when the save fails', async () => {
    const view = render();
    act(() => view.result.current.startEdit(CAPSTONE));
    api.put.mockRejectedValue(new Error('nope'));

    await act(() => view.result.current.editCourseDialog.onSave());

    expect(setAlert).toHaveBeenCalledWith({ severity: 'error', message: 'Failed to update course' });
    expect(view.result.current.editCourseDialog.open).toBe(true);
    expect(refreshCourses).not.toHaveBeenCalled();
  });

  test('does nothing when no course is being edited', async () => {
    const view = render();

    await act(() => view.result.current.editCourseDialog.onSave());

    expect(api.put).not.toHaveBeenCalled();
    expect(setAlert).not.toHaveBeenCalled();
  });

  test('cancelling closes the dialog', () => {
    const view = render();
    act(() => view.result.current.startEdit(CAPSTONE));

    act(() => view.result.current.editCourseDialog.onClose());

    expect(view.result.current.editCourseDialog.open).toBe(false);
  });
});

describe('useCourseDialogs: deleting a course', () => {
  test('opens from the course row, and cancelling closes it', () => {
    const view = render();
    expect(view.result.current.deleteCourseDialog.open).toBe(false);

    act(() => view.result.current.startDelete(CAPSTONE));
    expect(view.result.current.deleteCourseDialog.open).toBe(true);

    act(() => view.result.current.deleteCourseDialog.onClose());
    expect(view.result.current.deleteCourseDialog.open).toBe(false);
  });

  test('deletes the course, says so, closes and refreshes the list', async () => {
    const view = render();
    act(() => view.result.current.startDelete(CAPSTONE));

    await act(() => view.result.current.deleteCourseDialog.onConfirm());

    expect(api.delete).toHaveBeenCalledWith('/courses/c1');
    expect(setAlert).toHaveBeenCalledWith({ severity: 'success', message: 'Course deleted successfully' });
    expect(view.result.current.deleteCourseDialog.open).toBe(false);
    expect(refreshCourses).toHaveBeenCalledTimes(1);
  });

  test('prefers a course\'s id to its _id, as the page always did', async () => {
    const view = render();
    act(() => view.result.current.startDelete({ id: 'plain', _id: 'mongo', course_name: 'Both' }));

    await act(() => view.result.current.deleteCourseDialog.onConfirm());

    expect(api.delete).toHaveBeenCalledWith('/courses/plain');
  });

  test('says "Failed to delete course" and keeps the dialog open when the delete fails', async () => {
    const view = render();
    act(() => view.result.current.startDelete(CAPSTONE));
    api.delete.mockRejectedValue(new Error('nope'));

    await act(() => view.result.current.deleteCourseDialog.onConfirm());

    expect(setAlert).toHaveBeenCalledWith({ severity: 'error', message: 'Failed to delete course' });
    expect(view.result.current.deleteCourseDialog.open).toBe(true);
    expect(refreshCourses).not.toHaveBeenCalled();
  });

  test('does nothing when no course was chosen, or the course has no id', async () => {
    const view = render();
    await act(() => view.result.current.deleteCourseDialog.onConfirm());
    expect(api.delete).not.toHaveBeenCalled();

    act(() => view.result.current.startDelete({ course_name: 'Ghost' }));
    await act(() => view.result.current.deleteCourseDialog.onConfirm());
    expect(api.delete).not.toHaveBeenCalled();
    expect(setAlert).not.toHaveBeenCalled();
  });

  test('forgets the course once it is deleted, so Delete cannot be pressed again for it', async () => {
    const view = render();
    act(() => view.result.current.startDelete(CAPSTONE));
    await act(() => view.result.current.deleteCourseDialog.onConfirm());
    api.delete.mockClear();

    await act(() => view.result.current.deleteCourseDialog.onConfirm());

    expect(api.delete).not.toHaveBeenCalled();
  });
});

describe('useCourseDialogs: uploading a roster from a course row', () => {
  const upload = (view) => act(() => view.result.current.rosterUploadDialog.onUpload());
  const choose = (view, file) => act(() => view.result.current.rosterUploadDialog.onFileChange(file));

  test('opens for the course with no file and no progress', () => {
    const view = render();
    expect(view.result.current.rosterUploadDialog).toMatchObject({ open: false, file: null, progress: 0 });

    act(() => view.result.current.startRosterUpload(CAPSTONE));

    expect(view.result.current.rosterUploadDialog).toMatchObject({ open: true, file: null, progress: 0 });
  });

  test('keeps the file that was chosen', () => {
    const view = render();
    act(() => view.result.current.startRosterUpload(CAPSTONE));
    const file = csv();

    choose(view, file);

    expect(view.result.current.rosterUploadDialog.file).toBe(file);
  });

  test.each([
    ['no file was chosen', (view) => act(() => view.result.current.startRosterUpload(CAPSTONE))],
    ['no course was chosen', (view) => choose(view, csv())],
  ])('says "No course selected." and sends nothing when %s', async (_name, setUp) => {
    const view = render();
    setUp(view);

    await upload(view);

    expect(setAlert).toHaveBeenCalledWith({ severity: 'error', message: 'No course selected.' });
    expect(api.post).not.toHaveBeenCalled();
  });

  test('says the same when the chosen course has no id', async () => {
    const view = render();
    act(() => view.result.current.startRosterUpload({ course_name: 'Ghost' }));
    choose(view, csv());

    await upload(view);

    expect(setAlert).toHaveBeenCalledWith({ severity: 'error', message: 'No course selected.' });
    expect(api.post).not.toHaveBeenCalled();
  });

  test('sends the file to the course, says how many students were added, closes and refreshes the list', async () => {
    const view = render();
    act(() => view.result.current.startRosterUpload(CAPSTONE));
    const file = csv();
    choose(view, file);
    api.post.mockResolvedValue({ data: { students: [{}, {}, {}] } });

    await upload(view);

    const [url, body, options] = api.post.mock.calls[0];
    expect(url).toBe('/courses/c1/roster');
    expect(body.get('file')).toBe(file);
    expect(options.headers).toEqual({ 'Content-Type': 'multipart/form-data' });
    expect(setAlert).toHaveBeenCalledWith({ severity: 'success', message: '3 students added successfully' });
    expect(view.result.current.rosterUploadDialog).toMatchObject({ open: false, file: null, progress: 0 });
    expect(refreshCourses).toHaveBeenCalledTimes(1);
  });

  test('uses a course\'s id before its _id', async () => {
    const view = render();
    act(() => view.result.current.startRosterUpload({ id: 'plain', _id: 'mongo' }));
    choose(view, csv());

    await upload(view);

    expect(api.post.mock.calls[0][0]).toBe('/courses/plain/roster');
  });

  test('shows 25 at once, then the progress the browser reports', async () => {
    const view = render();
    act(() => view.result.current.startRosterUpload(CAPSTONE));
    choose(view, csv());
    let release;
    api.post.mockImplementation((_url, _body, options) => {
      options.onUploadProgress({ loaded: 1, total: 3 });
      return new Promise((resolve) => { release = resolve; });
    });

    let uploading;
    act(() => { uploading = view.result.current.rosterUploadDialog.onUpload(); });
    await act(async () => { await Promise.resolve(); });
    expect(view.result.current.rosterUploadDialog.progress).toBe(33);

    await act(async () => { release({ data: { students: [] } }); await uploading; });
  });

  test('says "Failed to upload roster" with the server\'s reason or without, keeps the file, and takes the progress back to 0', async () => {
    const view = render();
    act(() => view.result.current.startRosterUpload(CAPSTONE));
    const file = csv();
    choose(view, file);
    api.post.mockRejectedValueOnce({ response: { data: { error: { message: 'Row 2 has no email' } } } });
    await upload(view);
    expect(setAlert).toHaveBeenLastCalledWith({ severity: 'error', message: 'Row 2 has no email' });
    expect(view.result.current.rosterUploadDialog).toMatchObject({ open: true, file, progress: 0 });

    api.post.mockRejectedValueOnce(new Error('network'));
    await upload(view);
    expect(setAlert).toHaveBeenLastCalledWith({ severity: 'error', message: 'Failed to upload roster' });
    expect(refreshCourses).not.toHaveBeenCalled();
  });

  test('closing the dialog forgets the file and the progress', async () => {
    const view = render();
    act(() => view.result.current.startRosterUpload(CAPSTONE));
    choose(view, csv());

    act(() => view.result.current.rosterUploadDialog.onClose());

    expect(view.result.current.rosterUploadDialog).toMatchObject({ open: false, file: null, progress: 0 });
  });

  test('an upload still running when the dialog is closed finishes without touching the next dialog', async () => {
    const view = render();
    act(() => view.result.current.startRosterUpload(CAPSTONE));
    choose(view, csv('first.csv'));
    let release;
    let reportProgress;
    api.post.mockImplementation((_url, _body, options) => {
      reportProgress = options.onUploadProgress;
      return new Promise((resolve) => { release = resolve; });
    });
    let uploading;
    act(() => { uploading = view.result.current.rosterUploadDialog.onUpload(); });
    await act(async () => { await Promise.resolve(); });

    // The professor cancels, then opens the upload for another course and picks another file.
    act(() => view.result.current.rosterUploadDialog.onClose());
    act(() => view.result.current.startRosterUpload({ _id: 'c2', course_name: 'Databases' }));
    const second = csv('second.csv');
    choose(view, second);

    act(() => reportProgress({ loaded: 3, total: 4 }));
    await act(async () => { release({ data: { students: [{}] } }); await uploading; });

    // The first upload still reports its result and refreshes the counts ...
    expect(setAlert).toHaveBeenCalledWith({ severity: 'success', message: '1 students added successfully' });
    expect(refreshCourses).toHaveBeenCalledTimes(1);
    // ... but the second dialog keeps its own file, stays open, and shows no progress from the first.
    expect(view.result.current.rosterUploadDialog).toMatchObject({ open: true, file: second, progress: 0 });
  });

  test('a failed upload that finishes after its dialog was closed leaves the next dialog alone', async () => {
    const view = render();
    const requests = [];
    api.post.mockImplementation(() => new Promise((resolve, reject) => { requests.push({ resolve, reject }); }));

    act(() => view.result.current.startRosterUpload(CAPSTONE));
    choose(view, csv('first.csv'));
    let first;
    act(() => { first = view.result.current.rosterUploadDialog.onUpload(); });
    await act(async () => { await Promise.resolve(); });

    // The professor cancels, opens the upload for another course, and starts that upload too.
    act(() => view.result.current.rosterUploadDialog.onClose());
    act(() => view.result.current.startRosterUpload({ _id: 'c2' }));
    choose(view, csv('second.csv'));
    let second;
    act(() => { second = view.result.current.rosterUploadDialog.onUpload(); });
    await act(async () => { await Promise.resolve(); });
    expect(view.result.current.rosterUploadDialog.progress).toBe(25);

    // The first upload now fails. It still says so, but must not reset the second one's progress.
    await act(async () => { requests[0].reject(new Error('network')); await first; });
    expect(setAlert).toHaveBeenCalledWith({ severity: 'error', message: 'Failed to upload roster' });
    expect(view.result.current.rosterUploadDialog).toMatchObject({ open: true, progress: 25 });

    await act(async () => { requests[1].resolve({ data: { students: [] } }); await second; });
  });
});
