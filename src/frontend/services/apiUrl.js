// Where the frontend sends API requests.
// Set REACT_APP_API_URL at build time (e.g. in render.yaml) to point a deployment at its
// own backend. Without it, localhost talks to the local backend and anything else falls
// back to the original Render backend, so existing deployments keep working.
const LOCAL_API_URL = 'http://localhost:5000/api';
const LEGACY_RENDER_API_URL = 'https://peer-evaluation-backend.onrender.com/api';

export function getApiBaseUrl({
  apiUrl = process.env.REACT_APP_API_URL,
  hostname = window.location.hostname,
} = {}) {
  if (apiUrl) return apiUrl.replace(/\/+$/, '');
  if (hostname === 'localhost' || hostname === '127.0.0.1') return LOCAL_API_URL;
  return LEGACY_RENDER_API_URL;
}
