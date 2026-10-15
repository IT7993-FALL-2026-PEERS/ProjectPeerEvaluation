import axios from 'axios';
import { getApiBaseUrl } from './apiUrl';
import { isSessionExpired, notifySessionExpired, sentWithCurrentLogin } from './sessionExpired';
import { learnServerTime } from './sessionActivity';

const API_BASE_URL = getApiBaseUrl();

console.log('Environment Detection:', {
  NODE_ENV: process.env.NODE_ENV,
  hostname: window.location.hostname,
  API_BASE_URL: API_BASE_URL
});

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 180000, // 3 minute timeout for email sending in production
});

// While the professor keeps working, the server answers with a fresh login token in X-Access-Token
// (FR-04: the session ends after a period of inactivity). Keep it where the old one was, but only if the
// login is still the one the request was sent with. An answer that arrives late (after a log out and a
// login as someone else, after another tab renewed the login, or behind a newer answer) is dropped, so it
// can never replace a newer login or bring back one that was ended (Codex review, 13 Oct).
function storeRenewedToken(token, sentAuthorization) {
  const sent = String(sentAuthorization || '').replace(/^Bearer /, '');
  if (!sent) return;
  if (localStorage.getItem('peer_eval_token') === sent) localStorage.setItem('peer_eval_token', token);
  else if (sessionStorage.getItem('peer_eval_session') === sent) sessionStorage.setItem('peer_eval_session', token);
}

// Attach JWT token from localStorage/sessionStorage to every request
api.interceptors.request.use(
  (config) => {
    // Try localStorage first, then sessionStorage
    // When the request leaves, so the server time in the answer can be placed within the round trip.
    config.metadata = { ...config.metadata, sentAt: Date.now() };
    const token = localStorage.getItem('peer_eval_token') || sessionStorage.getItem('peer_eval_session');
    console.log('API Request - Token found:', !!token);
    console.log('API Request - Token preview:', token ? `${token.substring(0, 20)}...` : 'none');
    if (token) {
      config.headers['Authorization'] = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Add response interceptor for better error handling
api.interceptors.response.use(
  (response) => {
    console.log('API Response received:', response.status, response.config.method?.toUpperCase(), response.config.url);
    // Log Render service info from headers
    if (response.headers['rndr-id']) {
      console.log('Render Service ID:', response.headers['rndr-id']);
    }
    if (response.headers['server']) {
      console.log('Server Info:', response.headers['server']);
    }
    // The server's clock, so the time left on the login does not depend on this browser's clock.
    if (response.headers['x-server-time']) {
      learnServerTime(Number(response.headers['x-server-time']), response.config?.metadata?.sentAt, Date.now());
    }
    if (response.headers['x-access-token']) {
      storeRenewedToken(response.headers['x-access-token'], response.config?.headers?.Authorization);
    }
    return response;
  },
  (error) => {
    console.error('API Error Details:', {
      status: error.response?.status,
      message: error.response?.data?.message || error.message,
      url: error.config?.url,
      method: error.config?.method?.toUpperCase(),
      timeout: error.code === 'ECONNABORTED',
      networkError: error.code === 'ERR_NETWORK',
      baseURL: error.config?.baseURL
    });
    
    // Provide more specific error messages
    if (error.code === 'ECONNABORTED') {
      console.error('Request timed out - server may be overloaded or unresponsive');
      error.userMessage = 'Request timed out. The server may be busy, please try again.';
    } else if (error.code === 'ERR_NETWORK' || !error.response) {
      console.error('Network error - cannot reach backend server');
      error.userMessage = `Cannot connect to backend server at ${error.config?.baseURL}. Please check if the backend is running.`;
    } else if (error.response?.status >= 500) {
      error.userMessage = 'Server error occurred. Please try again later.';
    }
    
    // An expired login token: say so once, whatever page the request came from.
    if (isSessionExpired(error) && sentWithCurrentLogin(error)) notifySessionExpired();

    return Promise.reject(error);
  }
);

// Fetch a single course by ID
export const getCourseById = async (courseId) => {
  const response = await api.get(`/courses/${courseId}`);
  return response.data;
};

export default api;