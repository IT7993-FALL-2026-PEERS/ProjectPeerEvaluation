import { renderHook, act } from '@testing-library/react';
import api from '../../services/api';
import { getApiBaseUrl } from '../../services/apiUrl';
import useEvaluations from '../useEvaluations';

jest.mock('../../services/api', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), delete: jest.fn(), defaults: { baseURL: 'http://api.test' } },
}));

// The evaluations of a course: sending the invitations, sending reminders, the Evaluation Status
// dialog, and resetting the evaluation state (CICD-57, step 6b-4). The page owns the alert; the hook
// owns the sending and resetting flags and the dialog, and hands back the dialog's props.
const COURSE = { _id: 'c1', course_name: 'Capstone' };
const NOT_SENT = { evaluations_sent: false };
const SENT = { evaluations_sent: true, total_students: 4 };
const ROOT = getApiBaseUrl().replace(/\/api$/, '/');

let setAlert;
let statusBody;

beforeEach(() => {
  jest.restoreAllMocks();
  jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.spyOn(console, 'log').mockImplementation(() => {});
  Object.values(api).forEach((fn) => { if (typeof fn.mockReset === 'function') fn.mockReset(); });
  statusBody = SENT;
  api.get.mockImplementation(async () => ({ data: statusBody }));
  api.post.mockResolvedValue({ data: {} });
  api.delete.mockResolvedValue({ data: {} });
  global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ message: 'API is running' }) });
  setAlert = jest.fn();
});

afterEach(() => {
  jest.useRealTimers();
  delete global.fetch;
});

const render = () => renderHook(() => useEvaluations({ setAlert }));

// The Evaluation Status dialog opened on the course, like the page after the chart button.
async function opened(course = COURSE) {
  const view = render();
  await act(() => view.result.current.viewStatus(course));
  return view;
}

// Lets the page's one-second "refresh the status" timer run.
async function afterOneSecond() {
  await act(async () => { jest.advanceTimersByTime(1000); });
}

describe('useEvaluations: the status dialog', () => {
  test('opens for the course, shows the loading state, then the status', async () => {
    const view = render();
    expect(view.result.current.evaluationStatusDialog).toMatchObject({ open: false, course: null, status: null, loading: false });

    let opening;
    let release;
    api.get.mockReturnValue(new Promise((resolve) => { release = resolve; }));
    act(() => { opening = view.result.current.viewStatus(COURSE); });
    expect(view.result.current.evaluationStatusDialog).toMatchObject({ open: true, course: COURSE, loading: true });

    await act(async () => { release({ data: SENT }); await opening; });
    expect(view.result.current.evaluationStatusDialog).toMatchObject({ open: true, loading: false, status: SENT });
    expect(api.get).toHaveBeenCalledWith('/courses/c1/evaluations/status');
  });

  test('asks for a course by its id when it has no _id', async () => {
    await opened({ id: 'plain', course_name: 'Legacy' });

    expect(api.get).toHaveBeenCalledWith('/courses/plain/evaluations/status');
  });

  test('says so, shows no status and stops loading when the status cannot be fetched', async () => {
    api.get.mockRejectedValue(new Error('down'));
    const view = render();

    await act(() => view.result.current.viewStatus(COURSE));

    expect(setAlert).toHaveBeenCalledWith({ severity: 'error', message: 'Failed to load evaluation status' });
    expect(view.result.current.evaluationStatusDialog).toMatchObject({ open: true, loading: false, status: null });
  });

  test('forgets the status it had when a later load fails', async () => {
    const view = await opened();
    expect(view.result.current.evaluationStatusDialog.status).toEqual(SENT);
    api.get.mockRejectedValue(new Error('down'));

    await act(() => view.result.current.viewStatus(COURSE));

    expect(view.result.current.evaluationStatusDialog.status).toBeNull();
  });

  test('closing the dialog closes it', async () => {
    const view = await opened();

    act(() => view.result.current.evaluationStatusDialog.onClose());

    expect(view.result.current.evaluationStatusDialog.open).toBe(false);
  });
});

describe('useEvaluations: sending the invitations', () => {
  const send = (view, id = 'c1') => act(() => view.result.current.sendInvitations(id));

  test('checks the backend is reachable first, then sends, then says how many went out', async () => {
    const view = render();
    api.post.mockResolvedValue({ data: { message: 'Evaluations sent', emails_sent: 4, total_students: 4, failed: [] } });

    await send(view);

    expect(global.fetch).toHaveBeenCalledWith(ROOT);
    expect(api.post).toHaveBeenCalledWith('/courses/c1/evaluations/send');
    expect(setAlert).toHaveBeenCalledWith({ severity: 'success', message: '✅ Evaluations sent - Emails sent to 4 students' });
  });

  test('says "all" when the server gives no count', async () => {
    const view = render();
    api.post.mockResolvedValue({ data: { message: 'Evaluations sent', total_students: 4, failed: [] } });

    await send(view);

    expect(setAlert).toHaveBeenCalledWith({ severity: 'success', message: '✅ Evaluations sent - Emails sent to all students' });
  });

  test('names the students who did not get one', async () => {
    const view = render();
    api.post.mockResolvedValue({ data: { message: 'm', emails_sent: 3, total_students: 4, failed: ['Ben Baker (ben@example.edu): refused'] } });

    await send(view);

    expect(setAlert).toHaveBeenCalledWith({ severity: 'warning', message: 'Sent 3 of 4 emails. Not sent to: Ben Baker.' });
  });

  test('is busy for that course only while it runs', async () => {
    const view = render();
    let release;
    api.post.mockReturnValue(new Promise((resolve) => { release = resolve; }));

    let sending;
    act(() => { sending = view.result.current.sendInvitations('c1'); });
    await act(async () => { await Promise.resolve(); });
    expect(view.result.current.sendingEvaluations).toEqual({ c1: true });

    await act(async () => { release({ data: { message: 'm', emails_sent: 1, total_students: 1, failed: [] } }); await sending; });
    expect(view.result.current.sendingEvaluations).toEqual({ c1: false });
  });

  test('closes the status dialog and shows the new status a second later', async () => {
    jest.useFakeTimers();
    const view = await opened();
    api.get.mockClear();
    statusBody = { evaluations_sent: true, total_students: 4, completed: 0 };

    await send(view);
    expect(view.result.current.evaluationStatusDialog.open).toBe(false);
    expect(api.get).not.toHaveBeenCalled();

    await afterOneSecond();
    expect(api.get).toHaveBeenCalledWith('/courses/c1/evaluations/status');
    expect(view.result.current.evaluationStatusDialog).toMatchObject({ open: true, course: { _id: 'c1', id: 'c1' }, status: statusBody });
  });

  test.each([
    ['cannot be reached at all', () => global.fetch.mockRejectedValue(new Error('refused'))],
    ['answers with an error', () => global.fetch.mockResolvedValue({ ok: false, status: 502, json: async () => ({}) })],
  ])('says so and sends nothing when the backend %s', async (_name, breakIt) => {
    breakIt();
    const view = render();

    await send(view);

    expect(setAlert).toHaveBeenCalledWith({ severity: 'error', message: '❌ Cannot connect to backend server. Please check if the backend is running.' });
    expect(api.post).not.toHaveBeenCalled();
    expect(view.result.current.sendingEvaluations).toEqual({ c1: false });
  });

  test.each([
    ['a timeout', { code: 'ECONNABORTED' }, 'Email sending is taking longer than expected. This is normal for the first time. Please wait a few more minutes and check your email, or try again.'],
    ['a server error', { response: { status: 500, data: { message: 'boom' } } }, 'Server error - check backend logs for SMTP configuration issues'],
    ['an expired login', { response: { status: 401 } }, 'Authentication failed - please log in again'],
    ['a reason from the server', { response: { status: 400, data: { message: 'No students in this course' } } }, 'No students in this course'],
    ['an error body', { response: { status: 400, data: { error: { message: 'Course is closed' } } } }, 'Course is closed'],
    ['an error with only a message', new Error('network down'), 'network down'],
  ])('says what went wrong after %s, and is no longer busy', async (_name, failure, message) => {
    const view = render();
    api.post.mockRejectedValue(failure);

    await send(view);

    expect(setAlert).toHaveBeenCalledWith({ severity: 'error', message: `❌ ${message}` });
    expect(view.result.current.sendingEvaluations).toEqual({ c1: false });
  });

  test('says "Failed to send evaluation invitations" when there is nothing more to say', async () => {
    const view = render();
    api.post.mockRejectedValue({});

    await send(view);

    expect(setAlert).toHaveBeenCalledWith({ severity: 'error', message: '❌ Failed to send evaluation invitations' });
  });
});

describe('useEvaluations: sending reminders', () => {
  const remind = (view) => act(() => view.result.current.evaluationStatusDialog.onRemind());

  test('reminds the students of the course in the dialog and says how many', async () => {
    const view = await opened();
    api.post.mockResolvedValue({ data: { message: 'Reminders sent', reminders_sent: 2, total_reminded: 2, failed: [] } });

    await remind(view);

    expect(api.post).toHaveBeenCalledWith('/courses/c1/evaluations/remind');
    expect(setAlert).toHaveBeenCalledWith({ severity: 'success', message: 'Reminders sent' });
  });

  test('names the students who did not get a reminder', async () => {
    const view = await opened();
    api.post.mockResolvedValue({ data: { message: 'm', reminders_sent: 1, total_reminded: 2, failed: ['Ben Baker (ben@example.edu): refused'] } });

    await remind(view);

    expect(setAlert).toHaveBeenCalledWith({ severity: 'warning', message: 'Sent 1 of 2 emails. Not sent to: Ben Baker.' });
  });

  test('shows the new status while the dialog is open', async () => {
    const view = await opened();
    api.post.mockResolvedValue({ data: { message: 'm', reminders_sent: 1, total_reminded: 1, failed: [] } });
    const NEWER = { evaluations_sent: true, total_students: 4, completed: 3 };
    statusBody = NEWER;

    await remind(view);

    expect(view.result.current.evaluationStatusDialog.status).toEqual(NEWER);
  });

  test('does not reload the status once the dialog is closed', async () => {
    const view = await opened();
    act(() => view.result.current.evaluationStatusDialog.onClose());
    api.post.mockResolvedValue({ data: { message: 'm', reminders_sent: 1, total_reminded: 1, failed: [] } });
    api.get.mockClear();

    await act(() => view.result.current.evaluationStatusDialog.onRemind());

    expect(api.get).not.toHaveBeenCalled();
  });

  test('says "Failed to send reminders" with the server\'s reason or without', async () => {
    const view = await opened();
    api.post.mockRejectedValueOnce({ response: { data: { error: { message: 'Nobody to remind' } } } });
    await remind(view);
    expect(setAlert).toHaveBeenLastCalledWith({ severity: 'error', message: 'Nobody to remind' });

    api.post.mockRejectedValueOnce(new Error('network'));
    await remind(view);
    expect(setAlert).toHaveBeenLastCalledWith({ severity: 'error', message: 'Failed to send reminders' });
  });
});

describe('useEvaluations: resetting the evaluation state', () => {
  test('resets the course, says how much was cleared, and shows the new status a second later', async () => {
    jest.useFakeTimers();
    const view = render();
    api.delete.mockResolvedValue({ data: { message: 'Evaluation state reset', tokens_cleared: 4, evaluations_deleted: 2 } });
    statusBody = NOT_SENT;

    await act(() => view.result.current.resetEvaluationState('c1'));

    expect(api.delete).toHaveBeenCalledWith('/courses/c1/evaluations/reset');
    expect(setAlert).toHaveBeenCalledWith({ severity: 'success', message: '✅ Evaluation state reset - Cleared 4 tokens and 2 evaluations' });
    expect(api.get).not.toHaveBeenCalled();

    await afterOneSecond();
    expect(view.result.current.evaluationStatusDialog).toMatchObject({ open: true, status: NOT_SENT });
  });

  test('is resetting only while the request runs', async () => {
    const view = render();
    let release;
    api.delete.mockReturnValue(new Promise((resolve) => { release = resolve; }));

    let resetting;
    act(() => { resetting = view.result.current.resetEvaluationState('c1'); });
    expect(view.result.current.evaluationStatusDialog.resetting).toBe(true);

    await act(async () => { release({ data: { message: 'ok', tokens_cleared: 0, evaluations_deleted: 0 } }); await resetting; });
    expect(view.result.current.evaluationStatusDialog.resetting).toBe(false);
  });

  test('says what went wrong, with the server\'s reason or "Failed to reset evaluation state"', async () => {
    const view = render();
    api.delete.mockRejectedValueOnce({ response: { data: { message: 'Not allowed' } } });
    await act(() => view.result.current.resetEvaluationState('c1'));
    expect(setAlert).toHaveBeenLastCalledWith({ severity: 'error', message: '❌ Not allowed' });

    api.delete.mockRejectedValueOnce(new Error('network'));
    await act(() => view.result.current.resetEvaluationState('c1'));
    expect(setAlert).toHaveBeenLastCalledWith({ severity: 'error', message: '❌ Failed to reset evaluation state' });
    expect(view.result.current.evaluationStatusDialog.resetting).toBe(false);
  });
});

describe('useEvaluations: what the dialog sends', () => {
  test('its buttons act on the course the dialog is open for', async () => {
    const view = await opened({ id: 'plain', course_name: 'Legacy' });
    api.post.mockResolvedValue({ data: { message: 'm', emails_sent: 1, total_students: 1, failed: [] } });

    await act(() => view.result.current.evaluationStatusDialog.onSend());
    expect(api.post).toHaveBeenLastCalledWith('/courses/plain/evaluations/send');

    await act(() => view.result.current.evaluationStatusDialog.onReset());
    expect(api.delete).toHaveBeenCalledWith('/courses/plain/evaluations/reset');

    await act(() => view.result.current.evaluationStatusDialog.onRemind());
    expect(api.post).toHaveBeenLastCalledWith('/courses/plain/evaluations/remind');
  });

  test('shows the dialog as sending for a course that has only an id', async () => {
    const view = await opened({ id: 'plain', course_name: 'Legacy' });
    let release;
    api.post.mockReturnValue(new Promise((resolve) => { release = resolve; }));

    let sending;
    act(() => { sending = view.result.current.evaluationStatusDialog.onSend(); });
    await act(async () => { await Promise.resolve(); });
    expect(view.result.current.evaluationStatusDialog.sending).toBe(true);

    await act(async () => { release({ data: { message: 'm', emails_sent: 1, total_students: 1, failed: [] } }); await sending; });
    expect(view.result.current.evaluationStatusDialog.sending).toBe(false);
  });

  test('shows the dialog as sending while that course is being sent to, and no other', async () => {
    const view = await opened();
    let release;
    api.post.mockReturnValue(new Promise((resolve) => { release = resolve; }));
    expect(view.result.current.evaluationStatusDialog.sending).toBe(false);

    let sending;
    act(() => { sending = view.result.current.sendInvitations('other'); });
    await act(async () => { await Promise.resolve(); });
    expect(view.result.current.evaluationStatusDialog.sending).toBe(false);
    await act(async () => { release({ data: { message: 'm', emails_sent: 1, total_students: 1, failed: [] } }); await sending; });

    api.post.mockReturnValue(new Promise((resolve) => { release = resolve; }));
    act(() => { sending = view.result.current.sendInvitations('c1'); });
    await act(async () => { await Promise.resolve(); });
    expect(view.result.current.evaluationStatusDialog.sending).toBe(true);
    await act(async () => { release({ data: { message: 'm', emails_sent: 1, total_students: 1, failed: [] } }); await sending; });
  });
});
