// Integration test: LoginPage + AuthContext + react-router working
// together, driven through the real form like a user would. axios is
// mocked at the network boundary; everything above it (LoginPage's submit
// handler, AuthContext's login(), the redirect to /course-management) is
// real. CourseManagement itself is huge and unrelated to auth, so the
// target route renders a small stub instead of the real page.
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HashRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider, useAuth } from '../../contexts/AuthContext';
import LoginPage from '../../pages/LoginPage';

// A factory-based mock: unlike bare jest.mock('axios'), this never loads
// the real axios package, which is an ESM-only build that Jest 27 (bundled
// by react-scripts) can't parse (see package.json's jest.moduleNameMapper
// for the same problem with react-router).
jest.mock('axios', () => ({ post: jest.fn() }));
import axios from 'axios';

function CourseManagementStub() {
  const { currentUser } = useAuth();
  return <div>Welcome, {currentUser?.name}</div>;
}

function TestApp() {
  return (
    <AuthProvider>
      <HashRouter>
        <Routes>
          <Route path="/" element={<LoginPage />} />
          <Route path="/course-management" element={<CourseManagementStub />} />
        </Routes>
      </HashRouter>
    </AuthProvider>
  );
}

beforeEach(() => {
  window.location.hash = '#/';
  localStorage.clear();
  axios.post.mockReset();
});

test('logging in stores the token, updates auth state, and navigates to course management', async () => {
  axios.post.mockResolvedValueOnce({
    data: { access_token: 'jwt-abc', professor: { name: 'Dr. Ada' } },
  });
  const user = userEvent.setup();
  render(<TestApp />);

  await user.type(screen.getByLabelText('Email:'), 'ada@example.com');
  await user.type(screen.getByLabelText('Password:'), 'secret123');
  await user.click(screen.getByRole('button', { name: 'Login' }));

  await waitFor(() => expect(screen.getByText('Welcome, Dr. Ada')).toBeInTheDocument());
  expect(localStorage.getItem('peer_eval_token')).toBe('jwt-abc');
  expect(axios.post).toHaveBeenCalledWith(
    expect.stringContaining('/auth/login'),
    { email: 'ada@example.com', password: 'secret123' }
  );
});

test('shows the backend error message and does not navigate when login fails', async () => {
  axios.post.mockRejectedValueOnce({ response: { data: { message: 'Invalid credentials' } } });
  const user = userEvent.setup();
  render(<TestApp />);

  await user.type(screen.getByLabelText('Email:'), 'ada@example.com');
  await user.type(screen.getByLabelText('Password:'), 'wrong-password');
  await user.click(screen.getByRole('button', { name: 'Login' }));

  expect(await screen.findByText('Invalid credentials')).toBeInTheDocument();
  expect(localStorage.getItem('peer_eval_token')).toBeNull();
  expect(screen.getByRole('heading', { name: 'Professor Login' })).toBeInTheDocument();
});

test('switching to registration posts to /auth/register with the extra fields', async () => {
  axios.post.mockResolvedValueOnce({ data: {} });
  window.alert = jest.fn();
  const user = userEvent.setup();
  render(<TestApp />);

  await user.click(screen.getByText('New here? Register'));
  await user.type(screen.getByPlaceholderText('Full Name'), 'Dr. Ada');
  await user.type(screen.getByPlaceholderText('Department'), 'Computer Science');
  await user.type(screen.getByLabelText('Email:'), 'ada@example.com');
  await user.type(screen.getByLabelText('Password:'), 'secret123');
  await user.click(screen.getByRole('button', { name: 'Register' }));

  await waitFor(() => expect(axios.post).toHaveBeenCalledWith(
    expect.stringContaining('/auth/register'),
    { email: 'ada@example.com', password: 'secret123', name: 'Dr. Ada', department: 'Computer Science' }
  ));
  expect(window.alert).toHaveBeenCalledWith('Registration successful! You can now log in.');
});
