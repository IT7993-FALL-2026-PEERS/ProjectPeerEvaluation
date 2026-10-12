import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Alert, Button, Snackbar } from '@mui/material';
import { useAuth } from '../contexts/AuthContext';
import { SESSION_EXPIRED_EVENT } from '../services/sessionExpired';

// Shown over whatever page is open when the login token has expired (see services/sessionExpired.js).
// The page behind it stays as it was; Log in forgets the old login and goes to the login page.
function SessionExpiredBanner() {
  const [expired, setExpired] = useState(false);
  const navigate = useNavigate();
  const { logout } = useAuth();

  useEffect(() => {
    const show = () => setExpired(true);
    window.addEventListener(SESSION_EXPIRED_EVENT, show);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, show);
  }, []);

  const logInAgain = () => {
    logout();
    setExpired(false);
    navigate('/', { replace: true });
  };

  return (
    <Snackbar open={expired} anchorOrigin={{ vertical: 'top', horizontal: 'center' }}>
      <Alert
        severity="warning"
        variant="filled"
        action={<Button color="inherit" size="small" onClick={logInAgain}>Log in</Button>}
      >
        Session timed out. Please log-in again!
      </Alert>
    </Snackbar>
  );
}

export default SessionExpiredBanner;
