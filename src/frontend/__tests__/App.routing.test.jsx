import React from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import api from '../services/api';
import { notifySessionExpired } from '../services/sessionExpired';
import App from '../App';
import { AuthProvider } from '../contexts/AuthContext';

// Emails link to plain paths like /reset-password/<token> and /evaluate/<token>
// (no "#"), and render.yaml rewrites every path to index.html. The router has to
// read the real path, or these links all land on the login page.
function renderAt(path) {
  window.history.pushState({}, '', path);
  return render(
    <AuthProvider>
      <App />
    </AuthProvider>
  );
}

describe('App routing for emailed links', () => {
  afterEach(() => window.history.pushState({}, '', '/'));

  test('a password reset link opens the reset page', () => {
    renderAt('/reset-password/abc123');
    expect(screen.getByRole('heading', { name: 'Reset Your Password' })).toBeInTheDocument();
  });

  // FR-04: the inactivity warning is part of the app, on every page, not only where it was tested alone.
  test('a professor whose login is about to run out is asked whether to stay logged in', async () => {
    const encode = (value) => btoa(JSON.stringify(value)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const now = Math.floor(Date.now() / 1000);
    localStorage.setItem('peer_eval_token', `${encode({ alg: 'HS256' })}.${encode({ iat: now - 3500, exp: now + 60 })}.sig`);
    renderAt('/');
    expect(await screen.findByText('Your session is about to expire', {}, { timeout: 3000 })).toBeInTheDocument();
    localStorage.clear();
  });

  test('an email confirmation link opens the confirmation page', () => {
    renderAt('/verify-email/abc123');
    expect(screen.getByRole('heading', { name: 'Confirm Your Email' })).toBeInTheDocument();
  });

  test('the root path still opens the login page', () => {
    renderAt('/');
    expect(screen.getByRole('heading', { name: 'Professor Login' })).toBeInTheDocument();
  });

  // Anyone with the link used to get the dashboard shell (with failing API calls)
  // instead of the login page.
  test.each(['/course-management', '/reports', '/settings'])(
    'a logged-out visit to %s goes to the login page',
    (path) => {
      localStorage.clear();
      sessionStorage.clear();
      renderAt(path);
      expect(screen.getByRole('heading', { name: 'Professor Login' })).toBeInTheDocument();
    }
  );
});

// CICD-76: a visitor who comes back with a login that ran out used to meet 'Session timed out. Log in again to keep
// your work.' and a 'Log in again' dialog on the login page, the reset page and the confirmation page, where there is
// no work to keep.
describe('a login that has run out, on the pages a visitor can open', () => {
  const MESSAGE = 'Session timed out. Log in again to keep your work.';
  const encode = (value) => btoa(JSON.stringify(value)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const storeExpiredLogin = () => {
    const now = Math.floor(Date.now() / 1000);
    localStorage.setItem('peer_eval_token', `${encode({ alg: 'HS256' })}.${encode({ id: 'p1', iat: now - 7200, exp: now - 3600 })}.sig`);
    localStorage.setItem('user', JSON.stringify({ id: 'p1', email: 'ada@ksu.edu', name: 'Ada' }));
  };
  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    sessionStorage.clear();
    window.history.pushState({}, '', '/');
  });

  test('the login page forgets it, once the server refuses it, and shows a clean form', async () => {
    vi.spyOn(api, 'post').mockRejectedValue({ response: { status: 401 } });
    storeExpiredLogin();
    renderAt('/');
    await waitFor(() => expect(localStorage.getItem('peer_eval_token')).toBeNull());
    expect(localStorage.getItem('user')).toBeNull();
    act(() => { notifySessionExpired(); });
    expect(screen.queryByText(MESSAGE)).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Professor Login' })).toBeInTheDocument();
  });

  test.each(['/reset-password/abc123', '/verify-email/abc123'])('%s shows no timed-out message', (path) => {
    storeExpiredLogin();
    renderAt(path);
    act(() => { notifySessionExpired(); });
    expect(screen.queryByText(MESSAGE)).not.toBeInTheDocument();
  });

  // The browser's clock can be ahead of the server's: a login that only looks expired may be in use in another tab.
  test('the login page keeps a login that only looks expired when the server still accepts it', async () => {
    const post = vi.spyOn(api, 'post').mockResolvedValue({ data: {} });
    storeExpiredLogin();
    renderAt('/');
    await waitFor(() => expect(post).toHaveBeenCalledWith('/auth/refresh', {}));
    await screen.findByRole('heading', { name: 'Professor Login' });
    expect(localStorage.getItem('peer_eval_token')).not.toBeNull();
    expect(localStorage.getItem('user')).not.toBeNull();
  });

  test('a refusal that comes after another tab logged in again leaves the new login alone', async () => {
    let refuse;
    vi.spyOn(api, 'post').mockReturnValue(new Promise((resolve, reject) => { refuse = reject; }));
    storeExpiredLogin();
    renderAt('/');
    await waitFor(() => expect(api.post).toHaveBeenCalled());
    localStorage.setItem('peer_eval_token', 'a-newer-login');
    await act(async () => { refuse({ response: { status: 401 } }); });
    expect(localStorage.getItem('peer_eval_token')).toBe('a-newer-login');
  });

  test('the login page keeps a login that is still good', async () => {
    const now = Math.floor(Date.now() / 1000);
    localStorage.setItem('peer_eval_token', `${encode({ alg: 'HS256' })}.${encode({ id: 'p1', iat: now - 600, exp: now + 3000 })}.sig`);
    localStorage.setItem('user', JSON.stringify({ id: 'p1', email: 'ada@ksu.edu', name: 'Ada' }));
    renderAt('/');
    await screen.findByRole('heading', { name: 'Professor Login' });
    expect(localStorage.getItem('peer_eval_token')).not.toBeNull();
    expect(localStorage.getItem('user')).not.toBeNull();
  });
});
