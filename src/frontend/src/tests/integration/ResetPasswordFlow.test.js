// Integration test: the real App + react-router deliver the :token route
// param into ResetPassword, whose client-side validation and submit
// handler run for real. Only axios is mocked.
import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../../App';
import { AuthProvider } from '../../contexts/AuthContext';

// Factory-based, not bare jest.mock('axios') -- see LoginFlow.test.js.
// Also needs .create(): App -> CourseManagement -> services/api.js calls
// axios.create() at module load time, even though this test never uses it.
jest.mock('axios', () => ({
  post: jest.fn(),
  create: jest.fn(() => ({
    get: jest.fn(),
    post: jest.fn(),
    interceptors: { request: { use: jest.fn() }, response: { use: jest.fn() } },
  })),
}));
import axios from 'axios';

function renderAt(hash) {
  window.location.hash = hash;
  return render(
    <AuthProvider>
      <App />
    </AuthProvider>
  );
}

beforeEach(() => {
  axios.post.mockReset();
});

test('a matching new password is submitted with the token taken from the URL', async () => {
  axios.post.mockResolvedValueOnce({ data: { success: true } });
  const user = userEvent.setup();
  renderAt('#/reset-password/reset-token-xyz');

  const [newPassword, confirmPassword] = screen.getAllByPlaceholderText(/password/i);
  await user.type(newPassword, 'NewPass123');
  await user.type(confirmPassword, 'NewPass123');
  await user.click(screen.getByRole('button', { name: 'Update Password' }));

  expect(await screen.findByText(/Password updated successfully/)).toBeInTheDocument();
  expect(axios.post).toHaveBeenCalledWith(
    expect.stringContaining('/auth/update-password'),
    { token: 'reset-token-xyz', password: 'NewPass123' }
  );
});

test('mismatched passwords are rejected client-side, without calling the API', async () => {
  const user = userEvent.setup();
  renderAt('#/reset-password/reset-token-xyz');

  const [newPassword, confirmPassword] = screen.getAllByPlaceholderText(/password/i);
  await user.type(newPassword, 'NewPass123');
  await user.type(confirmPassword, 'DifferentPass123');
  await user.click(screen.getByRole('button', { name: 'Update Password' }));

  expect(screen.getByText('Passwords do not match.')).toBeInTheDocument();
  expect(axios.post).not.toHaveBeenCalled();
});

test('a backend failure surfaces as an error, not a success, message', async () => {
  axios.post.mockRejectedValueOnce(new Error('network down'));
  const user = userEvent.setup();
  renderAt('#/reset-password/reset-token-xyz');

  const [newPassword, confirmPassword] = screen.getAllByPlaceholderText(/password/i);
  await user.type(newPassword, 'NewPass123');
  await user.type(confirmPassword, 'NewPass123');
  await user.click(screen.getByRole('button', { name: 'Update Password' }));

  expect(await screen.findByText('Failed to update password.')).toBeInTheDocument();
});
