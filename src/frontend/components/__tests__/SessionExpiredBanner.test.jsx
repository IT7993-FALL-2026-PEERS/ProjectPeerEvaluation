import React from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider } from '../../contexts/AuthContext';
import { notifySessionExpired } from '../../services/sessionExpired';
import SessionExpiredBanner from '../SessionExpiredBanner';

// When the login token expires the page behind the banner keeps failing ("Failed to fetch courses").
// The banner says why and offers the way back, instead of leaving the professor guessing.
const MESSAGE = 'Session timed out. Please log-in again!';

function renderApp() {
  return render(
    <MemoryRouter initialEntries={['/course-management']}>
      <AuthProvider>
        <SessionExpiredBanner />
        <Routes>
          <Route path="/" element={<div>Login page</div>} />
          <Route path="/course-management" element={<div>Course dashboard</div>} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>
  );
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
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

  test('Log in clears the stored login, goes to the login page and removes the message', async () => {
    const user = userEvent.setup({ delay: null });
    localStorage.setItem('peer_eval_token', 'old-token');
    localStorage.setItem('user', JSON.stringify({ name: 'Ada' }));
    sessionStorage.setItem('peer_eval_session', 'old-session');
    renderApp();
    act(() => { notifySessionExpired(); });

    await user.click(screen.getByRole('button', { name: /log in/i }));

    expect(screen.getByText('Login page')).toBeInTheDocument();
    // the banner fades out first, so it is gone a moment later, not at once
    await waitFor(() => expect(screen.queryByText(MESSAGE)).not.toBeInTheDocument());
    expect(localStorage.getItem('peer_eval_token')).toBeNull();
    expect(localStorage.getItem('user')).toBeNull();
    expect(sessionStorage.getItem('peer_eval_session')).toBeNull();
  });
});
