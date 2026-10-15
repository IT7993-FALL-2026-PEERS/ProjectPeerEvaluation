import { renderHook, act } from '@testing-library/react';
import api from '../../services/api';
import { getApiBaseUrl } from '../../services/apiUrl';
import useEvaluations from '../useEvaluations';
import { toLocalInputValue } from '../../services/deadline';

vi.mock('../../services/api', () => ({
  __esModule: true,
  default: { get: vi.fn(), post: vi.fn(), delete: vi.fn(), defaults: { baseURL: 'http://api.test' } },
}));

// The evaluations of a course: sending the invitations, sending reminders, the Evaluation Status
// dialog, and resetting the evaluation state (CICD-57, step 6b-4). The page owns the alert; the hook
// owns the sending and resetting flags and the dialog, and hands back the dialog's props.
const COURSE = { _id: 'c1', course_name: 'Capstone' };
const NOT_SENT = { evaluations_sent: false };
const SENT = { evaluations_sent: true, total_students: 4 };
const ROOT = getApiBaseUrl().replace(/\/api$/, '/');
// CICD-67: what the deadline dialog hands the send endpoint.
const PAYLOAD = { deadline: '2999-01-01T10:00:00.000Z', deadline_zone: 'UTC' };
const CHOSEN = '2999-01-01T10:00';

let setAlert;
let statusBody;

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
  Object.values(api).forEach((fn) => { if (typeof fn.mockReset === 'function') fn.mockReset(); });
  statusBody = SENT;
  api.get.mockImplementation(async () => ({ data: statusBody }));
  api.post.mockResolvedValue({ data: {} });
  api.delete.mockResolvedValue({ data: {} });
  global.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ message: 'API is running' }) });
  setAlert = vi.fn();
});

afterEach(() => {
  vi.useRealTimers();
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
  await act(async () => { vi.advanceTimersByTime(1000); });
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
  const send = (view, id = 'c1') => act(() => view.result.current.sendInvitations(id, PAYLOAD));

  test('checks the backend is reachable first, then sends, then says how many went out', async () => {
    const view = render();
    api.post.mockResolvedValue({ data: { message: 'Evaluations sent', emails_sent: 4, total_students: 4, failed: [] } });

    await send(view);

    expect(global.fetch).toHaveBeenCalledWith(ROOT);
    expect(api.post).toHaveBeenCalledWith('/courses/c1/evaluations/send', PAYLOAD);
    expect(setAlert).toHaveBeenCalledWith({ severity: 'success', message: '✅ Evaluations sent - Emails sent to 4 students.' });
  });

  // Codex review: "all" was shown when none were sent; zero stays zero.
  test('says 0, not "all", when the server gives no count', async () => {
    const view = render();
    api.post.mockResolvedValue({ data: { message: 'Evaluations sent', total_students: 4, failed: [] } });

    await send(view);

    expect(setAlert).toHaveBeenCalledWith({ severity: 'success', message: '✅ Evaluations sent - Emails sent to 0 students.' });
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
    act(() => { sending = view.result.current.sendInvitations('c1', PAYLOAD); });
    await act(async () => { await Promise.resolve(); });
    expect(view.result.current.sendingEvaluations).toEqual({ c1: true });

    await act(async () => { release({ data: { message: 'm', emails_sent: 1, total_students: 1, failed: [] } }); await sending; });
    expect(view.result.current.sendingEvaluations).toEqual({ c1: false });
  });

  test('closes the status dialog and shows the new status a second later', async () => {
    vi.useFakeTimers();
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
    vi.useFakeTimers();
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

    act(() => view.result.current.evaluationStatusDialog.onSend());
    await act(() => view.result.current.sendDeadlineDialog.onConfirm(CHOSEN));
    expect(api.post).toHaveBeenLastCalledWith('/courses/plain/evaluations/send', expect.objectContaining({ deadline: expect.any(String) }));

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
    act(() => view.result.current.evaluationStatusDialog.onSend());
    // The promise is kept, not awaited: the post is held open until release() below
    act(() => { sending = view.result.current.sendDeadlineDialog.onConfirm(CHOSEN); });
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
    act(() => { sending = view.result.current.sendInvitations('other', PAYLOAD); });
    await act(async () => { await Promise.resolve(); });
    expect(view.result.current.evaluationStatusDialog.sending).toBe(false);
    await act(async () => { release({ data: { message: 'm', emails_sent: 1, total_students: 1, failed: [] } }); await sending; });

    api.post.mockReturnValue(new Promise((resolve) => { release = resolve; }));
    act(() => { sending = view.result.current.sendInvitations('c1', PAYLOAD); });
    await act(async () => { await Promise.resolve(); });
    expect(view.result.current.evaluationStatusDialog.sending).toBe(true);
    await act(async () => { release({ data: { message: 'm', emails_sent: 1, total_students: 1, failed: [] } }); await sending; });
  });
});

describe('useEvaluations: asking for a deadline before sending (CICD-67)', () => {
  test('requestSend opens the deadline dialog for the course, prefilled from its last deadline, and sends nothing yet', () => {
    const view = render();
    const last = new Date(Date.now() + 5 * 86400000);
    act(() => view.result.current.requestSend({ _id: 'c1', last_evaluation_deadline: last.toISOString() }));
    const dialog = view.result.current.sendDeadlineDialog;
    expect(dialog.open).toBe(true);
    expect(dialog.initialValue).toBe(toLocalInputValue(last));
    expect(api.post).not.toHaveBeenCalled();
  });

  test('confirming posts the deadline and the zone to the course send endpoint, and closes the dialog', async () => {
    api.post.mockResolvedValue({ data: { message: 'sent', emails_sent: 2, total_students: 2, failed: [] } });
    const view = render();
    act(() => view.result.current.requestSend({ _id: 'c1' }));
    await act(() => view.result.current.sendDeadlineDialog.onConfirm(CHOSEN));
    expect(api.post).toHaveBeenCalledWith('/courses/c1/evaluations/send', {
      deadline: new Date(CHOSEN).toISOString(), deadline_zone: expect.any(String),
    });
    expect(view.result.current.sendDeadlineDialog.open).toBe(false);
  });

  test('cancelling closes the dialog and sends nothing', () => {
    const view = render();
    act(() => view.result.current.requestSend({ _id: 'c1' }));
    act(() => view.result.current.sendDeadlineDialog.onClose());
    expect(view.result.current.sendDeadlineDialog.open).toBe(false);
    expect(api.post).not.toHaveBeenCalled();
  });

  test('the status dialog\'s send asks for a deadline for the course it shows', async () => {
    const view = await opened();
    act(() => view.result.current.evaluationStatusDialog.onSend());
    expect(view.result.current.sendDeadlineDialog.open).toBe(true);
    expect(api.post).not.toHaveBeenCalled();
  });

  // Codex review: the course list is not reloaded after a send, so the hook remembers the deadline itself.
  test('after a send that emailed someone, the next send is prefilled with that deadline', async () => {
    const used = new Date(Date.now() + 3 * 86400000);
    api.post.mockResolvedValue({ data: { message: 'sent', emails_sent: 1, total_students: 1, failed: [], deadline: used.toISOString() } });
    const view = render();
    act(() => view.result.current.requestSend(COURSE));
    await act(() => view.result.current.sendDeadlineDialog.onConfirm(toLocalInputValue(used)));
    act(() => view.result.current.requestSend(COURSE));
    expect(view.result.current.sendDeadlineDialog.initialValue).toBe(toLocalInputValue(used));
  });

  test('the alert says who already had a link or had submitted', async () => {
    api.post.mockResolvedValue({ data: { message: 'Sent.', emails_sent: 1, total_students: 1, failed: [], already_invited: 2, already_submitted: 1 } });
    const view = render();
    await act(() => view.result.current.sendInvitations('c1', PAYLOAD));
    expect(setAlert).toHaveBeenCalledWith({ severity: 'success', message: '✅ Sent. - Emails sent to 1 students. 2 already had a link. 1 already submitted.' });
  });

  test('a reminder names the students whose deadline has passed', async () => {
    const view = await opened();
    api.post.mockResolvedValue({ data: { message: 'Reminders sent', reminders_sent: 1, total_reminded: 1, failed: [], deadline_passed: ['Pat Lee'], not_invited: 0 } });
    await act(() => view.result.current.evaluationStatusDialog.onRemind());
    expect(setAlert).toHaveBeenCalledWith({ severity: 'warning', message: 'Reminders sent Deadline passed (extend first): Pat Lee.' });
  });
});

describe('useEvaluations: extend and resubmit (CICD-68)', () => {
  const ROWS = [
    { id: 's1', name: 'Ann Archer', team: 'Alpha', team_id: 't1', completed: false },
    { id: 's2', name: 'Ben Baker', team: 'Alpha', team_id: 't1', completed: true },
    { id: 's3', name: 'Cy Cole', team: 'No Team', team_id: null, completed: false },
  ];

  test('the extend dialog offers the unfinished students and the teams from the status', async () => {
    statusBody = { ...SENT, students: ROWS };
    const view = await opened();
    act(() => view.result.current.evaluationStatusDialog.onExtend());
    const dialog = view.result.current.extendDialog;
    expect(dialog.open).toBe(true);
    expect(dialog.students).toEqual([{ id: 's1', name: 'Ann Archer' }, { id: 's3', name: 'Cy Cole' }]);
    expect(dialog.teams).toEqual([{ id: 't1', name: 'Alpha' }]);
  });

  test('confirming posts the scope and the deadline, says who was extended, and refreshes the status', async () => {
    api.post.mockResolvedValue({ data: { message: 'Deadline extended.', extended: ['Ann Archer'], failed: [], skipped: { submitted: 1, not_invited: 0, changed: 0 } } });
    const view = await opened();
    act(() => view.result.current.evaluationStatusDialog.onExtend());
    api.get.mockClear();
    await act(() => view.result.current.extendDialog.onConfirm({ scope: 'student', student_id: 's1', localValue: CHOSEN }));
    expect(api.post).toHaveBeenCalledWith('/courses/c1/evaluations/extend', expect.objectContaining({
      scope: 'student', student_id: 's1', deadline: new Date(CHOSEN).toISOString(), deadline_zone: expect.any(String),
    }));
    expect(setAlert).toHaveBeenCalledWith({ severity: 'success', message: 'Deadline extended for Ann Archer. 1 already submitted.' });
    expect(api.get).toHaveBeenCalledWith('/courses/c1/evaluations/status');
    expect(view.result.current.extendDialog.open).toBe(false);
  });

  test('a refused extension shows the server\'s reason', async () => {
    api.post.mockRejectedValue({ response: { data: { error: { message: 'Choose the student to extend.' } } } });
    const view = await opened();
    act(() => view.result.current.evaluationStatusDialog.onExtend());
    await act(() => view.result.current.extendDialog.onConfirm({ scope: 'student', localValue: CHOSEN }));
    expect(setAlert).toHaveBeenCalledWith({ severity: 'error', message: 'Choose the student to extend.' });
  });

  test('Allow resubmission asks for a deadline for that student, then posts it and refreshes the status', async () => {
    api.post.mockResolvedValue({ data: { message: 'Ann Archer can submit again until the new deadline.' } });
    const view = await opened();
    act(() => view.result.current.evaluationStatusDialog.onAllowResubmission({ id: 's1', name: 'Ann Archer' }));
    expect(view.result.current.resubmitDialog.open).toBe(true);
    expect(view.result.current.resubmitDialog.title).toMatch(/Ann Archer/);
    api.get.mockClear();
    await act(() => view.result.current.resubmitDialog.onConfirm(CHOSEN));
    expect(api.post).toHaveBeenCalledWith('/courses/c1/students/s1/evaluations/resubmit', expect.objectContaining({ deadline: new Date(CHOSEN).toISOString() }));
    expect(setAlert).toHaveBeenCalledWith({ severity: 'success', message: 'Ann Archer can submit again until the new deadline.' });
    expect(api.get).toHaveBeenCalledWith('/courses/c1/evaluations/status');
    expect(view.result.current.resubmitDialog.open).toBe(false);
  });

  test('a refused resubmission shows the server\'s reason, and cancelling sends nothing', async () => {
    api.post.mockRejectedValue({ response: { data: { error: { message: 'This student has not submitted yet; send or extend instead.' } } } });
    const view = await opened();
    act(() => view.result.current.evaluationStatusDialog.onAllowResubmission({ id: 's1', name: 'Ann Archer' }));
    await act(() => view.result.current.resubmitDialog.onConfirm(CHOSEN));
    expect(setAlert).toHaveBeenCalledWith({ severity: 'error', message: 'This student has not submitted yet; send or extend instead.' });
    api.post.mockClear();
    act(() => view.result.current.evaluationStatusDialog.onAllowResubmission({ id: 's1', name: 'Ann Archer' }));
    act(() => view.result.current.resubmitDialog.onClose());
    expect(view.result.current.resubmitDialog.open).toBe(false);
    expect(api.post).not.toHaveBeenCalled();
  });
});
