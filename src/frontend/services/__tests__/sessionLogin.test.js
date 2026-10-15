import axios from 'axios';
import { logInAgain, WRONG_ACCOUNT, MFA_REQUIRED, CANCELLED, LOGIN_CHANGED } from '../sessionLogin';

vi.mock('axios');

// After a timeout the same professor logs in again on the same page. The new token goes where the old one
// was, and nothing is stored unless the login is for the account that was logged in.
const professor = { id: 'p1', email: 'ada@ksu.edu', name: 'Ada' };
const account = { id: 'p1', email: 'ada@ksu.edu' };

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  vi.resetAllMocks();
});

describe('logInAgain', () => {
  test('logs in with the stored email and replaces the old token where it was', async () => {
    localStorage.setItem('peer_eval_token', 'old');
    axios.post.mockResolvedValue({ data: { access_token: 'new', professor } });
    await expect(logInAgain(account, 'secret')).resolves.toEqual(professor);
    expect(axios.post).toHaveBeenCalledWith(expect.stringMatching(/\/auth\/login$/), { email: 'ada@ksu.edu', password: 'secret' });
    expect(localStorage.getItem('peer_eval_token')).toBe('new');
  });

  test('replaces a token that was kept only for the browser session in the same place', async () => {
    sessionStorage.setItem('peer_eval_session', 'old');
    axios.post.mockResolvedValue({ data: { access_token: 'new', professor } });
    await logInAgain(account, 'secret');
    expect(sessionStorage.getItem('peer_eval_session')).toBe('new');
    expect(localStorage.getItem('peer_eval_token')).toBeNull();
  });

  test('refuses an answer for another professor and stores nothing', async () => {
    localStorage.setItem('peer_eval_token', 'old');
    axios.post.mockResolvedValue({ data: { access_token: 'new', professor: { ...professor, id: 'p2' } } });
    await expect(logInAgain(account, 'secret')).rejects.toMatchObject({ code: WRONG_ACCOUNT });
    expect(localStorage.getItem('peer_eval_token')).toBe('old');
  });

  test('says when the account needs MFA, and stores nothing', async () => {
    localStorage.setItem('peer_eval_token', 'old');
    axios.post.mockResolvedValue({ data: { mfa_required: true, professor_id: 'p1' } });
    await expect(logInAgain(account, 'secret')).rejects.toMatchObject({ code: MFA_REQUIRED });
    expect(localStorage.getItem('peer_eval_token')).toBe('old');
  });

  test('stores nothing when the attempt was given up while the request was out', async () => {
    localStorage.setItem('peer_eval_token', 'old');
    axios.post.mockResolvedValue({ data: { access_token: 'new', professor } });
    await expect(logInAgain(account, 'secret', () => false)).rejects.toMatchObject({ code: CANCELLED });
    expect(localStorage.getItem('peer_eval_token')).toBe('old');
  });

  test('stores nothing when the stored login changed while the request was out (another login, a logout)', async () => {
    localStorage.setItem('peer_eval_token', 'old');
    axios.post.mockImplementation(async () => {
      localStorage.setItem('peer_eval_token', 'someone-elses');
      return { data: { access_token: 'new', professor } };
    });
    await expect(logInAgain(account, 'secret')).rejects.toMatchObject({ code: LOGIN_CHANGED });
    expect(localStorage.getItem('peer_eval_token')).toBe('someone-elses');

    localStorage.setItem('peer_eval_token', 'old');
    axios.post.mockImplementation(async () => {
      localStorage.removeItem('peer_eval_token');
      return { data: { access_token: 'new', professor } };
    });
    await expect(logInAgain(account, 'secret')).rejects.toMatchObject({ code: LOGIN_CHANGED });
    expect(localStorage.getItem('peer_eval_token')).toBeNull();
  });

  test('passes a wrong password or a rate limit through and stores nothing', async () => {
    localStorage.setItem('peer_eval_token', 'old');
    const failure = Object.assign(new Error('401'), { response: { status: 401, data: { error: { message: 'Invalid email or password.' } } } });
    axios.post.mockRejectedValue(failure);
    await expect(logInAgain(account, 'bad')).rejects.toBe(failure);
    expect(localStorage.getItem('peer_eval_token')).toBe('old');
  });
});
