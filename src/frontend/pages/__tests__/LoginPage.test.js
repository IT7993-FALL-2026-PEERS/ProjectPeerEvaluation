import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import axios from 'axios';
import LoginPage from '../LoginPage';
import { AuthProvider } from '../../contexts/AuthContext';

jest.mock('axios');

function renderLoginPage() {
  render(
    <AuthProvider>
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>
    </AuthProvider>
  );
}

describe('LoginPage show/hide password', () => {
  afterEach(() => jest.clearAllMocks());

  test('the password is hidden until "Show password" is clicked, then can be hidden again', async () => {
    renderLoginPage();
    const field = screen.getByLabelText('Password:');
    expect(field).toHaveAttribute('type', 'password');

    await userEvent.click(screen.getByRole('button', { name: 'Show password' }));
    expect(field).toHaveAttribute('type', 'text');

    await userEvent.click(screen.getByRole('button', { name: 'Hide password' }));
    expect(field).toHaveAttribute('type', 'password');
  });

  test('toggling the password does not submit the form', async () => {
    renderLoginPage();
    await userEvent.type(screen.getByLabelText('Email:'), 'prof@example.com');
    await userEvent.type(screen.getByLabelText('Password:'), 'secret-123');

    await userEvent.click(screen.getByRole('button', { name: 'Show password' }));

    expect(axios.post).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Password:')).toHaveValue('secret-123');
  });
});

describe('LoginPage errors', () => {
  afterEach(() => jest.clearAllMocks());

  // The backend's error handler nests the message: { error: { code, message } }.
  test('shows the message the backend sent', async () => {
    axios.post.mockRejectedValue({
      response: { status: 401, data: { error: { code: 'AUTH_ERROR', message: 'Invalid email or password.' } } },
    });
    render(
      <AuthProvider>
        <MemoryRouter>
          <LoginPage />
        </MemoryRouter>
      </AuthProvider>
    );

    await userEvent.type(screen.getByLabelText('Email:'), 'prof@example.com');
    await userEvent.type(screen.getByLabelText('Password:'), 'wrong-password');
    await userEvent.click(screen.getByRole('button', { name: 'Login' }));

    expect(await screen.findByText('Invalid email or password.')).toBeInTheDocument();
  });
});
