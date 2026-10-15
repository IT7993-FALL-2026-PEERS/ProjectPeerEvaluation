// Decides when a failed request means the professor's login token expired, and tells the app.
//
// The backend answers 401 "Invalid or expired token" once the token's hour is up. Each page used to
// turn that into its own generic message ("Failed to fetch courses"), so the professor could not tell
// what had happened. The request layer calls this once for every failure, and the banner at the top of
// the app (components/SessionExpiredBanner.jsx) says it.
import { readSessionToken } from './sessionActivity';

export const SESSION_EXPIRED_EVENT = 'peers:session-expired';

// Login and password-reset calls also answer 401 (wrong password, bad link). That is not a timed-out session.
const AUTH_PATH = '/auth/';

// True for a 401 on a request that carried the login token. A request with no token (a student's
// evaluation link, a visitor) cannot have an expired session.
export function isSessionExpired(error) {
  if (!error || !error.response || error.response.status !== 401) return false;
  const config = error.config || {};
  if (String(config.url || '').includes(AUTH_PATH)) return false;
  return Boolean(config.headers && config.headers.Authorization);
}

// A 401 for a request sent with a login that has since been replaced (the professor logged in again
// while it was on its way) says nothing about the current login.
export function sentWithCurrentLogin(error) {
  const sent = String(error?.config?.headers?.Authorization || '').replace(/^Bearer /, '');
  return Boolean(sent) && sent === readSessionToken();
}

export function notifySessionExpired() {
  window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
}
