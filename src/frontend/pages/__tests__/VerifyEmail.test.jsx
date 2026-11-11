import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import axios from 'axios';
import VerifyEmail from '../VerifyEmail';

vi.mock('axios');

// CW-11: the page the confirmation email links to. Opening the link proves the professor owns the
// mailbox, so this is where they choose their password; until then the account has none.
const CHECK_URL = 'http://localhost:5000/api/auth/verify-email/check';
const deadLink = { response: { status: 400, data: { error: { code: 'TOKEN_ERROR', message: 'This confirmation link is invalid or has expired. Register again with the same email to get a new one.' } } } };

// Answers the check made when the page opens and the confirmation sent with the password separately.
function answer({ check, confirm } = {}) {
  axios.post.mockImplementation((url) => {
    const reply = url === CHECK_URL ? (check ?? { data: { valid: true } }) : (confirm ?? { data: { message: 'Email confirmed. You can now log in.' } });
    return reply.response || reply instanceof Error ? Promise.reject(reply) : Promise.resolve(reply);
  });
}

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
  await userEvent.type(await screen.findByPlaceholderText('Choose a password'), password);
  await userEvent.type(screen.getByPlaceholderText('Confirm password'), confirmation);
  await userEvent.click(screen.getByRole('button', { name: 'Confirm email and set password' }));
}

describe('VerifyEmail', () => {
  beforeEach(() => answer());
  afterEach(() => vi.resetAllMocks());

  // CICD-77: the link is checked when the page opens, so a dead link is said before a password is typed.
  test('checks the link when the page opens, then asks for a password and sends no password yet', async () => {
    renderPage();
    expect(screen.getByRole('heading', { name: 'Confirm Your Email' })).toBeInTheDocument();
    expect(await screen.findByPlaceholderText('Choose a password')).toBeInTheDocument();
    expect(axios.post).toHaveBeenCalledTimes(1);
    // The check has a time limit, so a server that never answers cannot keep the form hidden.
    expect(axios.post).toHaveBeenCalledWith(CHECK_URL, { token: 'abc123' }, { timeout: 10000 });
  });

  test('shows no password form while the link is being checked', () => {
    axios.post.mockImplementation(() => new Promise(() => {}));
    renderPage();
    expect(screen.getByText('Checking your link...')).toBeInTheDocument();
    expect(screen.queryByPlaceholderText('Choose a password')).not.toBeInTheDocument();
  });

  test('an expired or unknown link shows the reason and no password form, with a way back to the login page', async () => {
    answer({ check: deadLink });
    renderPage();
    expect(await screen.findByText(/This confirmation link is invalid or has expired\. Register again/)).toBeInTheDocument();
    expect(screen.queryByPlaceholderText('Choose a password')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Confirm email and set password' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Go to login' }));
    expect(screen.getByRole('heading', { name: 'Login page' })).toBeInTheDocument();
  });

  test.each([
    ['the server cannot be reached', new Error('network down')],
    ['no answer within the time limit', Object.assign(new Error('timeout of 10000ms exceeded'), { code: 'ECONNABORTED' })],
    ['too many requests', { response: { status: 429, data: { error: { code: 'RATE_LIMITED', message: 'Too many email confirmation attempts.' } } } }],
    ['a server error', { response: { status: 500, data: { error: { code: 'SERVER_ERROR', message: 'Something went wrong.' } } } }],
  ])('when the check fails because of %s, the form is still shown (the server decides when the password is sent)', async (_, failure) => {
    answer({ check: failure });
    renderPage();
    expect(await screen.findByPlaceholderText('Choose a password')).toBeInTheDocument();
    expect(screen.queryByText(/invalid or has expired/)).not.toBeInTheDocument();
  });

  test('leaving the page before the check answers does nothing', async () => {
    let release;
    axios.post.mockImplementation(() => new Promise((resolve) => { release = resolve; }));
    const { unmount } = render(
      <MemoryRouter initialEntries={['/verify-email/abc123']}>
        <Routes><Route path="/verify-email/:token" element={<VerifyEmail />} /></Routes>
      </MemoryRouter>
    );
    unmount();
    release({ data: { valid: true } });
    await waitFor(() => expect(axios.post).toHaveBeenCalledTimes(1));
  });

  test('sends the token from the link with the chosen password, and shows that the account is ready', async () => {
    renderPage();
    await choosePassword();

    expect(await screen.findByText('Email confirmed. You can now log in.')).toBeInTheDocument();
    expect(axios.post).toHaveBeenCalledTimes(2);
    expect(axios.post).toHaveBeenLastCalledWith('http://localhost:5000/api/auth/verify-email', {
      token: 'abc123', password: 'a-long-password',
    });
    expect(screen.queryByPlaceholderText('Choose a password')).not.toBeInTheDocument();
  });

  test('a password and its confirmation that differ are not sent', async () => {
    renderPage();
    await choosePassword('a-long-password', 'a-different-one');
    expect(screen.getByText('Passwords do not match.')).toBeInTheDocument();
    expect(axios.post).toHaveBeenCalledTimes(1);
  });

  test('an empty password is not sent', async () => {
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: 'Confirm email and set password' }));
    expect(axios.post).toHaveBeenCalledTimes(1);
  });

  test('shows why a confirmation was refused, in the server\'s words, and lets the professor try again', async () => {
    answer({ confirm: { response: { status: 400, data: { error: { message: 'This confirmation link is invalid or has expired.' } } } } });
    renderPage();
    await choosePassword();

    expect(await screen.findByText('This confirmation link is invalid or has expired.')).toBeInTheDocument();
    expect(screen.queryByText(/Email confirmed/)).not.toBeInTheDocument();
    expect(screen.getByPlaceholderText('Choose a password')).toBeInTheDocument();
  });

  test('falls back to a plain message when the server gives none', async () => {
    answer({ confirm: new Error('network down') });
    renderPage();
    await choosePassword();
    expect(await screen.findByText('We could not confirm your email address. Please try again.')).toBeInTheDocument();
  });

  test('a button goes to the login page once the account is ready', async () => {
    renderPage();
    await choosePassword();
    await userEvent.click(await screen.findByRole('button', { name: 'Go to login' }));
    expect(screen.getByRole('heading', { name: 'Login page' })).toBeInTheDocument();
  });
});
