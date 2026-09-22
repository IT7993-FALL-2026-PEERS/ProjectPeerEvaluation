// Unit tests for src/frontend/config.js: pure environment-detection logic,
// no rendering. config.js reads process.env and window.location at module
// load time, so each test resets the module registry and re-requires it
// after arranging the environment it wants to observe.
describe('frontend runtime config (src/frontend/config.js)', () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...ORIGINAL_ENV };
    delete process.env.REACT_APP_API_URL;
    delete process.env.REACT_APP_FRONTEND_URL;
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  function setHostname(hostname) {
    Object.defineProperty(window, 'location', {
      value: { ...window.location, hostname },
      writable: true,
      configurable: true,
    });
  }

  test('defaults to localhost URLs in development on localhost', () => {
    process.env.NODE_ENV = 'development';
    setHostname('localhost');
    const { API_BASE_URL, BACKEND_ROOT_URL, FRONTEND_URL } = require('../../config');
    expect(API_BASE_URL).toBe('http://localhost:5000/api');
    expect(BACKEND_ROOT_URL).toBe('http://localhost:5000/');
    expect(FRONTEND_URL).toBe('http://localhost:3000');
  });

  test('falls back to the original Render URLs when hosted on onrender.com', () => {
    process.env.NODE_ENV = 'production';
    setHostname('projectpeerevaluation.onrender.com');
    const { API_BASE_URL, FRONTEND_URL } = require('../../config');
    expect(API_BASE_URL).toBe('https://peer-evaluation-backend.onrender.com/api');
    expect(FRONTEND_URL).toBe('https://peer-evaluation-frontend.onrender.com');
  });

  test('treats any non-localhost hostname as production, even with NODE_ENV=development', () => {
    setHostname('192.168.1.20');
    process.env.NODE_ENV = 'development';
    const { API_BASE_URL } = require('../../config');
    expect(API_BASE_URL).toBe('https://peer-evaluation-backend.onrender.com/api');
  });

  test('an explicit REACT_APP_API_URL always wins, overriding the production default', () => {
    process.env.NODE_ENV = 'production';
    process.env.REACT_APP_API_URL = 'https://peer-evaluation-backend-staging.onrender.com/api';
    setHostname('peer-evaluation-frontend-staging.onrender.com');
    const { API_BASE_URL, BACKEND_ROOT_URL } = require('../../config');
    expect(API_BASE_URL).toBe('https://peer-evaluation-backend-staging.onrender.com/api');
    // BACKEND_ROOT_URL is derived from API_BASE_URL by stripping /api.
    expect(BACKEND_ROOT_URL).toBe('https://peer-evaluation-backend-staging.onrender.com/');
  });

  test('an explicit REACT_APP_FRONTEND_URL always wins', () => {
    process.env.REACT_APP_FRONTEND_URL = 'https://peer-evaluation-frontend-staging.onrender.com';
    setHostname('localhost');
    const { FRONTEND_URL } = require('../../config');
    expect(FRONTEND_URL).toBe('https://peer-evaluation-frontend-staging.onrender.com');
  });
});
