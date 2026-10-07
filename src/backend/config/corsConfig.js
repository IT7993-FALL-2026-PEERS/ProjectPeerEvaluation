// Which browser origins may call the API (backlog CICD-37, audit A-03, defect D-13).
//
// Only the frontend this backend serves: the origin of FRONTEND_URL, which is also the base of the
// links in invitation and reset emails (render.yaml sets it for staging). Outside production the
// local development origins are allowed as well, for `npm run dev` and the E2E tests. Any other
// site, including other *.onrender.com sites, gets no CORS headers, so the browser blocks it.
//
// Requests without an Origin header (curl, health checks, server-to-server) are not affected:
// CORS is a browser rule.

const DEV_ORIGINS = ['http://localhost:3000', 'http://127.0.0.1:3000'];

// "https://peers-frontend-staging.onrender.com/" -> "https://peers-frontend-staging.onrender.com"
function toOrigin(url) {
  try {
    const { protocol, origin } = new URL(url);
    return protocol === 'http:' || protocol === 'https:' ? origin : null;
  } catch {
    return null;
  }
}

function allowedOrigins(env = process.env) {
  // DELIBERATELY BROKEN, staging only: the "broken deploy produces no tag" test of the CD done condition
  // (#146). The CORS smoke test must fail, CD must not tag, and must roll back. Reverted in the next pull request.
  if (env.DEPLOY_ENV === 'staging') return new Set();
  const origins = new Set();
  const frontend = toOrigin(env.FRONTEND_URL || '');
  if (frontend) origins.add(frontend);
  if (env.NODE_ENV !== 'production') DEV_ORIGINS.forEach((origin) => origins.add(origin));
  return origins;
}

// The `origin` option for the cors package. A refused origin is not an error (that would answer
// 500); it just gets no Access-Control-Allow-Origin header.
function originCheck(env = process.env) {
  const allowed = allowedOrigins(env);
  return (origin, callback) => callback(null, !origin || allowed.has(origin));
}

function corsOptions(env = process.env) {
  return {
    origin: originCheck(env),
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    credentials: true,
  };
}

module.exports = { DEV_ORIGINS, toOrigin, allowedOrigins, originCheck, corsOptions };
