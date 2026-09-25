import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import axios from 'axios';
import ResetPassword from '../ResetPassword';

jest.mock('axios');

function renderResetPage() {
  render(
    <MemoryRouter initialEntries={['/reset-password/abc123']}>
      <Routes>
        <Route path="/reset-password/:token" element={<ResetPassword />} />
        <Route path="/" element={<h1>Login page</h1>} />
      </Routes>
    </MemoryRouter>
  );
}

async function submitNewPassword() {
  await userEvent.type(screen.getByPlaceholderText('New Password'), 'new-password-123');
  await userEvent.type(screen.getByPlaceholderText('Confirm New Password'), 'new-password-123');
  await userEvent.click(screen.getByRole('button', { name: 'Update Password' }));
}

describe('ResetPassword', () => {
  afterEach(() => jest.clearAllMocks());

  test('one button shows and hides both password fields without submitting', async () => {
    renderResetPage();
    const fields = [screen.getByPlaceholderText('New Password'), screen.getByPlaceholderText('Confirm New Password')];
    fields.forEach((field) => expect(field).toHaveAttribute('type', 'password'));

    await userEvent.click(screen.getByRole('button', { name: 'Show passwords' }));
    fields.forEach((field) => expect(field).toHaveAttribute('type', 'text'));
    expect(axios.post).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: 'Hide passwords' }));
    fields.forEach((field) => expect(field).toHaveAttribute('type', 'password'));
  });

  // The backend answers 200 { message: 'Password updated successfully.' } with no
  // `success` field.
  test('returns to the login page after a successful reset', async () => {
    axios.post.mockResolvedValue({ status: 200, data: { message: 'Password updated successfully.' } });
    renderResetPage();

    await submitNewPassword();

    expect(await screen.findByRole('heading', { name: 'Login page' }, { timeout: 3000 })).toBeInTheDocument();
  });

  test('shows the message the backend sent when the reset fails', async () => {
    axios.post.mockRejectedValue({
      response: { status: 400, data: { error: { code: 'TOKEN_ERROR', message: 'Invalid or expired token.' } } },
    });
    renderResetPage();

    await submitNewPassword();

    expect(await screen.findByText('Invalid or expired token.')).toBeInTheDocument();
  });
});
