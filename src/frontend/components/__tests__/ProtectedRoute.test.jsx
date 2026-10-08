import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import ProtectedRoute from '../ProtectedRoute';

function renderDashboard() {
  return render(
    <MemoryRouter initialEntries={['/course-management']}>
      <Routes>
        <Route path="/" element={<h1>Login page</h1>} />
        <Route
          path="/course-management"
          element={
            <ProtectedRoute>
              <div>Secret Dashboard</div>
            </ProtectedRoute>
          }
        />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

describe('ProtectedRoute', () => {
  it('sends a visitor without a login token to the login page', () => {
    renderDashboard();

    expect(screen.getByRole('heading', { name: 'Login page' })).toBeInTheDocument();
    expect(screen.queryByText('Secret Dashboard')).not.toBeInTheDocument();
  });

  it('shows the page to a professor with a login token', () => {
    localStorage.setItem('peer_eval_token', 'jwt-abc');
    renderDashboard();

    expect(screen.getByText('Secret Dashboard')).toBeInTheDocument();
  });

  it('accepts a session-only login token too', () => {
    sessionStorage.setItem('peer_eval_session', 'jwt-abc');
    renderDashboard();

    expect(screen.getByText('Secret Dashboard')).toBeInTheDocument();
  });
});
