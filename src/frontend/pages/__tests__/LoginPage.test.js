import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import axios from 'axios';
import LoginPage from '../LoginPage';
import { AuthProvider } from '../../contexts/AuthContext';

jest.mock('axios');

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
