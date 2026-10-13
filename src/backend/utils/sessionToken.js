// Professor login tokens (FR-04). The session ends after a period of inactivity, not a fixed
// time after login: the token's own expiry is the idle limit, and a request made a minute or
// more after the token was issued is answered with a fresh one (see middleware/auth.js), so a
// professor who keeps working stays logged in and one who stops is logged out after the idle
// limit. `auth_at` records the original login and caps the total length, so a session cannot be
// kept alive for ever.
const jwt = require('jsonwebtoken');
const { getConfig } = require('../config/env');

const DEFAULT_IDLE_MINUTES = 60;
const DEFAULT_MAX_HOURS = 8;
// Signing is cheap, but there is no point in a new token for every request in the same minute.
const RENEW_AFTER_SECONDS = 60;

// Unset, zero, negative or unreadable means the default.
function positive(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function getSessionSettings(env = process.env) {
  return {
    idleSeconds: Math.round(positive(env.SESSION_IDLE_MINUTES, DEFAULT_IDLE_MINUTES) * 60),
    maxSeconds: Math.round(positive(env.SESSION_MAX_HOURS, DEFAULT_MAX_HOURS) * 60 * 60),
  };
}

// `now` is in milliseconds; `authAt` (seconds) is the original login time, carried over on renewal.
// The token never outlives the total limit: its expiry is the idle period from now, cut to authAt plus
// the limit, so the limit holds even for a token renewed a minute before it (Codex review, 13 Oct).
function signSessionToken(claims, { now = Date.now(), authAt, env = process.env } = {}) {
  const issuedAt = Math.floor(now / 1000);
  const loggedInAt = authAt === undefined ? issuedAt : authAt;
  const { idleSeconds, maxSeconds } = getSessionSettings(env);
  return jwt.sign(
    { ...claims, auth_at: loggedInAt, iat: issuedAt, exp: Math.min(issuedAt + idleSeconds, loggedInAt + maxSeconds) },
    getConfig().jwtSecret
  );
}

// True once the total limit since login has been reached. A token from before `auth_at` existed
// counts from when it was issued. The middleware refuses such a token whatever its own expiry says.
function isPastTotalLimit(payload, { now = Date.now(), env = process.env } = {}) {
  const loggedInAt = typeof payload.auth_at === 'number' ? payload.auth_at : payload.iat;
  if (typeof loggedInAt !== 'number') return false;
  return Math.floor(now / 1000) - loggedInAt >= getSessionSettings(env).maxSeconds;
}

// The fresh token for a request made with a valid token, or null when none is due: the token is
// less than a minute old, or the session has reached its total limit. A token from before
// `auth_at` existed counts as logged in when it was issued.
function renewSessionToken(payload, { now = Date.now(), env = process.env } = {}) {
  if (typeof payload.iat !== 'number') return null;
  const nowSeconds = Math.floor(now / 1000);
  if (nowSeconds - payload.iat < RENEW_AFTER_SECONDS) return null;
  if (isPastTotalLimit(payload, { now, env })) return null;
  const authAt = typeof payload.auth_at === 'number' ? payload.auth_at : payload.iat;
  const { iat, exp, auth_at, ...claims } = payload;
  return signSessionToken(claims, { now, authAt, env });
}

module.exports = { getSessionSettings, signSessionToken, renewSessionToken, isPastTotalLimit };
