// Unit tests for AuthContext: the login()/logout() state transitions and
// the localStorage <-> currentUser sync, in isolation from any page.
import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AuthProvider, useAuth } from '../../contexts/AuthContext';

function Consumer() {
  const { currentUser, login, logout } = useAuth();
  return (
    <div>
      <span data-testid="user">{currentUser ? currentUser.name : 'none'}</span>
      <button onClick={() => login({ name: 'Ada Lovelace' })}>login</button>
      <button onClick={logout}>logout</button>
    </div>
  );
}

function renderConsumer() {
  return render(
    <AuthProvider>
      <Consumer />
    </AuthProvider>
  );
}

beforeEach(() => {
  localStorage.clear();
});

test('starts with no user when localStorage is empty', () => {
  renderConsumer();
  expect(screen.getByTestId('user')).toHaveTextContent('none');
});

test('reads an already-logged-in user from localStorage on mount', () => {
  localStorage.setItem('user', JSON.stringify({ name: 'Grace Hopper' }));
  renderConsumer();
  expect(screen.getByTestId('user')).toHaveTextContent('Grace Hopper');
});

test('login updates state and persists the user to localStorage', async () => {
  const user = userEvent.setup();
  renderConsumer();

  await user.click(screen.getByText('login'));

  expect(screen.getByTestId('user')).toHaveTextContent('Ada Lovelace');
  expect(JSON.parse(localStorage.getItem('user'))).toEqual({ name: 'Ada Lovelace' });
});

test('logout clears both state and localStorage', async () => {
  const user = userEvent.setup();
  renderConsumer();

  await user.click(screen.getByText('login'));
  await user.click(screen.getByText('logout'));

  expect(screen.getByTestId('user')).toHaveTextContent('none');
  expect(localStorage.getItem('user')).toBeNull();
});
