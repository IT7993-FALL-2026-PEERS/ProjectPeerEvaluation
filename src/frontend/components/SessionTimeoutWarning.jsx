import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle } from '@mui/material';
import { useAuth } from '../contexts/AuthContext';
import api from '../services/api';
import { notifySessionExpired } from '../services/sessionExpired';
import {
  ACTIVITY_EVENTS,
  KEEPALIVE_AFTER_SECONDS,
  WARN_BEFORE_SECONDS,
  readSessionToken,
  secondsLeft,
  tokenAgeSeconds,
} from '../services/sessionActivity';

// A failed keep-alive is tried again no sooner than this.
const RETRY_AFTER_MS = 30 * 1000;

const clock = (seconds) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;

// FR-04: a professor's session ends after a period of inactivity. While the professor clicks, types,
// scrolls or touches the page, this asks the server to extend the login (at most every 5 minutes; the
// request layer stores the renewed token). With 2 minutes left and no activity it asks whether to stay
// logged in, and when the time is up it says so through the same banner a rejected request uses.
// Does nothing for a visitor with no login (the login page, a student's evaluation link).
function SessionTimeoutWarning() {
  const [remaining, setRemaining] = useState(null);
  const navigate = useNavigate();
  const { logout } = useAuth();
  const pending = useRef(false);
  const lastAttempt = useRef(0);
  const notified = useRef(false);

  // Returns whether a request was sent. With confirmExpiry, a 401 means the login really has run out, and
  // that is when the session-timed-out message is shown (the request layer ignores 401s from /auth/ paths).
  const keepAlive = useCallback(({ force = false, confirmExpiry = false } = {}) => {
    const now = Date.now();
    if (pending.current || (!force && now - lastAttempt.current < RETRY_AFTER_MS)) return false;
    lastAttempt.current = now;
    pending.current = true;
    const sentWith = readSessionToken();
    Promise.resolve(api.post('/auth/refresh', {}))
      .catch((error) => {
        // Only if the login that was refused is still the one stored: a refusal that arrives after another tab
        // logged in or renewed the login is about the old one (Codex review, third pass).
        if (confirmExpiry && error && error.response && error.response.status === 401 && readSessionToken() === sentWith) {
          notifySessionExpired();
        }
      })
      .finally(() => { pending.current = false; });
    return true;
  }, []);

  useEffect(() => {
    const onActivity = () => {
      // A login that only looks expired (the browser's clock can be wrong) is still sent: the server decides.
      if (secondsLeft() === null) return;
      if (tokenAgeSeconds() < KEEPALIVE_AFTER_SECONDS) return;
      keepAlive();
    };
    // Capture phase: scroll events do not bubble, and a scrolling list is not the window.
    ACTIVITY_EVENTS.forEach((type) => window.addEventListener(type, onActivity, { capture: true, passive: true }));

    const tick = () => {
      const left = secondsLeft();
      if (left === null) {
        notified.current = false;
        setRemaining(null);
      } else if (left <= 0) {
        // The login looks expired, but the browser's clock may be wrong: ask the server once, and say the
        // session timed out only if it refuses. A check that has to wait for another request is made on the
        // next second.
        if (!notified.current) notified.current = keepAlive({ force: true, confirmExpiry: true });
        setRemaining(null);
      } else {
        notified.current = false;
        setRemaining(left <= WARN_BEFORE_SECONDS ? left : null);
      }
    };
    const timer = setInterval(tick, 1000);

    return () => {
      ACTIVITY_EVENTS.forEach((type) => window.removeEventListener(type, onActivity, { capture: true }));
      clearInterval(timer);
    };
  }, [keepAlive]);

  const logOut = () => {
    logout();
    setRemaining(null);
    navigate('/', { replace: true });
  };

  return (
    <Dialog open={remaining !== null} aria-labelledby="session-warning-title">
      <DialogTitle id="session-warning-title">Your session is about to expire</DialogTitle>
      <DialogContent>
        <DialogContentText>
          You have been inactive. You will be logged out in {remaining === null ? '' : clock(remaining)}.
        </DialogContentText>
      </DialogContent>
      <DialogActions>
        <Button onClick={logOut}>Log out</Button>
        <Button variant="contained" onClick={() => keepAlive({ force: true })}>Stay logged in</Button>
      </DialogActions>
    </Dialog>
  );
}

export default SessionTimeoutWarning;
