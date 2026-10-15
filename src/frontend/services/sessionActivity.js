// Session timeout on the browser side (FR-04). The server ends a professor's session after a period
// of inactivity: it signs a login token that expires in 60 minutes and swaps in a fresh one whenever
// the professor is active (see backend utils/sessionToken.js). Here the browser works out how much
// time is left by reading the dates inside that token. It only reads them: the server signs the token
// and decides whether it is valid, so nothing here can extend a session by itself.

// What counts as the professor being there: clicking, typing, scrolling or touching the page.
// Moving the mouse does not: it cannot tell someone reading from someone who has walked away.
export const ACTIVITY_EVENTS = ['click', 'keydown', 'scroll', 'touchstart'];

// The server is asked to extend the login, at most this often (the token's age is the clock).
export const KEEPALIVE_AFTER_SECONDS = 5 * 60;

// With this much time left and no activity, the professor is asked whether to stay logged in.
export const WARN_BEFORE_SECONDS = 5 * 60;

// The token's dates come from the server's clock; the browser's can be minutes off. Every authenticated
// answer carries the server's time (X-Server-Time), and the difference is remembered here so the time left
// is worked out against the server's clock (Codex review, 13 Oct).
let serverOffsetMs = 0;

export function setServerTime(serverMs, clientMs = Date.now()) {
  if (typeof serverMs === 'number' && Number.isFinite(serverMs)) serverOffsetMs = serverMs - clientMs;
}

// The server stamps its time when the request arrives, somewhere between the browser sending the request and
// the answer coming back. A quick round trip pins that down to a second or so; a slow one (the request layer
// allows three minutes) does not, and treating its stamp as "now" would put the clock minutes behind and the
// warning after the real expiry. So only a quick round trip is used, with the stamp taken to be halfway through
// it, and a slow one leaves what was learned before (Codex review, third pass, 13 Oct).
export const MAX_CLOCK_SAMPLE_MS = 5000;

export function learnServerTime(serverMs, sentAtMs, receivedAtMs) {
  if (![serverMs, sentAtMs, receivedAtMs].every((value) => typeof value === 'number' && Number.isFinite(value))) return;
  const roundTrip = receivedAtMs - sentAtMs;
  if (roundTrip < 0 || roundTrip > MAX_CLOCK_SAMPLE_MS) return;
  setServerTime(serverMs, sentAtMs + roundTrip / 2);
}

export function resetServerClock() {
  serverOffsetMs = 0;
}

// Now, by the server's clock as far as it is known.
export function clockNow() {
  return Date.now() + serverOffsetMs;
}

export function readSessionToken() {
  return localStorage.getItem('peer_eval_token') || sessionStorage.getItem('peer_eval_session');
}

function readClaims(token) {
  const parts = String(token).split('.');
  if (parts.length !== 3) return null;
  try {
    const claims = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
    return claims && typeof claims === 'object' ? claims : null;
  } catch {
    return null;
  }
}

// The professor id the login token was issued for, or null when there is no readable login.
export function getTokenProfessorId(token = readSessionToken()) {
  const claims = token ? readClaims(token) : null;
  return claims && claims.id !== undefined ? String(claims.id) : null;
}

// { issuedAt, expiresAt } in milliseconds, or null when there is no login or the token is unreadable.
export function getTokenTimes(token = readSessionToken()) {
  if (!token) return null;
  const claims = readClaims(token);
  if (!claims || !Number.isFinite(claims.iat) || !Number.isFinite(claims.exp)) return null;
  return { issuedAt: claims.iat * 1000, expiresAt: claims.exp * 1000 };
}

// Whole seconds until the login expires (0 or less once it has), or null when there is no login.
export function secondsLeft(now = clockNow()) {
  const times = getTokenTimes();
  return times ? Math.ceil((times.expiresAt - now) / 1000) : null;
}

// Whole seconds since the login token was issued, or null when there is no login.
export function tokenAgeSeconds(now = clockNow()) {
  const times = getTokenTimes();
  return times ? Math.floor((now - times.issuedAt) / 1000) : null;
}
