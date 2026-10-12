import api from '../api';
import { SESSION_EXPIRED_EVENT } from '../sessionExpired';

// The shared request layer is where every page's calls pass, so an expired login is caught once here
// and not in each page. The adapter is replaced so no network is used; axios still runs its interceptors.
const answer401 = (message = 'Invalid or expired token.') => (config) =>
  Promise.reject(Object.assign(new Error('Request failed with status code 401'), {
    config,
    response: { status: 401, data: { error: { message } }, headers: {}, config },
  }));

let heard;
const onExpired = () => { heard += 1; };
const realAdapter = api.defaults.adapter;

beforeEach(() => {
  heard = 0;
  localStorage.clear();
  sessionStorage.clear();
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  window.addEventListener(SESSION_EXPIRED_EVENT, onExpired);
});

afterEach(() => {
  window.removeEventListener(SESSION_EXPIRED_EVENT, onExpired);
  api.defaults.adapter = realAdapter;
  vi.restoreAllMocks();
});

describe('api: an expired login', () => {
  test('tells the app the session timed out when a logged-in request gets a 401', async () => {
    localStorage.setItem('peer_eval_token', 'old-token');
    api.defaults.adapter = answer401();
    await expect(api.get('/courses')).rejects.toMatchObject({ response: { status: 401 } });
    expect(heard).toBe(1);
  });

  test('also works for a login kept only for this browser session', async () => {
    sessionStorage.setItem('peer_eval_session', 'old-token');
    api.defaults.adapter = answer401();
    await expect(api.get('/courses')).rejects.toBeTruthy();
    expect(heard).toBe(1);
  });

  test('stays quiet for a wrong password, which is also a 401 but has no token', async () => {
    api.defaults.adapter = answer401('Invalid email or password.');
    await expect(api.post('/auth/login', { email: 'a@b.c', password: 'x' })).rejects.toBeTruthy();
    expect(heard).toBe(0);
  });

  test('stays quiet for other failures', async () => {
    localStorage.setItem('peer_eval_token', 'good-token');
    api.defaults.adapter = (config) => Promise.reject(Object.assign(new Error('500'), { config, response: { status: 500, data: {}, headers: {}, config } }));
    await expect(api.get('/courses')).rejects.toBeTruthy();
    expect(heard).toBe(0);
  });
});
