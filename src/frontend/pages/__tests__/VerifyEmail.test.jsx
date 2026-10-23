import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import axios from 'axios';
import VerifyEmail from '../VerifyEmail';

vi.mock('axios');

// CW-11: the page the confirmation email links to. Opening the link proves the professor owns the
// mailbox, so this is where they choose their password; until then the account has none.
function renderPage(path = '/verify-email/abc123') {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/verify-email/:token" element={<VerifyEmail />} />
        <Route path="/" element={<h1>Login page</h1>} />
      </Routes>
    </MemoryRouter>
  );
}

async function choosePassword(password = 'a-long-password', confirmation = password) {
  await userEvent.type(screen.getByPlaceholderText('Choose a password'), password);
  await userEvent.type(screen.getByPlaceholderText('Confirm password'), confirmation);
  await userEvent.click(screen.getByRole('button', { name: 'Confirm email and set password' }));
}

describe('VerifyEmail', () => {
  afterEach(() => vi.clearAllMocks());

  test('asks for a password and sends nothing until one is entered', () => {
    renderPage();
    expect(screen.getByRole('heading', { name: 'Confirm Your Email' })).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Choose a password')).toBeInTheDocument();
    expect(axios.post).not.toHaveBeenCalled();
  });

  test('sends the token from the link with the chosen password, and shows that the account is ready', async () => {
    axios.post.mockResolvedValue({ data: { message: 'Email confirmed. You can now log in.' } });
    renderPage();
    await choosePassword();

    expect(await screen.findByText('Email confirmed. You can now log in.')).toBeInTheDocument();
    expect(axios.post).toHaveBeenCalledTimes(1);
    expect(axios.post).toHaveBeenCalledWith('http://localhost:5000/api/auth/verify-email', {
      token: 'abc123', password: 'a-long-password',
    });
    expect(screen.queryByPlaceholderText('Choose a password')).not.toBeInTheDocument();
  });

  test('a password and its confirmation that differ are not sent', async () => {
    renderPage();
    await choosePassword('a-long-password', 'a-different-one');
    expect(screen.getByText('Passwords do not match.')).toBeInTheDocument();
    expect(axios.post).not.toHaveBeenCalled();
  });

  test('an empty password is not sent', async () => {
    renderPage();
    await userEvent.click(screen.getByRole('button', { name: 'Confirm email and set password' }));
    expect(axios.post).not.toHaveBeenCalled();
  });

  test('shows why a link was refused, in the server\'s words, and lets the professor try again', async () => {
    axios.post.mockRejectedValue({ response: { data: { error: { message: 'This confirmation link is invalid or has expired.' } } } });
    renderPage();
    await choosePassword();

    expect(await screen.findByText('This confirmation link is invalid or has expired.')).toBeInTheDocument();
    expect(screen.queryByText(/Email confirmed/)).not.toBeInTheDocument();
    expect(screen.getByPlaceholderText('Choose a password')).toBeInTheDocument();
  });

  test('falls back to a plain message when the server gives none', async () => {
    axios.post.mockRejectedValue(new Error('network down'));
    renderPage();
    await choosePassword();
    expect(await screen.findByText('We could not confirm your email address. Please try again.')).toBeInTheDocument();
  });

  test('a button goes to the login page once the account is ready', async () => {
    axios.post.mockResolvedValue({ data: { message: 'Email confirmed. You can now log in.' } });
    renderPage();
    await choosePassword();
    await userEvent.click(await screen.findByRole('button', { name: 'Go to login' }));
    expect(screen.getByRole('heading', { name: 'Login page' })).toBeInTheDocument();
  });
});
