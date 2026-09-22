// Unit tests for src/frontend/services/api.js. axios is fully mocked -- no
// network, no real axios instance -- so these exercise only this project's
// own glue code: the configured baseURL, the request interceptor that
// attaches a bearer token, and the response interceptor that turns raw
// axios errors into the userMessage strings the pages display.
jest.mock('axios', () => {
  const mockInstance = {
    get: jest.fn(),
    interceptors: {
      request: { use: jest.fn() },
      response: { use: jest.fn() },
    },
  };
  return {
    __mockInstance: mockInstance,
    create: jest.fn(() => mockInstance),
  };
});

import axios from 'axios';
import { API_BASE_URL } from '../../config';
import { getCourseById } from '../../services/api';

const mockInstance = axios.__mockInstance;
// api.js does all of this once, at module load (the import above) -- capture
// it right away, at file-evaluation time. CRA's jest config resets mock call
// history before each test runs, which would otherwise wipe out the record
// of this module-load-time call before the first test body executes.
const [createConfig] = axios.create.mock.calls[0];
const [onRequestFulfilled] = mockInstance.interceptors.request.use.mock.calls[0];
const [, onResponseRejected] = mockInstance.interceptors.response.use.mock.calls[0];

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

test('creates the shared axios instance with the app-wide base URL', () => {
  expect(createConfig).toEqual(expect.objectContaining({ baseURL: API_BASE_URL }));
});

test('getCourseById fetches /courses/:id and unwraps response.data', async () => {
  mockInstance.get.mockResolvedValueOnce({ data: { _id: 'c1', name: 'CS 101' } });

  const course = await getCourseById('c1');

  expect(mockInstance.get).toHaveBeenCalledWith('/courses/c1');
  expect(course).toEqual({ _id: 'c1', name: 'CS 101' });
});

describe('request interceptor', () => {
  test('attaches a bearer token found in localStorage', () => {
    localStorage.setItem('peer_eval_token', 'local-token-123');
    const config = onRequestFulfilled({ headers: {} });
    expect(config.headers['Authorization']).toBe('Bearer local-token-123');
  });

  test('falls back to a bearer token found in sessionStorage', () => {
    sessionStorage.setItem('peer_eval_session', 'session-token-456');
    const config = onRequestFulfilled({ headers: {} });
    expect(config.headers['Authorization']).toBe('Bearer session-token-456');
  });

  test('leaves the config untouched when there is no stored token', () => {
    const config = onRequestFulfilled({ headers: {} });
    expect(config.headers['Authorization']).toBeUndefined();
  });
});

describe('response error interceptor', () => {
  test('flags a timed-out request', async () => {
    await expect(
      onResponseRejected({ code: 'ECONNABORTED', config: {} })
    ).rejects.toMatchObject({
      userMessage: expect.stringMatching(/timed out/i),
    });
  });

  test('flags an unreachable backend, naming its base URL', async () => {
    await expect(
      onResponseRejected({ code: 'ERR_NETWORK', config: { baseURL: 'http://backend.example/api' } })
    ).rejects.toMatchObject({
      userMessage: expect.stringContaining('http://backend.example/api'),
    });
  });

  test('flags a server-side (5xx) failure', async () => {
    await expect(
      onResponseRejected({ response: { status: 500 }, config: {} })
    ).rejects.toMatchObject({
      userMessage: expect.stringMatching(/server error/i),
    });
  });

  test('leaves a normal 4xx error without a userMessage override', async () => {
    await expect(
      onResponseRejected({ response: { status: 404 }, config: {} })
    ).rejects.not.toHaveProperty('userMessage');
  });
});
