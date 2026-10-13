import api from '../api';
import { clockNow, resetServerClock } from '../sessionActivity';

// FR-04: the session ends after a period of inactivity. The server hands back a fresh login token
// in the X-Access-Token header while the professor keeps working; the shared request layer stores it
// so the next request uses it. The adapter is replaced so no network is used.
const answer = (headers = {}, status = 200) => (config) => Promise.resolve({
  status, statusText: 'OK', data: {}, headers, config,
});

const realAdapter = api.defaults.adapter;

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  api.defaults.adapter = realAdapter;
  vi.restoreAllMocks();
});

describe('api: a renewed login token', () => {
  test('replaces the stored token when the server sends a new one', async () => {
    localStorage.setItem('peer_eval_token', 'old-token');
    api.defaults.adapter = answer({ 'x-access-token': 'new-token' });
    await api.get('/courses');
    expect(localStorage.getItem('peer_eval_token')).toBe('new-token');
  });

  test('the next request sends the new token', async () => {
    localStorage.setItem('peer_eval_token', 'old-token');
    api.defaults.adapter = answer({ 'x-access-token': 'new-token' });
    await api.get('/courses');
    let sent;
    api.defaults.adapter = (config) => { sent = config.headers.Authorization; return answer()(config); };
    await api.get('/courses');
    expect(sent).toBe('Bearer new-token');
  });

  test('replaces a login kept only for this browser session, in the same place', async () => {
    sessionStorage.setItem('peer_eval_session', 'old-token');
    api.defaults.adapter = answer({ 'x-access-token': 'new-token' });
    await api.get('/courses');
    expect(sessionStorage.getItem('peer_eval_session')).toBe('new-token');
    expect(localStorage.getItem('peer_eval_token')).toBeNull();
  });

  // Codex review, 13 Oct: an answer that arrives late must not replace a login that has changed since the
  // request was sent (logout then login as someone else, another tab, or two answers out of order).
  describe('an answer that arrives late', () => {
    const deferredAdapter = () => {
      const pending = [];
      api.defaults.adapter = (config) => new Promise((resolve) => {
        pending.push((headers) => resolve({ status: 200, statusText: 'OK', data: {}, headers, config }));
      });
      return pending;
    };
    const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

    test('does not replace the login of someone who logged in after the request was sent', async () => {
      localStorage.setItem('peer_eval_token', 'token-of-A');
      const pending = deferredAdapter();
      const request = api.get('/courses');
      await flush();
      localStorage.setItem('peer_eval_token', 'token-of-B'); // A logged out and B logged in meanwhile
      pending[0]({ 'x-access-token': 'renewed-token-of-A' });
      await request;
      expect(localStorage.getItem('peer_eval_token')).toBe('token-of-B');
    });

    test('does not replace a newer renewal with an older one when answers arrive out of order', async () => {
      localStorage.setItem('peer_eval_token', 'token-0');
      const pending = deferredAdapter();
      const first = api.get('/courses');
      const second = api.get('/students');
      await flush();
      expect(pending).toHaveLength(2);
      pending[1]({ 'x-access-token': 'token-2' }); // the later request is answered first
      await second;
      expect(localStorage.getItem('peer_eval_token')).toBe('token-2');
      pending[0]({ 'x-access-token': 'token-1' }); // the earlier one is answered last
      await first;
      expect(localStorage.getItem('peer_eval_token')).toBe('token-2');
    });

    test('does not replace a login another tab has already renewed', async () => {
      sessionStorage.setItem('peer_eval_session', 'token-0');
      const pending = deferredAdapter();
      const request = api.get('/courses');
      await flush();
      sessionStorage.setItem('peer_eval_session', 'token-from-other-tab');
      pending[0]({ 'x-access-token': 'token-1' });
      await request;
      expect(sessionStorage.getItem('peer_eval_session')).toBe('token-from-other-tab');
    });

    test('does not bring a login back after a log out', async () => {
      localStorage.setItem('peer_eval_token', 'token-of-A');
      const pending = deferredAdapter();
      const request = api.get('/courses');
      await flush();
      localStorage.removeItem('peer_eval_token');
      pending[0]({ 'x-access-token': 'renewed-token-of-A' });
      await request;
      expect(localStorage.getItem('peer_eval_token')).toBeNull();
    });
  });

  test('learns the server time from X-Server-Time, so the countdown does not depend on the browser clock', async () => {
    resetServerClock();
    const serverTime = Date.now() + 5 * 60 * 1000; // the server is 5 minutes ahead of this browser
    localStorage.setItem('peer_eval_token', 'old-token');
    api.defaults.adapter = answer({ 'x-server-time': String(serverTime) });
    await api.get('/courses');
    expect(Math.abs(clockNow() - (Date.now() + 5 * 60 * 1000))).toBeLessThan(2000);
    resetServerClock();
  });

  test('a slow answer does not move the corrected clock backwards (the server stamped the time when the request arrived)', async () => {
    resetServerClock();
    const realNow = Date.now();
    let current = realNow;
    const spy = vi.spyOn(Date, 'now').mockImplementation(() => current);
    try {
      localStorage.setItem('peer_eval_token', 'old-token');
      let finish;
      api.defaults.adapter = (config) => new Promise((resolve) => {
        finish = (headers) => resolve({ status: 200, statusText: 'OK', data: {}, headers, config });
      });
      const request = api.get('/courses'); // sent at realNow
      await new Promise((resolve) => setTimeout(resolve, 0));
      current = realNow + 150 * 1000; // the answer arrives 150 seconds later
      finish({ 'x-server-time': String(realNow + 1000) }); // stamped 1 second after the request was sent
      await request;
      expect(Math.abs(clockNow() - current)).toBeLessThan(50); // no correction was learned from it
    } finally {
      spy.mockRestore();
      resetServerClock();
    }
  });

  test('ignores a server time that is not a number', async () => {
    resetServerClock();
    api.defaults.adapter = answer({ 'x-server-time': 'soon' });
    await api.get('/courses');
    expect(Math.abs(clockNow() - Date.now())).toBeLessThan(50);
  });

  test('leaves the stored token alone when the server sends none', async () => {
    localStorage.setItem('peer_eval_token', 'old-token');
    api.defaults.adapter = answer();
    await api.get('/courses');
    expect(localStorage.getItem('peer_eval_token')).toBe('old-token');
  });

  test('does not create a login for someone who has none (the header on a public request is ignored)', async () => {
    api.defaults.adapter = answer({ 'x-access-token': 'new-token' });
    await api.get('/evaluate/some-link');
    expect(localStorage.getItem('peer_eval_token')).toBeNull();
    expect(sessionStorage.getItem('peer_eval_session')).toBeNull();
  });
});
