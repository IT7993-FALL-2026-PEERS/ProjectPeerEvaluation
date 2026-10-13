import React, { useState } from 'react';
import axios from 'axios';
import { getApiBaseUrl } from '../services/apiUrl';
import { useParams, useNavigate } from 'react-router-dom';

// The page the confirmation email links to (CW-11). Opening the link proves the professor owns the
// mailbox, so this is where the password is chosen: a new account has none until now, which means nobody
// who merely typed the address at registration can log in to it.
function VerifyEmail() {
  const { token } = useParams();
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [status, setStatus] = useState({ state: 'form', message: '' });

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!password) {
      setStatus({ state: 'form', message: 'Please choose a password.' });
      return;
    }
    if (password !== confirmation) {
      setStatus({ state: 'form', message: 'Passwords do not match.' });
      return;
    }
    try {
      const res = await axios.post(`${getApiBaseUrl()}/auth/verify-email`, { token, password });
      setStatus({ state: 'done', message: res.data?.message || 'Email confirmed. You can now log in.' });
    } catch (err) {
      // The backend's error handler sends { error: { code, message } }.
      const data = err.response?.data;
      setStatus({
        state: 'form',
        message: data?.error?.message || data?.message || 'We could not confirm your email address. Please try again.',
      });
    }
  };

  return (
    <div style={{ maxWidth: '400px', margin: 'auto', paddingTop: '50px' }}>
      <h2>Confirm Your Email</h2>
      {status.state === 'done' ? (
        <>
          <p role="status">{status.message}</p>
          <button type="button" onClick={() => navigate('/')} style={{ width: '100%', padding: '10px' }}>
            Go to login
          </button>
        </>
      ) : (
        <form onSubmit={handleSubmit}>
          <p>Choose a password to finish creating your account.</p>
          <input
            type="password"
            placeholder="Choose a password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={{ width: '100%', boxSizing: 'border-box', marginBottom: '10px', padding: '8px' }}
          />
          <input
            type="password"
            placeholder="Confirm password"
            value={confirmation}
            onChange={(e) => setConfirmation(e.target.value)}
            style={{ width: '100%', boxSizing: 'border-box', marginBottom: '10px', padding: '8px' }}
          />
          <button type="submit" style={{ width: '100%', padding: '10px' }}>Confirm email and set password</button>
          {status.message && <p role="status">{status.message}</p>}
        </form>
      )}
    </div>
  );
}

export default VerifyEmail;
