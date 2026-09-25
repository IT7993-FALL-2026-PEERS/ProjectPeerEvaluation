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

  test('the root path still opens the login page', () => {
    renderAt('/');
    expect(screen.getByRole('heading', { name: 'Professor Login' })).toBeInTheDocument();
  });
});
