import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AuthProvider, useAuth } from '../AuthContext';

function Consumer() {
  const { currentUser, login, logout } = useAuth();
  return (
    <div>
      <div data-testid="user">{currentUser ? currentUser.name : 'none'}</div>
      <button onClick={() => login({ name: 'Khoa Ho', email: 'khoa@example.com' })}>Log in</button>
      <button onClick={logout}>Log out</button>
    </div>
  );
}

function renderWithProvider() {
  return render(
    <AuthProvider>
      <Consumer />
    </AuthProvider>
  );
}

beforeEach(() => {
  localStorage.clear();
});

describe('AuthContext', () => {
  it('starts with no current user when localStorage is empty', () => {
    renderWithProvider();
    expect(screen.getByTestId('user')).toHaveTextContent('none');
  });

  it('restores the current user from localStorage on mount', () => {
    localStorage.setItem('user', JSON.stringify({ name: 'Stored Prof' }));
    renderWithProvider();
    expect(screen.getByTestId('user')).toHaveTextContent('Stored Prof');
  });

  it('login() updates state and persists the user to localStorage', async () => {
    const user = userEvent.setup();
    renderWithProvider();

    await user.click(screen.getByText('Log in'));

    expect(screen.getByTestId('user')).toHaveTextContent('Khoa Ho');
    expect(JSON.parse(localStorage.getItem('user'))).toEqual({
      name: 'Khoa Ho',
      email: 'khoa@example.com',
    });
  });

  it('logout() clears state and removes the user from localStorage', async () => {
    const user = userEvent.setup();
    localStorage.setItem('user', JSON.stringify({ name: 'Khoa Ho' }));
    renderWithProvider();
    expect(screen.getByTestId('user')).toHaveTextContent('Khoa Ho');

    await user.click(screen.getByText('Log out'));

    expect(screen.getByTestId('user')).toHaveTextContent('none');
    expect(localStorage.getItem('user')).toBeNull();
  });

  // The token is what the backend accepts. Leaving it behind means the next person
  // on a shared computer is still signed in as the professor who logged out.
  it('logout() also removes the login token', async () => {
    const user = userEvent.setup();
    localStorage.setItem('peer_eval_token', 'jwt-abc');
    sessionStorage.setItem('peer_eval_session', 'jwt-abc');
    renderWithProvider();

    await user.click(screen.getByText('Log out'));

    expect(localStorage.getItem('peer_eval_token')).toBeNull();
    expect(sessionStorage.getItem('peer_eval_session')).toBeNull();
  });
});
