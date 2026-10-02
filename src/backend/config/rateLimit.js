// Rate limits (API-5, backlog CICD-34). Limits are per client IP address and kept in memory,
// which is right for one server instance (Render runs one); with several instances each
// would count on its own, and a shared store would be needed.
//
//   login      failed attempts only (a successful login does not count)
//   signup     professor registration
//   reset      password reset requests (each one sends an email)
//   update     password updates with a reset token; separate from reset on purpose, so a burst of
//              reset requests from a shared address cannot block someone from using the link
//              they were just sent. The token is unguessable, so this is only a coarse safeguard.
//   evaluate   the public student evaluation links
//   general    every other /api route; /api/health is registered before this and never counts
//
// The client's address comes from X-Forwarded-For, so Express has to trust exactly the proxies
// in front of the app. On Render that is two: Cloudflare's edge and Render's load balancer
// (Render: "all inbound traffic passes through Cloudflare" first), each appending to the
// header, so the app sees "<client-supplied>, <client>, <edge>" and "trust proxy" must be 2
// (see trustProxyHops). Trusting too few picks the edge address, which comes from a pool and
// changes between requests, so one client's requests fall into different buckets (this was
// the first version, measured on staging 2 Oct); trusting too many lets a client choose its
// own address; trusting none gives every visitor one shared bucket.
const rateLimit = require('express-rate-limit');

const MINUTE = 60 * 1000;

const DEFAULT_LIMITS = Object.freeze({
  general: Object.freeze({ windowMs: 15 * MINUTE, limit: 1000 }),
  login: Object.freeze({ windowMs: 15 * MINUTE, limit: 10 }),
  signup: Object.freeze({ windowMs: 60 * MINUTE, limit: 10 }),
  reset: Object.freeze({ windowMs: 60 * MINUTE, limit: 5 }),
  update: Object.freeze({ windowMs: 60 * MINUTE, limit: 20 }),
  // Generous: a whole class can sit behind one campus address, and each student makes a
  // few requests (form, status, submit).
  evaluate: Object.freeze({ windowMs: 15 * MINUTE, limit: 600 }),
});

const ENV_NAMES = {
  general: 'RATE_LIMIT_GENERAL_MAX',
  login: 'RATE_LIMIT_LOGIN_MAX',
  signup: 'RATE_LIMIT_SIGNUP_MAX',
  reset: 'RATE_LIMIT_RESET_MAX',
  update: 'RATE_LIMIT_UPDATE_MAX',
  evaluate: 'RATE_LIMIT_EVALUATE_MAX',
};

function positiveInteger(raw) {
  if (typeof raw !== 'string' || raw.trim() === '') return undefined;
  const value = Number(raw);
  return Number.isInteger(value) && value > 0 ? value : undefined;
}

// Only the count can be tuned from the environment; a missing or invalid value keeps the default.
function readLimits(env = process.env) {
  const limits = {};
  for (const [name, defaults] of Object.entries(DEFAULT_LIMITS)) {
    limits[name] = { ...defaults, limit: positiveInteger(env[ENV_NAMES[name]]) ?? defaults.limit };
  }
  return limits;
}

// How many proxies sit in front of the app: 2 on Render (Cloudflare and its load balancer).
// TRUST_PROXY overrides it, for example 0 when running with no proxy; anything that is not a
// whole number (including "true") keeps 2, because trusting every proxy would let a client
// choose its own address.
const RENDER_PROXY_HOPS = 2;

function trustProxyHops(env = process.env) {
  const raw = env.TRUST_PROXY;
  if (typeof raw === 'string' && /^\d+$/.test(raw)) return Number(raw);
  return RENDER_PROXY_HOPS;
}

// Options for one limiter. A rejected request goes to the app's error handler, so the 429
// has the same { error: { code, message, details } } shape as every other error.
function limiterOptions({ windowMs, limit }, { what, countFailuresOnly = false }) {
  return {
    windowMs,
    limit,
    standardHeaders: 'draft-6',
    legacyHeaders: false,
    skipSuccessfulRequests: countFailuresOnly,
    handler: (req, res, next) => {
      const seconds = Math.max(1, Math.ceil((req.rateLimit.resetTime.getTime() - Date.now()) / 1000));
      const minutes = Math.ceil(seconds / 60);
      const err = new Error(`Too many ${what}. Please wait ${minutes} ${minutes === 1 ? 'minute' : 'minutes'} and try again.`);
      err.status = 429;
      err.code = 'RATE_LIMITED';
      err.details = { retry_after_seconds: seconds };
      next(err);
    },
  };
}

// Call after the health route and before the routers, so the limits apply to everything
// mounted later. The error handler must be registered after the routers, as before.
function applyRateLimits(app, limits = readLimits()) {
  app.use('/api', rateLimit(limiterOptions(limits.general, { what: 'requests' })));
  app.use('/api/auth/login', rateLimit(limiterOptions(limits.login, { what: 'login attempts', countFailuresOnly: true })));
  app.use('/api/auth/register', rateLimit(limiterOptions(limits.signup, { what: 'sign-up requests' })));
  app.use('/api/auth/reset-password', rateLimit(limiterOptions(limits.reset, { what: 'password reset requests' })));
  app.use('/api/auth/update-password', rateLimit(limiterOptions(limits.update, { what: 'password update attempts' })));
  app.use('/api/evaluate', rateLimit(limiterOptions(limits.evaluate, { what: 'requests to this evaluation link' })));
}

module.exports = { applyRateLimits, readLimits, trustProxyHops, DEFAULT_LIMITS };
