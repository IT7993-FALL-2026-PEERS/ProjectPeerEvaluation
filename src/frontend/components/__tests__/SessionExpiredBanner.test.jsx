import React from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider } from '../../contexts/AuthContext';
import { notifySessionExpired } from '../../services/sessionExpired';
import { Dialog } from '@mui/material';
import { logInAgain, WRONG_ACCOUNT, MFA_REQUIRED, LOGIN_CHANGED } from '../../services/sessionLogin';
import SessionExpiredBanner from '../SessionExpiredBanner';

vi.mock('../../services/sessionLogin', async (importActual) => ({
  ...(await importActual()),
  logInAgain: vi.fn(),
}));

// When the login token expires the page behind the banner keeps failing ("Failed to fetch courses").
// The banner says why, and a dialog logs the same professor in again on that page, so what was being typed
// is not lost.
const MESSAGE = 'Session timed out. Log in again to keep your work.';
const PROFESSOR = { id: 'p1', email: 'ada@ksu.edu', name: 'Ada' };

// A token with the given expiry (seconds). Nothing reads the signature in the browser.
const tokenWith = (exp, id = 'p1') => `h.${btoa(JSON.stringify({ id, iat: exp - 3600, exp }))}.s`;
const seedLogin = (token = tokenWith(Math.floor(Date.now() / 1000) - 60)) => {
  localStorage.setItem('peer_eval_token', token);
  localStorage.setItem('user', JSON.stringify(PROFESSOR));
};
const openDialog = async (user) => {
  act(() => { notifySessionExpired(); });
  await user.click(screen.getByRole('button', { name: /^log in$/i }));
};

function renderApp({ formOpen = false } = {}) {
  return render(
    <MemoryRouter initialEntries={['/course-management']}>
      <AuthProvider>
        <SessionExpiredBanner />
        <Routes>
          <Route path="/" element={<div>Login page</div>} />
          <Route path="/course-management" element={<div>Course dashboard<Dialog open={formOpen}><div>Half-filled form</div></Dialog></div>} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>
  );
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  logInAgain.mockReset();
});

describe('SessionExpiredBanner', () => {
  test('shows nothing while the session is fine', () => {
    renderApp();
    expect(screen.queryByText(MESSAGE)).not.toBeInTheDocument();
    expect(screen.getByText('Course dashboard')).toBeInTheDocument();
  });

  test('says the session timed out, and offers a Log in button, when the session expires', () => {
    renderApp();
    act(() => { notifySessionExpired(); });
    expect(screen.getByText(MESSAGE)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /log in/i })).toBeInTheDocument();
    // the page behind it is left as it was
    expect(screen.getByText('Course dashboard')).toBeInTheDocument();
  });

  test('keeps showing it if more requests fail afterwards', () => {
    renderApp();
    act(() => { notifySessionExpired(); });
    act(() => { notifySessionExpired(); });
    expect(screen.getAllByText(MESSAGE)).toHaveLength(1);
  });

  test('Log in opens a dialog for the account that was logged in and does not leave the page', async () => {
    const user = userEvent.setup({ delay: null });
    const expired = tokenWith(Math.floor(Date.now() / 1000) - 60);
    seedLogin(expired);
    renderApp();
    await openDialog(user);
    expect(screen.getByRole('dialog', { name: /log in again/i })).toBeInTheDocument();
    expect(screen.getByText(/ada@ksu\.edu/)).toBeInTheDocument();
    expect(screen.getByText('Course dashboard')).toBeInTheDocument();
    expect(localStorage.getItem('peer_eval_token')).toBe(expired);
  });

  test('a right password closes the banner, keeps the page and stores the new login', async () => {
    const user = userEvent.setup({ delay: null });
    seedLogin();
    logInAgain.mockImplementation(async () => { localStorage.setItem('peer_eval_token', 'new-token'); return PROFESSOR; });
    renderApp();
    await openDialog(user);
    await user.type(screen.getByLabelText(/password/i), 'secret{Enter}');
    await waitFor(() => expect(screen.queryByText(MESSAGE)).not.toBeInTheDocument());
    expect(logInAgain).toHaveBeenCalledWith({ id: 'p1', email: 'ada@ksu.edu' }, 'secret', expect.any(Function));
    expect(screen.getByText('Course dashboard')).toBeInTheDocument();
    expect(localStorage.getItem('peer_eval_token')).toBe('new-token');
  });

  test.each([
    ['a wrong password', Object.assign(new Error('401'), { response: { status: 401, data: { error: { message: 'Invalid email or password.' } } } }), 'Invalid email or password.'],
    ['the login rate limit', Object.assign(new Error('429'), { response: { status: 429, data: { error: { message: 'Too many login attempts. Try again later.' } } } }), 'Too many login attempts. Try again later.'],
    ['a network error', new Error('Network Error'), 'Could not log in. Try again.'],
    ['another account', Object.assign(new Error('x'), { code: WRONG_ACCOUNT }), 'That login belongs to another account. Use the login page.'],
    ['an account with MFA', Object.assign(new Error('x'), { code: MFA_REQUIRED }), 'This account needs the full login page.'],
    ['a login changed in another tab', Object.assign(new Error('x'), { code: LOGIN_CHANGED }), 'Your login changed in another tab. Use the login page.'],
  ])('%s shows a message, keeps the dialog and the page, and empties the field', async (_name, failure, text) => {
    const user = userEvent.setup({ delay: null });
    seedLogin();
    const stored = localStorage.getItem('peer_eval_token');
    logInAgain.mockRejectedValue(failure);
    renderApp();
    await openDialog(user);
    await user.type(screen.getByLabelText(/password/i), 'bad{Enter}');
    expect(await screen.findByText(text)).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toHaveValue('');
    expect(screen.getByText('Course dashboard')).toBeInTheDocument();
    expect(localStorage.getItem('peer_eval_token')).toBe(stored);
  });

  test('Cancel closes the dialog, keeps the banner and empties the password field next time', async () => {
    const user = userEvent.setup({ delay: null });
    seedLogin();
    renderApp();
    await openDialog(user);
    await user.type(screen.getByLabelText(/password/i), 'half-typed');
    await user.click(screen.getByRole('button', { name: /cancel/i }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: /log in again/i })).not.toBeInTheDocument());
    expect(screen.getByText(MESSAGE)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /^log in$/i }));
    expect(screen.getByLabelText(/password/i)).toHaveValue('');
  });

  test('Use the login page logs out and goes to the login page', async () => {
    const user = userEvent.setup({ delay: null });
    seedLogin();
    sessionStorage.setItem('peer_eval_session', 'old-session');
    renderApp();
    await openDialog(user);
    await user.click(screen.getByRole('button', { name: /use the login page/i }));
    expect(screen.getByText('Login page')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText(MESSAGE)).not.toBeInTheDocument());
    expect(localStorage.getItem('peer_eval_token')).toBeNull();
    expect(localStorage.getItem('user')).toBeNull();
    expect(sessionStorage.getItem('peer_eval_session')).toBeNull();
  });

  test('with no stored user the Log in button goes straight to the login page', async () => {
    const user = userEvent.setup({ delay: null });
    localStorage.setItem('peer_eval_token', 'old-token');
    renderApp();
    act(() => { notifySessionExpired(); });
    await user.click(screen.getByRole('button', { name: /^log in$/i }));
    expect(screen.getByText('Login page')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText(MESSAGE)).not.toBeInTheDocument());
    expect(localStorage.getItem('peer_eval_token')).toBeNull();
  });

  test('a login stored by another tab closes the banner', async () => {
    seedLogin();
    renderApp();
    act(() => { notifySessionExpired(); });
    expect(screen.getByText(MESSAGE)).toBeInTheDocument();
    localStorage.setItem('peer_eval_token', tokenWith(Math.floor(Date.now() / 1000) + 3000));
    act(() => { window.dispatchEvent(new StorageEvent('storage', { key: 'peer_eval_token' })); });
    await waitFor(() => expect(screen.queryByText(MESSAGE)).not.toBeInTheDocument());
  });

  const deferred = () => {
    let resolve;
    let reject;
    const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
    return { promise, resolve, reject };
  };

  test('a login that finishes after Use the login page is dropped: the logout stands', async () => {
    const user = userEvent.setup({ delay: null });
    seedLogin();
    const pending = deferred();
    logInAgain.mockReturnValue(pending.promise);
    renderApp();
    await openDialog(user);
    await user.type(screen.getByLabelText(/password/i), 'secret{Enter}');
    await user.click(screen.getByRole('button', { name: /use the login page/i }));
    expect(screen.getByText('Login page')).toBeInTheDocument();
    // the service was told the attempt is no longer wanted
    expect(logInAgain.mock.calls[0][2]()).toBe(false);
    await act(async () => { pending.resolve(PROFESSOR); });
    expect(localStorage.getItem('user')).toBeNull();
    expect(screen.getByText('Login page')).toBeInTheDocument();
  });

  test('a login that finishes after Cancel is dropped, and the next attempt starts clean', async () => {
    const user = userEvent.setup({ delay: null });
    seedLogin();
    const stored = localStorage.getItem('user');
    const pending = deferred();
    logInAgain.mockReturnValueOnce(pending.promise);
    renderApp();
    await openDialog(user);
    await user.type(screen.getByLabelText(/password/i), 'secret{Enter}');
    await user.click(screen.getByRole('button', { name: /cancel/i }));
    await act(async () => { pending.resolve({ ...PROFESSOR, name: 'Changed' }); });
    expect(screen.getByText(MESSAGE)).toBeInTheDocument();
    expect(localStorage.getItem('user')).toBe(stored);

    let wantedWhileOut;
    logInAgain.mockImplementationOnce(async (_account, _password, wanted) => { wantedWhileOut = wanted(); return PROFESSOR; });
    await waitFor(() => expect(screen.queryByRole('dialog', { name: /log in again/i })).not.toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /^log in$/i }));
    await user.type(screen.getByLabelText(/password/i), 'again{Enter}');
    await waitFor(() => expect(screen.queryByText(MESSAGE)).not.toBeInTheDocument());
    expect(wantedWhileOut).toBe(true);
  });

  test('the password field is locked while a login is on its way, and empty if it fails', async () => {
    const user = userEvent.setup({ delay: null });
    seedLogin();
    const pending = deferred();
    logInAgain.mockReturnValue(pending.promise);
    renderApp();
    await openDialog(user);
    await user.type(screen.getByLabelText(/password/i), 'secret{Enter}');
    expect(screen.getByLabelText(/password/i)).toBeDisabled();
    await act(async () => { pending.reject(new Error('Network Error')); });
    expect(await screen.findByText('Could not log in. Try again.')).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeEnabled();
    expect(screen.getByLabelText(/password/i)).toHaveValue('');
  });

  test('with a form open, the banner is out of keyboard reach, so the log-in dialog opens above the form', async () => {
    seedLogin();
    renderApp({ formOpen: true });
    act(() => { notifySessionExpired(); });
    expect(await screen.findByRole('dialog', { name: /log in again/i })).toBeInTheDocument();
    expect(screen.getByText('Half-filled form')).toBeInTheDocument();
  });

  test('with no form open, the banner shows and no dialog opens until Log in is pressed', async () => {
    seedLogin();
    renderApp();
    act(() => { notifySessionExpired(); });
    expect(screen.getByText(MESSAGE)).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: /log in again/i })).not.toBeInTheDocument();
  });

  test('a login for another professor stored by another tab leaves the banner up', async () => {
    seedLogin();
    renderApp();
    act(() => { notifySessionExpired(); });
    localStorage.setItem('peer_eval_token', tokenWith(Math.floor(Date.now() / 1000) + 3000, 'p2'));
    act(() => { window.dispatchEvent(new StorageEvent('storage', { key: 'peer_eval_token' })); });
    // the banner fades out, so give it time to go before saying it did not; the page is still Ada's and must
    // not carry on as someone else
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 600)); });
    expect(screen.getByText(MESSAGE)).toBeInTheDocument();
  });

  test('a login stored by another tab closes the dialog too, and a half-typed password does not come back', async () => {
    const user = userEvent.setup({ delay: null });
    seedLogin();
    renderApp();
    await openDialog(user);
    await user.type(screen.getByLabelText(/password/i), 'half-typed');
    localStorage.setItem('peer_eval_token', tokenWith(Math.floor(Date.now() / 1000) + 3000));
    act(() => { window.dispatchEvent(new StorageEvent('storage', { key: 'peer_eval_token' })); });
    await waitFor(() => expect(screen.queryByRole('dialog', { name: /log in again/i })).not.toBeInTheDocument());
    localStorage.setItem('peer_eval_token', tokenWith(Math.floor(Date.now() / 1000) - 60));
    await openDialog(user);
    expect(screen.getByLabelText(/password/i)).toHaveValue('');
  });
});
