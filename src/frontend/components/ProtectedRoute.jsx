import React, { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import api from '../services/api';
import { readSessionToken, secondsLeft } from '../services/sessionActivity';

// The stored login reads as run out. Only the token's own dates can say so; one that cannot be read is left
// to the first request of the page.
const looksExpired = () => {
  const left = secondsLeft();
  return left !== null && left <= 0;
};

// The page waits for the server's answer, so the question gets a short time limit of its own (the request
// layer allows three minutes, for sending email). No answer in time shows the page, like any other failure.
const CHECK_TIMEOUT_MS = 10000;

// Professor pages need the login token the backend checks. Without one, go to the
// login page instead of showing a dashboard whose API calls all fail. The token is
// read directly (not from AuthContext) because the stored user is only restored
// after the first render.
//
// A stored login that has run out is no better than none (CICD-85): the page opened empty under the
// 'session timed out' banner. A page that has only just opened has no work to keep, so the login is forgotten
// and the login page shown. The browser's clock can be wrong, so the server is asked first (the same check
// the login page and the session countdown make) and the page waits for the answer. Anything but a refusal
// shows the page. A login that runs out while the page is open is still the banner's job.
function ProtectedRoute({ children }) {
  const { logout } = useAuth();
  const [checking, setChecking] = useState(looksExpired);

  useEffect(() => {
    if (!checking) return undefined;
    // An answer counts only while this question is the current one. React asks twice in development and gives the
    // first up, and a page can be left before the answer comes: a late refusal must not log the professor out of a
    // page the other question has already opened (Codex review, Nov 9).
    let current = true;
    const sentWith = readSessionToken();
    Promise.resolve(api.post('/auth/refresh', {}, { timeout: CHECK_TIMEOUT_MS }))
      .catch((failure) => {
        // Only if the login that was refused is still the one stored (another tab may have logged in meanwhile).
        if (current && failure && failure.response && failure.response.status === 401 && readSessionToken() === sentWith) logout();
      })
      .finally(() => { if (current) setChecking(false); });
    return () => { current = false; };
    // Asked once, when the page opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!readSessionToken()) {
    return <Navigate to="/" replace />;
  }
  return checking ? null : children;
}

export default ProtectedRoute;
