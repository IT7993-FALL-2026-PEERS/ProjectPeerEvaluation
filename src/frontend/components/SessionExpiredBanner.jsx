import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert, Button, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle, Snackbar, TextField,
} from '@mui/material';
import { useAuth } from '../contexts/AuthContext';
import { SESSION_EXPIRED_EVENT } from '../services/sessionExpired';
import { getTokenProfessorId, secondsLeft } from '../services/sessionActivity';
import { CANCELLED, LOGIN_CHANGED, logInAgain, MFA_REQUIRED, WRONG_ACCOUNT } from '../services/sessionLogin';

const REFUSALS = {
  [WRONG_ACCOUNT]: 'That login belongs to another account. Use the login page.',
  [MFA_REQUIRED]: 'This account needs the full login page.',
  [LOGIN_CHANGED]: 'Your login changed in another tab. Use the login page.',
};

function failureText(error) {
  if (error && REFUSALS[error.code]) return REFUSALS[error.code];
  const data = error && error.response && error.response.data;
  return (data && data.error && data.error.message) || (data && data.message) || 'Could not log in. Try again.';
}

// Shown over whatever page is open when the login token has expired (see services/sessionExpired.js).
// The page behind it stays as it was, so what the professor was typing is still there. Log in opens a
// dialog that signs the same professor back in on this page; only "Use the login page" leaves it.
function SessionExpiredBanner() {
  const [expired, setExpired] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  const { currentUser, login, logout } = useAuth();
  // The listener below is set up once; it reads who is logged in through this.
  const loggedIn = useRef(currentUser);
  useEffect(() => { loggedIn.current = currentUser; }, [currentUser]);
  // Which log-in attempt is the current one. Giving one up (or starting another) moves this on, and an answer
  // that arrives for an older one is ignored.
  const attempt = useRef(0);
  const field = useRef(null);

  useEffect(() => {
    const show = () => {
      setExpired(true);
      // With a form open its dialog traps the keyboard, so the banner behind it cannot be reached: open the
      // log-in dialog above the form instead (the form stays as it is underneath).
      const who = loggedIn.current;
      if (who && who.id && who.email && document.querySelector('[aria-modal="true"]')) setDialogOpen(true);
    };
    // Another tab logged in again: the shared login is fresh, so this tab's banner is out of date. Only if it
    // is the same professor: this page's forms are theirs, and a save must not carry on as someone else.
    const loginChanged = () => {
      const who = loggedIn.current;
      if (secondsLeft() > 0 && who && getTokenProfessorId() === String(who.id)) {
        attempt.current += 1;
        setExpired(false);
        setDialogOpen(false);
        setPassword('');
        setError('');
        setBusy(false);
      }
    };
    window.addEventListener(SESSION_EXPIRED_EVENT, show);
    window.addEventListener('storage', loginChanged);
    return () => {
      window.removeEventListener(SESSION_EXPIRED_EVENT, show);
      window.removeEventListener('storage', loginChanged);
    };
  }, []);

  const closeDialog = () => {
    attempt.current += 1;
    setBusy(false);
    setDialogOpen(false);
    setPassword('');
    setError('');
  };

  const goToLoginPage = () => {
    logout();
    setExpired(false);
    closeDialog();
    navigate('/', { replace: true });
  };

  // With no stored user there is nobody to log back in as: go to the login page, as before.
  const canLogInHere = Boolean(currentUser && currentUser.id && currentUser.email);
  const onLogIn = () => (canLogInHere ? setDialogOpen(true) : goToLoginPage());

  const submit = async (event) => {
    event.preventDefault();
    if (busy || !password) return;
    const typed = password;
    attempt.current += 1;
    const mine = attempt.current;
    // The password is not kept once it is on its way, whatever the answer.
    setPassword('');
    setError('');
    setBusy(true);
    try {
      const professor = await logInAgain({ id: currentUser.id, email: currentUser.email }, typed, () => attempt.current === mine);
      if (attempt.current !== mine) return;
      login(professor);
      setExpired(false);
      closeDialog();
    } catch (failure) {
      if (attempt.current !== mine || (failure && failure.code === CANCELLED)) return;
      setError(failureText(failure));
      setBusy(false);
    }
  };

  // After a failed attempt the locked field is enabled again; put the cursor back in it.
  useEffect(() => {
    if (dialogOpen && !busy && error && field.current) field.current.focus();
  }, [dialogOpen, busy, error]);

  return (
    <>
      <Snackbar open={expired} anchorOrigin={{ vertical: 'top', horizontal: 'center' }}>
        <Alert
          severity="warning"
          variant="filled"
          action={<Button color="inherit" size="small" onClick={onLogIn}>Log in</Button>}
        >
          Session timed out. Log in again to keep your work.
        </Alert>
      </Snackbar>
      <Dialog
        open={dialogOpen}
        onClose={closeDialog}
        aria-labelledby="relogin-title"
        slotProps={{ paper: { component: 'form', onSubmit: submit } }}
      >
        <DialogTitle id="relogin-title">Log in again</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Log in as {currentUser && currentUser.email} to carry on where you were. Nothing on this page is lost until you leave it.
          </DialogContentText>
          {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}
          <TextField
            autoFocus
            fullWidth
            margin="normal"
            label="Password"
            type="password"
            autoComplete="current-password"
            value={password}
            disabled={busy}
            inputRef={field}
            onChange={(event) => setPassword(event.target.value)}
          />
          <DialogContentText variant="caption">
            Use the login page to start over; unsaved work on this page is lost.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={goToLoginPage}>Use the login page</Button>
          <Button onClick={closeDialog}>Cancel</Button>
          <Button type="submit" variant="contained" disabled={busy || !password}>Log in</Button>
        </DialogActions>
      </Dialog>
    </>
  );
}

export default SessionExpiredBanner;
