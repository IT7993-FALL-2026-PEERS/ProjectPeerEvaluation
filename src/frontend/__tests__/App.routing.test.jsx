import React from 'react';
import { render, screen } from '@testing-library/react';
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
