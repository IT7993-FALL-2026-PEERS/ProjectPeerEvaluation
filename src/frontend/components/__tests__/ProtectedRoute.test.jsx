import React from 'react';
import { act, render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import ProtectedRoute from '../ProtectedRoute';
import api from '../../services/api';
import { AuthProvider } from '../../contexts/AuthContext';
import { resetServerClock } from '../../services/sessionActivity';

// The guard asks the server about a login that looks expired (CICD-85) through the shared request layer.
vi.mock('../../services/api', () => ({ default: { post: vi.fn() } }));

function renderDashboard({ strict = false } = {}) {
  const Mode = strict ? React.StrictMode : React.Fragment;
  return render(
    <Mode>
      <AuthProvider>
        <MemoryRouter initialEntries={['/course-management']}>
          <Routes>
            <Route path="/" element={<h1>Login page</h1>} />
            <Route
              path="/course-management"
              element={
                <ProtectedRoute>
                  <div>Secret Dashboard</div>
                </ProtectedRoute>
              }
            />
          </Routes>
        </MemoryRouter>
      </AuthProvider>
    </Mode>
  );
}

const encode = (value) => btoa(JSON.stringify(value)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

// A token the browser can read, whose time ran out (or runs out) `secondsFromNow` from now.
function loginToken(secondsFromNow, id = 'p1') {
  const now = Math.floor(Date.now() / 1000);
  return `${encode({ alg: 'HS256' })}.${encode({ id, iat: now + secondsFromNow - 3600, exp: now + secondsFromNow })}.sig`;
}

function storeLogin(token) {
  localStorage.setItem('peer_eval_token', token);
  localStorage.setItem('user', JSON.stringify({ id: 'p1', email: 'ada@ksu.edu', name: 'Ada' }));
}

// An answer the test gives when it chooses, so what is on the page while the question is out can be checked.
function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

const refusal = (status) => Object.assign(new Error('refused'), { response: { status } });

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  resetServerClock();
  api.post.mockReset();
});

describe('ProtectedRoute', () => {
  it('sends a visitor without a login token to the login page', () => {
    renderDashboard();

    expect(screen.getByRole('heading', { name: 'Login page' })).toBeInTheDocument();
    expect(screen.queryByText('Secret Dashboard')).not.toBeInTheDocument();
  });

  it('shows the page to a professor with a login token', () => {
    localStorage.setItem('peer_eval_token', 'jwt-abc');
    renderDashboard();

    expect(screen.getByText('Secret Dashboard')).toBeInTheDocument();
  });

  it('accepts a session-only login token too', () => {
    sessionStorage.setItem('peer_eval_session', 'jwt-abc');
    renderDashboard();

    expect(screen.getByText('Secret Dashboard')).toBeInTheDocument();
  });
});

// CICD-85: a professor who opened a page with a login that had run out got the dashboard with no courses, 'Failed to
// fetch courses' and the 'Session timed out' banner. A page that has only just opened has no work to keep, so the
// guard asks the server and, if the login is refused, goes to the login page.
describe('ProtectedRoute, with a login that has run out', () => {
  it('goes to the login page and forgets the login when the server refuses it, without showing the page', async () => {
    storeLogin(loginToken(-3600));
    const answer = deferred();
    api.post.mockReturnValue(answer.promise);
    renderDashboard();

    // With a short time limit: the page waits for this answer, and the request layer's own limit is three minutes.
    expect(api.post).toHaveBeenCalledWith('/auth/refresh', {}, { timeout: 10000 });
    expect(screen.queryByText('Secret Dashboard')).not.toBeInTheDocument();

    answer.reject(refusal(401));

    expect(await screen.findByRole('heading', { name: 'Login page' })).toBeInTheDocument();
    expect(screen.queryByText('Secret Dashboard')).not.toBeInTheDocument();
    expect(localStorage.getItem('peer_eval_token')).toBeNull();
    expect(localStorage.getItem('user')).toBeNull();
  });

  it('does the same for a session-only login', async () => {
    sessionStorage.setItem('peer_eval_session', loginToken(-60));
    api.post.mockRejectedValue(refusal(401));
    renderDashboard();

    expect(await screen.findByRole('heading', { name: 'Login page' })).toBeInTheDocument();
    expect(sessionStorage.getItem('peer_eval_session')).toBeNull();
  });

  it('shows the page when the server still accepts the login (the clock of this browser is wrong)', async () => {
    const token = loginToken(-120);
    storeLogin(token);
    api.post.mockResolvedValue({ data: {} });
    renderDashboard();

    expect(await screen.findByText('Secret Dashboard')).toBeInTheDocument();
    expect(localStorage.getItem('peer_eval_token')).toBe(token);
  });

  it.each([
    ['the server cannot be reached', new Error('Network Error')],
    ['the server has an error of its own', refusal(500)],
  ])('shows the page and keeps the login when %s', async (_, failure) => {
    const token = loginToken(-3600);
    storeLogin(token);
    api.post.mockRejectedValue(failure);
    renderDashboard();

    expect(await screen.findByText('Secret Dashboard')).toBeInTheDocument();
    expect(localStorage.getItem('peer_eval_token')).toBe(token);
    expect(localStorage.getItem('user')).not.toBeNull();
  });

  it('keeps a login made in another tab while the question was out', async () => {
    storeLogin(loginToken(-3600));
    const answer = deferred();
    api.post.mockReturnValue(answer.promise);
    renderDashboard();

    const fresh = loginToken(3600);
    localStorage.setItem('peer_eval_token', fresh);
    answer.reject(refusal(401));

    expect(await screen.findByText('Secret Dashboard')).toBeInTheDocument();
    expect(localStorage.getItem('peer_eval_token')).toBe(fresh);
    expect(localStorage.getItem('user')).not.toBeNull();
  });
});

// In development React runs the guard's question twice and gives the first one up (StrictMode, src/index.jsx); a
// page that is left has the same effect. The answer to a question that was given up must change nothing: the other
// question may already have opened the page, and the professor may be typing on it (Codex review, Nov 9).
describe('ProtectedRoute, when a question about the login was given up', () => {
  it('a late refusal of it does not log the professor out of a page that has opened', async () => {
    const token = loginToken(-3600);
    storeLogin(token);
    const givenUp = deferred();
    const current = deferred();
    api.post.mockReturnValueOnce(givenUp.promise).mockReturnValueOnce(current.promise);
    renderDashboard({ strict: true });
    expect(api.post).toHaveBeenCalledTimes(2);

    current.reject(new Error('Network Error'));
    expect(await screen.findByText('Secret Dashboard')).toBeInTheDocument();

    await act(async () => { givenUp.reject(refusal(401)); });

    expect(screen.getByText('Secret Dashboard')).toBeInTheDocument();
    expect(localStorage.getItem('peer_eval_token')).toBe(token);
    expect(localStorage.getItem('user')).not.toBeNull();
  });

  it('the question that is still current decides: a refusal goes to the login page', async () => {
    storeLogin(loginToken(-3600));
    const givenUp = deferred();
    const current = deferred();
    api.post.mockReturnValueOnce(givenUp.promise).mockReturnValueOnce(current.promise);
    renderDashboard({ strict: true });

    await act(async () => { givenUp.resolve({ data: {} }); });
    expect(screen.queryByText('Secret Dashboard')).not.toBeInTheDocument();

    current.reject(refusal(401));
    expect(await screen.findByRole('heading', { name: 'Login page' })).toBeInTheDocument();
    expect(localStorage.getItem('peer_eval_token')).toBeNull();
  });
});

describe('ProtectedRoute, with a login the browser cannot call expired', () => {
  it('shows the page at once and does not ask the server when the login has time left', () => {
    storeLogin(loginToken(1800));
    renderDashboard();

    expect(screen.getByText('Secret Dashboard')).toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();
  });

  // The first request of the page settles it, as before (E2E-41).
  it('shows the page at once and does not ask the server when the token cannot be read', () => {
    storeLogin('an-expired-token');
    renderDashboard();

    expect(screen.getByText('Secret Dashboard')).toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();
  });
});
