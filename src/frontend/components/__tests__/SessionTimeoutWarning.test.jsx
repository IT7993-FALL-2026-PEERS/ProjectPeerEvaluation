import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import SessionTimeoutWarning from '../SessionTimeoutWarning';
import { AuthProvider } from '../../contexts/AuthContext';
import { SESSION_EXPIRED_EVENT } from '../../services/sessionExpired';
import api from '../../services/api';
import { resetServerClock, setServerTime } from '../../services/sessionActivity';

vi.mock('../../services/api', () => ({ default: { post: vi.fn() } }));

// FR-04: the session ends after a period of inactivity. While the professor clicks, types, scrolls or
// touches the page, the browser asks the server to extend the login (at most every 5 minutes); with
// 2 minutes left and no activity it asks whether to stay logged in.
const b64url = (value) => btoa(JSON.stringify(value)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const NOW = Date.UTC(2026, 9, 13, 12, 0, 0);
const sec = (ms) => Math.floor(ms / 1000);

// A login token issued `ageSeconds` ago that has `leftSeconds` left.
function setLogin({ ageSeconds = 0, leftSeconds = 3600, where = 'peer_eval_token', token: marker = 'sig' } = {}) {
  const token = `${b64url({ alg: 'HS256' })}.${b64url({ id: 'p1', iat: sec(Date.now()) - ageSeconds, exp: sec(Date.now()) + leftSeconds })}.${marker}`;
  (where === 'peer_eval_session' ? sessionStorage : localStorage).setItem(where, token);
}

const advance = async (ms) => { await act(async () => { vi.advanceTimersByTime(ms); }); };

function renderWarning() {
  return render(
    <AuthProvider>
      <MemoryRouter initialEntries={['/course-management']}>
        <SessionTimeoutWarning />
        <Routes>
          <Route path="/course-management" element={<h1>Course list</h1>} />
          <Route path="/" element={<h1>Login page</h1>} />
        </Routes>
      </MemoryRouter>
    </AuthProvider>
  );
}

let heard;
const onExpired = () => { heard += 1; };

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  localStorage.clear();
  sessionStorage.clear();
  resetServerClock();
  api.post.mockReset();
  api.post.mockResolvedValue({ data: { message: 'Session extended.', expires_in_seconds: 3600 } });
  heard = 0;
  window.addEventListener(SESSION_EXPIRED_EVENT, onExpired);
});

afterEach(() => {
  window.removeEventListener(SESSION_EXPIRED_EVENT, onExpired);
  vi.useRealTimers();
});

describe('SessionTimeoutWarning: activity keeps the login alive', () => {
  test.each([
    ['a click', () => fireEvent.click(document.body)],
    ['a key press', () => fireEvent.keyDown(document.body, { key: 'a' })],
    ['scrolling', () => fireEvent.scroll(document.body)],
    ['a touch', () => fireEvent.touchStart(document.body)],
  ])('%s asks the server to extend a login that is more than 5 minutes old', async (_name, act1) => {
    setLogin({ ageSeconds: 6 * 60 });
    renderWarning();
    act1();
    expect(api.post).toHaveBeenCalledTimes(1);
    expect(api.post).toHaveBeenCalledWith('/auth/refresh', {});
  });

  test('scrolling inside any element counts, even though scroll events do not bubble', async () => {
    setLogin({ ageSeconds: 6 * 60 });
    renderWarning();
    const inner = document.createElement('div');
    document.body.appendChild(inner);
    fireEvent.scroll(inner);
    expect(api.post).toHaveBeenCalledTimes(1);
    inner.remove();
  });

  test.each([['mousemove'], ['mouseover'], ['pointermove'], ['focus']])('%s does not count as activity', async (type) => {
    setLogin({ ageSeconds: 6 * 60 });
    renderWarning();
    fireEvent(document.body, new Event(type, { bubbles: true }));
    expect(api.post).not.toHaveBeenCalled();
  });

  test('a login less than 5 minutes old is not extended again', async () => {
    setLogin({ ageSeconds: 4 * 60 });
    renderWarning();
    fireEvent.click(document.body);
    expect(api.post).not.toHaveBeenCalled();
  });

  test('without a login nothing is sent', async () => {
    renderWarning();
    fireEvent.click(document.body);
    fireEvent.keyDown(document.body, { key: 'a' });
    expect(api.post).not.toHaveBeenCalled();
  });

  test('a login kept only for this browser session is extended too', async () => {
    setLogin({ ageSeconds: 6 * 60, where: 'peer_eval_session' });
    renderWarning();
    fireEvent.click(document.body);
    expect(api.post).toHaveBeenCalledTimes(1);
  });

  // Codex review, second pass: an expiry the browser only thinks has passed (its clock is ahead) must not stop
  // the login being extended; the server is the one that knows.
  test('a login that looks expired is still sent to the server, which decides', async () => {
    setLogin({ ageSeconds: 3700, leftSeconds: -100 });
    renderWarning();
    fireEvent.click(document.body);
    expect(api.post).toHaveBeenCalledTimes(1);
  });

  test('a burst of clicks sends one request while it is pending', async () => {
    setLogin({ ageSeconds: 6 * 60 });
    api.post.mockReturnValue(new Promise(() => {}));
    renderWarning();
    fireEvent.click(document.body);
    fireEvent.click(document.body);
    fireEvent.keyDown(document.body, { key: 'b' });
    expect(api.post).toHaveBeenCalledTimes(1);
  });

  test('a failed request is tried again no sooner than 30 seconds later', async () => {
    setLogin({ ageSeconds: 6 * 60 });
    api.post.mockRejectedValue(new Error('network down'));
    renderWarning();
    fireEvent.click(document.body);
    await advance(0);
    fireEvent.click(document.body);
    expect(api.post).toHaveBeenCalledTimes(1);
    await advance(31 * 1000);
    fireEvent.click(document.body);
    expect(api.post).toHaveBeenCalledTimes(2);
  });

  test('after the listeners are removed (the app closes), activity sends nothing', async () => {
    setLogin({ ageSeconds: 6 * 60 });
    const view = renderWarning();
    view.unmount();
    fireEvent.click(document.body);
    expect(api.post).not.toHaveBeenCalled();
  });
});

describe('SessionTimeoutWarning: the warning before the login ends', () => {
  test('nothing is shown while there is more than 2 minutes left', async () => {
    setLogin({ leftSeconds: 125 });
    renderWarning();
    await advance(1000);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  test('the warning starts at exactly 2 minutes left', async () => {
    setLogin({ leftSeconds: 122 });
    renderWarning();
    await advance(1000);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await advance(1000);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText(/2:00/)).toBeInTheDocument();
  });

  test('with 2 minutes or less left it asks whether to stay logged in, with a countdown', async () => {
    setLogin({ leftSeconds: 119 });
    renderWarning();
    await advance(1000);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Your session is about to expire')).toBeInTheDocument();
    expect(screen.getByText(/1:58/)).toBeInTheDocument();
    await advance(10 * 1000);
    expect(screen.getByText(/1:48/)).toBeInTheDocument();
  });

  test('the warning appears when the time runs down while the professor does nothing', async () => {
    setLogin({ leftSeconds: 300 });
    renderWarning();
    await advance(60 * 1000);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await advance(3 * 60 * 1000);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  test('Stay logged in asks the server to extend the login, and the warning goes once the new token is stored', async () => {
    setLogin({ ageSeconds: 3500, leftSeconds: 100 });
    api.post.mockImplementation(async () => {
      setLogin({ ageSeconds: 0, leftSeconds: 3600 }); // what the request layer does with the renewed token
      return { data: {} };
    });
    renderWarning();
    await advance(1000);
    fireEvent.click(screen.getByRole('button', { name: 'Stay logged in' }));
    expect(api.post).toHaveBeenCalledWith('/auth/refresh', {});
    await advance(1000);
    await advance(1000);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(heard).toBe(0);
  });

  test('Stay logged in is sent at once even if a recent keep-alive failed, but not twice while one is pending', async () => {
    setLogin({ ageSeconds: 3500, leftSeconds: 100 });
    api.post.mockRejectedValueOnce(new Error('network down'));
    renderWarning();
    await advance(1000);
    fireEvent.click(document.body); // an automatic keep-alive that fails
    await advance(0);
    expect(api.post).toHaveBeenCalledTimes(1);

    api.post.mockReturnValue(new Promise(() => {}));
    fireEvent.click(screen.getByRole('button', { name: 'Stay logged in' }));
    expect(api.post).toHaveBeenCalledTimes(2); // not held back by the 30-second wait
    fireEvent.click(screen.getByRole('button', { name: 'Stay logged in' }));
    expect(api.post).toHaveBeenCalledTimes(2); // one is still pending
  });

  test('Log out forgets the login and goes to the login page', async () => {
    setLogin({ ageSeconds: 3500, leftSeconds: 100 });
    localStorage.setItem('user', JSON.stringify({ id: 'p1' }));
    renderWarning();
    await advance(1000);
    fireEvent.click(screen.getByRole('button', { name: 'Log out' }));
    expect(localStorage.getItem('peer_eval_token')).toBeNull();
    expect(localStorage.getItem('user')).toBeNull();
    // Role queries skip what an open dialog hides, so let it finish closing first.
    await advance(1000);
    await advance(1000);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Login page' })).toBeInTheDocument();
    expect(heard).toBe(0);
  });

  test('another tab that extends the login closes the warning here', async () => {
    setLogin({ ageSeconds: 3500, leftSeconds: 100 });
    renderWarning();
    await advance(1000);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    setLogin({ ageSeconds: 0, leftSeconds: 3600 });
    await advance(1000);
    await advance(1000);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

describe('SessionTimeoutWarning: a browser clock that is wrong', () => {
  test('with the server time known, a clock 5 minutes ahead gives no early warning and no false timeout', async () => {
    // The token has 56 minutes left by the server's clock; this browser is 5 minutes ahead of the server, so
    // by the browser's clock it has 51 minutes left.
    setLogin({ ageSeconds: 9 * 60, leftSeconds: 51 * 60 });
    setServerTime(Date.now() - 5 * 60 * 1000);
    renderWarning();
    await advance(60 * 1000);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(heard).toBe(0);
    expect(api.post).not.toHaveBeenCalled();
  });

  test('with the server time known, the warning appears when the server clock says 2 minutes are left', async () => {
    // 100 seconds left by the server's clock; the browser is 5 minutes ahead, so by its own clock the login ran
    // out 200 seconds ago.
    setLogin({ ageSeconds: 3800, leftSeconds: -200 });
    setServerTime(Date.now() - 5 * 60 * 1000);
    renderWarning();
    await advance(1000);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText(/1:39/)).toBeInTheDocument();
  });
});

describe('SessionTimeoutWarning: when the time is up', () => {
  const refused = () => Object.assign(new Error('401'), { response: { status: 401 } });

  test('asks the server before saying the session timed out, and says so once the server refuses', async () => {
    api.post.mockRejectedValue(refused());
    setLogin({ ageSeconds: 3500, leftSeconds: 3 });
    renderWarning();
    await advance(1000);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();
    await advance(5 * 1000);
    expect(api.post).toHaveBeenCalledWith('/auth/refresh', {});
    expect(heard).toBe(1);
    await advance(10 * 1000);
    expect(heard).toBe(1);
    expect(api.post).toHaveBeenCalledTimes(1);
    await advance(1000);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  // Codex review, third pass: a refusal that arrives after the login has changed (another tab logged in, or the
  // login was renewed) is about the old login and must not show the timeout message over the new one.
  test('a refusal that arrives after the login has been replaced says nothing', async () => {
    let refuse;
    api.post.mockReturnValueOnce(new Promise((resolve, reject) => { refuse = () => reject(refused()); }));
    setLogin({ ageSeconds: 3500, leftSeconds: -5 });
    renderWarning();
    await advance(2000);
    expect(api.post).toHaveBeenCalledTimes(1);
    setLogin({ ageSeconds: 0, leftSeconds: 3600, token: 'another-tab' }); // a different login takes its place
    refuse();
    await advance(0);
    await advance(5000);
    expect(heard).toBe(0);
  });

  test('a refusal that arrives while the same login is still stored says the session timed out', async () => {
    let refuse;
    api.post.mockReturnValueOnce(new Promise((resolve, reject) => { refuse = () => reject(refused()); }));
    setLogin({ ageSeconds: 3500, leftSeconds: -5 });
    renderWarning();
    await advance(2000);
    refuse();
    await advance(0);
    expect(heard).toBe(1);
  });

  test('says nothing when the server still accepts a login the browser thought had expired (a clock that is ahead)', async () => {
    setLogin({ ageSeconds: 3500, leftSeconds: -60 });
    api.post.mockImplementation(async () => {
      setLogin({ ageSeconds: 0, leftSeconds: 3600 }); // the renewed token the request layer stores
      return { data: {} };
    });
    renderWarning();
    await advance(2000);
    expect(api.post).toHaveBeenCalledTimes(1);
    expect(heard).toBe(0);
    await advance(10 * 1000);
    expect(heard).toBe(0);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  test('says nothing when the check fails for another reason, such as the network', async () => {
    api.post.mockRejectedValue(new Error('network down'));
    setLogin({ ageSeconds: 3500, leftSeconds: -5 });
    renderWarning();
    await advance(5 * 1000);
    expect(heard).toBe(0);
  });

  test('does not check twice for the same expiry, but checks again after a new login', async () => {
    api.post.mockRejectedValue(refused());
    setLogin({ ageSeconds: 3500, leftSeconds: -5 });
    renderWarning();
    await advance(10 * 1000);
    expect(api.post).toHaveBeenCalledTimes(1);
    expect(heard).toBe(1);
    setLogin({ ageSeconds: 0, leftSeconds: 3 });
    await advance(6 * 1000);
    expect(api.post).toHaveBeenCalledTimes(2);
    expect(heard).toBe(2);
  });

  test('a check that has to wait for one already on its way is made on the next second', async () => {
    let finish;
    api.post.mockReturnValueOnce(new Promise((resolve) => { finish = resolve; }));
    api.post.mockRejectedValue(refused());
    setLogin({ ageSeconds: 3500, leftSeconds: -5 });
    renderWarning();
    fireEvent.click(document.body); // an automatic keep-alive, still pending
    expect(api.post).toHaveBeenCalledTimes(1);
    await advance(1000);
    expect(api.post).toHaveBeenCalledTimes(1);
    expect(heard).toBe(0);
    finish({ data: {} });
    await advance(0); // let the first request settle
    await advance(2000);
    expect(api.post).toHaveBeenCalledTimes(2);
    expect(heard).toBe(1);
  });

  test('a visitor with no login never sees a warning or a timeout message', async () => {
    renderWarning();
    await advance(10 * 60 * 1000);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(heard).toBe(0);
  });
});
