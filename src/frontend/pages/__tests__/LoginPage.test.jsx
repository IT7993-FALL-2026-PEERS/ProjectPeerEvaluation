import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
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

  test('falls back to a plain message when the server gives none, and reads the older message shape', async () => {
    axios.post.mockRejectedValueOnce(new Error('network down'));
    renderLoginPage();
    await userEvent.type(screen.getByLabelText('Email:'), 'prof@example.com');
    await userEvent.type(screen.getByLabelText('Password:'), 'secret-123');
    await userEvent.click(screen.getByRole('button', { name: 'Login' }));
    expect(await screen.findByText('Something went wrong')).toBeInTheDocument();

    axios.post.mockRejectedValueOnce({ response: { data: { message: 'Account locked.' } } });
    await userEvent.click(screen.getByRole('button', { name: 'Login' }));
    expect(await screen.findByText('Account locked.')).toBeInTheDocument();
  });
});

// The whole sign-in page as the professor uses it: the login form, registration and the reset dialog.
function renderApp() {
  render(
    <AuthProvider>
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/" element={<LoginPage />} />
          <Route path="/course-management" element={<h1>Course list</h1>} />
        </Routes>
      </MemoryRouter>
    </AuthProvider>
  );
}

const fillLogin = async (email = 'prof@example.com', password = 'secret-123') => {
  await userEvent.type(screen.getByLabelText('Email:'), email);
  await userEvent.type(screen.getByLabelText('Password:'), password);
};

describe('LoginPage sign in', () => {
  afterEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
  });

  test('a good login stores the token and the professor, and opens the course list', async () => {
    axios.post.mockResolvedValue({ data: { access_token: 'jwt-abc', professor: { id: 'p1', name: 'Ada Lovelace' } } });
    renderApp();
    await fillLogin();
    await userEvent.click(screen.getByRole('button', { name: 'Login' }));

    expect(await screen.findByRole('heading', { name: 'Course list' })).toBeInTheDocument();
    expect(axios.post).toHaveBeenCalledWith('http://localhost:5000/api/auth/login', { email: 'prof@example.com', password: 'secret-123' });
    expect(localStorage.getItem('peer_eval_token')).toBe('jwt-abc');
    expect(JSON.parse(localStorage.getItem('user'))).toEqual({ id: 'p1', name: 'Ada Lovelace' });
  });

  test('a response without a token does not store one', async () => {
    axios.post.mockResolvedValue({ data: { professor: { id: 'p1' } } });
    renderApp();
    await fillLogin();
    await userEvent.click(screen.getByRole('button', { name: 'Login' }));

    expect(await screen.findByRole('heading', { name: 'Course list' })).toBeInTheDocument();
    expect(localStorage.getItem('peer_eval_token')).toBeNull();
  });

  test('a failed login stays on the page and stores nothing', async () => {
    axios.post.mockRejectedValue({ response: { data: { error: { message: 'Invalid email or password.' } } } });
    renderApp();
    await fillLogin();
    await userEvent.click(screen.getByRole('button', { name: 'Login' }));

    expect(await screen.findByText('Invalid email or password.')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Professor Login' })).toBeInTheDocument();
    expect(localStorage.getItem('peer_eval_token')).toBeNull();
  });
});

describe('LoginPage registration', () => {
  beforeEach(() => {
    window.alert = jest.fn();
  });
  afterEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
  });

  test('switching to registration asks for a name and department and clears what was typed', async () => {
    renderApp();
    await fillLogin();
    await userEvent.click(screen.getByRole('button', { name: 'New here? Register' }));

    expect(screen.getByRole('heading', { name: 'Professor Registration' })).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Full Name')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Department')).toBeInTheDocument();
    expect(screen.getByLabelText('Email:')).toHaveValue('');
    expect(screen.getByLabelText('Password:')).toHaveValue('');
    expect(screen.queryByRole('button', { name: 'Forgot Password?' })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Already have an account? Log in' }));
    expect(screen.getByRole('heading', { name: 'Professor Login' })).toBeInTheDocument();
    expect(screen.queryByPlaceholderText('Full Name')).not.toBeInTheDocument();
  });

  test('registering sends all four fields, says it worked, and returns to the login form', async () => {
    axios.post.mockResolvedValue({ data: { message: 'Professor registered successfully.' } });
    renderApp();
    await userEvent.click(screen.getByRole('button', { name: 'New here? Register' }));
    await userEvent.type(screen.getByPlaceholderText('Full Name'), 'Grace Hopper');
    await userEvent.type(screen.getByPlaceholderText('Department'), 'Computer Science');
    await fillLogin('grace@example.com', 'a-long-password');
    await userEvent.click(screen.getByRole('button', { name: 'Register' }));

    expect(await screen.findByRole('heading', { name: 'Professor Login' })).toBeInTheDocument();
    expect(axios.post).toHaveBeenCalledWith('http://localhost:5000/api/auth/register', {
      email: 'grace@example.com', password: 'a-long-password', name: 'Grace Hopper', department: 'Computer Science',
    });
    expect(window.alert).toHaveBeenCalledWith('Registration successful! You can now log in.');
    expect(localStorage.getItem('peer_eval_token')).toBeNull();
  });

  test('shows why a registration was refused and stays on the registration form', async () => {
    axios.post.mockRejectedValue({ response: { data: { error: { message: 'An account with this email already exists.' } } } });
    renderApp();
    await userEvent.click(screen.getByRole('button', { name: 'New here? Register' }));
    await userEvent.type(screen.getByPlaceholderText('Full Name'), 'Grace Hopper');
    await userEvent.type(screen.getByPlaceholderText('Department'), 'Computer Science');
    await fillLogin('grace@example.com', 'a-long-password');
    await userEvent.click(screen.getByRole('button', { name: 'Register' }));

    expect(await screen.findByText('An account with this email already exists.')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Professor Registration' })).toBeInTheDocument();
    expect(window.alert).not.toHaveBeenCalled();
  });
});

describe('LoginPage password reset', () => {
  afterEach(() => jest.clearAllMocks());

  async function openDialog() {
    renderApp();
    await userEvent.click(screen.getByRole('button', { name: 'Forgot Password?' }));
    return screen.getByPlaceholderText('Enter your email');
  }

  test('sends the reset link request and shows the same message whether or not the email exists', async () => {
    axios.post.mockResolvedValue({ data: {} });
    const field = await openDialog();
    await userEvent.type(field, 'prof@example.com');
    await userEvent.click(screen.getByRole('button', { name: 'Send Reset Link' }));

    const message = await screen.findByText('If your email is registered, you will receive password reset instructions.');
    expect(message).toHaveStyle({ color: 'green' });
    expect(axios.post).toHaveBeenCalledWith('http://localhost:5000/api/auth/reset-password', { email: 'prof@example.com' });
  });

  test('says so when the request fails', async () => {
    axios.post.mockRejectedValue(new Error('down'));
    const field = await openDialog();
    await userEvent.type(field, 'prof@example.com');
    await userEvent.click(screen.getByRole('button', { name: 'Send Reset Link' }));

    expect(await screen.findByText('Failed to send reset instructions.')).toHaveStyle({ color: 'red' });
  });

  test('refuses an empty email without sending anything', async () => {
    const field = await openDialog();
    // The field is required, so the browser would stop an empty form; submit it directly to reach the page's own check.
    fireEvent.submit(field);

    expect(await screen.findByText('Please enter your email.')).toBeInTheDocument();
    expect(axios.post).not.toHaveBeenCalled();
  });

  test('Cancel closes the dialog', async () => {
    await openDialog();
    expect(screen.getByRole('heading', { name: 'Reset Password' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('heading', { name: 'Reset Password' })).not.toBeInTheDocument();
  });
});
