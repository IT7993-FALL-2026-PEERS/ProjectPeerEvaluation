import { getApiBaseUrl } from '../apiUrl';

describe('getApiBaseUrl', () => {
  test('uses REACT_APP_API_URL when it is set', () => {
    expect(
      getApiBaseUrl({ apiUrl: 'https://peers-api-staging.onrender.com/api', hostname: 'peers-staging.onrender.com' })
    ).toBe('https://peers-api-staging.onrender.com/api');
  });

  test('drops a trailing slash from REACT_APP_API_URL', () => {
    expect(getApiBaseUrl({ apiUrl: 'https://api.example.com/api/', hostname: 'example.com' }))
      .toBe('https://api.example.com/api');
  });

  test('prefers REACT_APP_API_URL even on localhost', () => {
    expect(getApiBaseUrl({ apiUrl: 'http://localhost:5050/api', hostname: 'localhost' }))
      .toBe('http://localhost:5050/api');
  });

  test('falls back to the local backend on localhost', () => {
    expect(getApiBaseUrl({ hostname: 'localhost' })).toBe('http://localhost:5000/api');
    expect(getApiBaseUrl({ hostname: '127.0.0.1' })).toBe('http://localhost:5000/api');
  });

  test('falls back to the existing Render backend elsewhere', () => {
    expect(getApiBaseUrl({ hostname: 'peer-evaluation-frontend.onrender.com' }))
      .toBe('https://peer-evaluation-backend.onrender.com/api');
  });
});
