import { SESSION_EXPIRED_EVENT, isSessionExpired, notifySessionExpired } from '../sessionExpired';

// An expired login token makes the backend answer 401 "Invalid or expired token", and the pages
// then showed only their own generic message ("Failed to fetch courses"). This decides which failures
// mean "your session timed out", so the app can say so once.
const failure = (status, url, headers = { Authorization: 'Bearer abc' }) => ({ response: { status }, config: { url, headers } });

describe('isSessionExpired', () => {
  test('is true for a 401 on a request that carried a login token', () => {
    expect(isSessionExpired(failure(401, '/courses'))).toBe(true);
    expect(isSessionExpired(failure(401, '/courses/c1/teams'))).toBe(true);
  });

  test.each(['/auth/login', '/auth/reset-password', '/auth/update-password'])(
    'is false for a 401 from %s, which means wrong credentials or a bad link, not an expired session',
    (url) => {
      expect(isSessionExpired(failure(401, url))).toBe(false);
    }
  );

  test('is false for a 401 on a request that carried no token', () => {
    expect(isSessionExpired(failure(401, '/courses', {}))).toBe(false);
    expect(isSessionExpired({ response: { status: 401 }, config: { url: '/courses' } })).toBe(false);
  });

  test.each([400, 403, 404, 410, 500, 503])('is false for a %i', (status) => {
    expect(isSessionExpired(failure(status, '/courses'))).toBe(false);
  });

  test('is false when the server never answered', () => {
    expect(isSessionExpired({ message: 'Network Error', config: { url: '/courses', headers: { Authorization: 'Bearer abc' } } })).toBe(false);
    expect(isSessionExpired(undefined)).toBe(false);
  });
});

describe('notifySessionExpired', () => {
  test('fires the session-expired event on the window', () => {
    const handler = vi.fn();
    window.addEventListener(SESSION_EXPIRED_EVENT, handler);
    notifySessionExpired();
    window.removeEventListener(SESSION_EXPIRED_EVENT, handler);
    expect(handler).toHaveBeenCalledTimes(1);
  });
});
