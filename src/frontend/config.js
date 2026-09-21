// Backend/frontend URLs, in one place. On Render these come from build-time
// env vars set in render.yaml (REACT_APP_* values are baked in by
// `react-scripts build`, so changing one requires a rebuild/redeploy of the
// static site). With none set, behavior matches what was previously
// hardcoded: localhost in development, the original Render URLs otherwise.
const isProduction = process.env.NODE_ENV === 'production' ||
                     window.location.hostname.includes('onrender.com') ||
                     window.location.hostname !== 'localhost';

export const API_BASE_URL = process.env.REACT_APP_API_URL ||
  (isProduction
    ? 'https://peer-evaluation-backend.onrender.com/api'
    : 'http://localhost:5000/api');

// API_BASE_URL without the trailing /api (the backend's root health route).
export const BACKEND_ROOT_URL = API_BASE_URL.replace(/\/api\/?$/, '/');

export const FRONTEND_URL = process.env.REACT_APP_FRONTEND_URL ||
  (isProduction
    ? 'https://peer-evaluation-frontend.onrender.com'
    : 'http://localhost:3000');
