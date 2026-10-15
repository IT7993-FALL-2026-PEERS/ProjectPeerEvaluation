import axios from 'axios';
import { getApiBaseUrl } from './apiUrl';
import { readSessionToken } from './sessionActivity';

export const WRONG_ACCOUNT = 'WRONG_ACCOUNT';
export const MFA_REQUIRED = 'MFA_REQUIRED';
// The attempt was given up while the request was out (Cancel, Use the login page, another tab).
export const CANCELLED = 'CANCELLED';
// The stored login is no longer the one the attempt started from (a logout, or another login).
export const LOGIN_CHANGED = 'LOGIN_CHANGED';

const refused = (code, message) => Object.assign(new Error(message), { code });

// The new token goes where the old one was kept.
function storeToken(token) {
  if (!localStorage.getItem('peer_eval_token') && sessionStorage.getItem('peer_eval_session')) {
    sessionStorage.setItem('peer_eval_session', token);
  } else {
    localStorage.setItem('peer_eval_token', token);
  }
}

// Logs the professor who was logged in back in, without touching the page. Plain axios on purpose: the
// expired token must not be sent, and a wrong password (401) is not a timed-out session.
// The answer can arrive long after the request left. Nothing is stored if the attempt was given up in the
// meantime (stillWanted() is false) or if the stored login is not the one the attempt started from, so a
// late answer can never undo a logout or overwrite another professor's login.
export async function logInAgain({ id, email }, password, stillWanted = () => true) {
  const before = readSessionToken();
  const { data } = await axios.post(`${getApiBaseUrl()}/auth/login`, { email, password });
  if (!stillWanted()) throw refused(CANCELLED, 'The attempt was given up.');
  if (data.mfa_required) throw refused(MFA_REQUIRED, 'This account needs the full login page.');
  if (!data.access_token || !data.professor || String(data.professor.id) !== String(id)) {
    throw refused(WRONG_ACCOUNT, 'That login belongs to another account.');
  }
  if (readSessionToken() !== before) throw refused(LOGIN_CHANGED, 'The login changed in the meantime.');
  storeToken(data.access_token);
  return data.professor;
}
