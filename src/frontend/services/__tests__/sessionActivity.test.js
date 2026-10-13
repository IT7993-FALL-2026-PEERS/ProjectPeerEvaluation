import {
  ACTIVITY_EVENTS,
  KEEPALIVE_AFTER_SECONDS,
  WARN_BEFORE_SECONDS,
  MAX_CLOCK_SAMPLE_MS,
  clockNow,
  getTokenTimes,
  learnServerTime,
  resetServerClock,
  secondsLeft,
  setServerTime,
  tokenAgeSeconds,
} from '../sessionActivity';

// FR-04: the browser works out how long the professor's login has left by reading the dates inside the
// login token (the server signs them; the browser only reads). No secret is needed to read them.
const b64url = (value) => btoa(JSON.stringify(value)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fakeToken = (claims) => `${b64url({ alg: 'HS256', typ: 'JWT' })}.${b64url(claims)}.signature`;

const NOW = Date.UTC(2026, 9, 13, 12, 0, 0);
const seconds = (ms) => ms / 1000;

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  resetServerClock();
});

// Codex review, second pass (13 Oct): the token's dates come from the server's clock, so the time left is
// worked out against the server's time, not the browser's, which can be minutes off.
describe('sessionActivity: the server clock', () => {
  afterEach(() => vi.useRealTimers());

  test('by default the browser clock is used', () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    expect(clockNow()).toBe(NOW);
  });

  test('after the server says what time it is, the browser clock is corrected by the difference', () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW + 5 * 60 * 1000); // the browser is 5 minutes ahead
    setServerTime(NOW);
    expect(clockNow()).toBe(NOW);
    vi.setSystemTime(NOW + 6 * 60 * 1000); // a minute later by the browser
    expect(clockNow()).toBe(NOW + 60 * 1000);
  });

  test('seconds left and token age follow the server time when no time is passed in', () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW + 5 * 60 * 1000);
    localStorage.setItem('peer_eval_token', fakeToken({ iat: seconds(NOW) - 600, exp: seconds(NOW) + 3000 }));
    expect(secondsLeft()).toBe(2700); // against the browser clock it would look like 2700 seconds too few
    setServerTime(NOW);
    expect(secondsLeft()).toBe(3000);
    expect(tokenAgeSeconds()).toBe(600);
  });

  // Codex review, third pass (13 Oct): the server stamps the time when the request arrives, not when the answer
  // comes back, so a slow answer must not be read as "the server's time is now".
  describe('learning the server time from one request', () => {
    test('a quick answer is trusted, with the server stamp taken to be halfway through the round trip', () => {
      vi.useFakeTimers();
      vi.setSystemTime(NOW);
      learnServerTime(NOW + 5 * 60 * 1000 + 100, NOW, NOW + 200); // the server is 5 minutes ahead; the trip took 200 ms
      expect(clockNow()).toBe(NOW + 5 * 60 * 1000);
    });

    test('a slow answer is ignored, and an offset learned earlier is kept', () => {
      vi.useFakeTimers();
      vi.setSystemTime(NOW);
      setServerTime(NOW + 1000); // a good earlier sample: the server is 1 second ahead
      learnServerTime(NOW + 1000, NOW, NOW + 150 * 1000); // the request took 150 seconds
      expect(clockNow()).toBe(NOW + 1000);
    });

    test('the limit is exact', () => {
      vi.useFakeTimers();
      vi.setSystemTime(NOW);
      expect(MAX_CLOCK_SAMPLE_MS).toBe(5000);
      learnServerTime(NOW + 10 * 1000, NOW, NOW + MAX_CLOCK_SAMPLE_MS); // exactly at the limit: used
      expect(clockNow()).toBe(NOW + 10 * 1000 - MAX_CLOCK_SAMPLE_MS / 2);
      resetServerClock();
      learnServerTime(NOW + 10 * 1000, NOW, NOW + MAX_CLOCK_SAMPLE_MS + 1); // one millisecond over: ignored
      expect(clockNow()).toBe(NOW);
    });

    test('a request with no send time, or a time that does not make sense, is ignored', () => {
      vi.useFakeTimers();
      vi.setSystemTime(NOW);
      for (const [server, sent, received] of [[NOW, undefined, NOW], [NOW, NOW, undefined], [NaN, NOW, NOW], [NOW, NOW + 10, NOW]]) {
        learnServerTime(server, sent, received);
      }
      expect(clockNow()).toBe(NOW);
    });
  });

  test('a time that is not a number is ignored', () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    for (const bad of [undefined, null, NaN, 'abc', Infinity]) setServerTime(bad);
    expect(clockNow()).toBe(NOW);
  });

  test('resetting forgets the correction', () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW + 1000);
    setServerTime(NOW);
    resetServerClock();
    expect(clockNow()).toBe(NOW + 1000);
  });
});

describe('sessionActivity: what counts as activity', () => {
  test('clicks, key presses, scrolling and touch count; moving the mouse does not', () => {
    expect([...ACTIVITY_EVENTS].sort()).toEqual(['click', 'keydown', 'scroll', 'touchstart']);
    expect(ACTIVITY_EVENTS).not.toContain('mousemove');
  });

  test('the keep-alive is sent at most every 5 minutes, and the warning shows 2 minutes before the end', () => {
    expect(KEEPALIVE_AFTER_SECONDS).toBe(5 * 60);
    expect(WARN_BEFORE_SECONDS).toBe(2 * 60);
  });
});

describe('sessionActivity: reading the login token', () => {
  test('no login means no times', () => {
    expect(getTokenTimes()).toBeNull();
    expect(secondsLeft(NOW)).toBeNull();
    expect(tokenAgeSeconds(NOW)).toBeNull();
  });

  test('reads when the token was issued and when it expires, in milliseconds', () => {
    localStorage.setItem('peer_eval_token', fakeToken({ id: 'p1', iat: seconds(NOW) - 600, exp: seconds(NOW) + 3000 }));
    expect(getTokenTimes()).toEqual({ issuedAt: NOW - 600 * 1000, expiresAt: NOW + 3000 * 1000 });
  });

  test('seconds left count down to the expiry and go negative after it; the age counts up from the issue time', () => {
    localStorage.setItem('peer_eval_token', fakeToken({ iat: seconds(NOW) - 600, exp: seconds(NOW) + 3000 }));
    expect(secondsLeft(NOW)).toBe(3000);
    expect(secondsLeft(NOW + 2999 * 1000)).toBe(1);
    expect(secondsLeft(NOW + 3001 * 1000)).toBeLessThan(0);
    expect(tokenAgeSeconds(NOW)).toBe(600);
  });

  test('a token whose payload uses the URL-safe characters - and _ is read correctly', () => {
    const token = fakeToken({ iat: seconds(NOW) - 60, exp: seconds(NOW) + 600, name: '>>>>>>>>>>>>???????????????>>>>' });
    expect(token.split('.')[1]).toMatch(/[-_]/); // the case this test is about really is in the token
    localStorage.setItem('peer_eval_token', token);
    expect(secondsLeft(NOW)).toBe(600);
  });

  test('a part of a second left still counts as a whole second, so the countdown never shows 0:00 early', () => {
    localStorage.setItem('peer_eval_token', fakeToken({ iat: 1, exp: seconds(NOW) + 3000 }));
    expect(secondsLeft(NOW + 500)).toBe(3000);
    expect(secondsLeft(NOW + 999)).toBe(3000);
    expect(secondsLeft(NOW + 1000)).toBe(2999);
  });

  test('a login kept only for this browser session is read too; the persistent one wins when both exist', () => {
    sessionStorage.setItem('peer_eval_session', fakeToken({ iat: 1, exp: seconds(NOW) + 100 }));
    expect(secondsLeft(NOW)).toBe(100);
    localStorage.setItem('peer_eval_token', fakeToken({ iat: 1, exp: seconds(NOW) + 200 }));
    expect(secondsLeft(NOW)).toBe(200);
  });

  test.each([
    ['not a token', 'garbage'],
    ['two parts only', 'a.b'],
    ['a payload that is not JSON', 'a.!!!.c'],
    ['no expiry', fakeToken({ iat: 1 })],
    ['no issue time', fakeToken({ exp: 1 })],
    ['dates that are not numbers', fakeToken({ iat: 'x', exp: 'y' })],
  ])('%s gives no times and does not throw', (_name, token) => {
    localStorage.setItem('peer_eval_token', token);
    expect(getTokenTimes()).toBeNull();
    expect(secondsLeft(NOW)).toBeNull();
  });
});
