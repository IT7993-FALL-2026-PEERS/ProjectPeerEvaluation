import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { getApiBaseUrl } from '../services/apiUrl';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

function LoginPage() {
  const [isRegistering, setIsRegistering] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  // Clear fields when switching between login and registration
  useEffect(() => {
    if (isRegistering) {
      setName('');
      setDepartment('');
      setEmail('');
      setPassword('');
    } else {
      setEmail('');
      setPassword('');
    }
  }, [isRegistering]);
  const [showResetDialog, setShowResetDialog] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetStatus, setResetStatus] = useState('');

  const handlePasswordReset = async (e) => {
    e.preventDefault();
    setResetStatus('');
    if (!resetEmail) {
      setResetStatus('Please enter your email.');
      return;
    }
    try {
      const baseURL = getApiBaseUrl();
      await axios.post(`${baseURL}/auth/reset-password`, { email: resetEmail });
      setResetStatus('If your email is registered, you will receive password reset instructions.');
    } catch (err) {
      setResetStatus('Failed to send reset instructions.');
    }
  };
  const [name, setName] = useState('');
  const [department, setDepartment] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const { login } = useAuth();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    const baseURL = getApiBaseUrl();

    const endpoint = isRegistering
      ? `${baseURL}/auth/register`
      : `${baseURL}/auth/login`;

    const payload = isRegistering
      ? { email, password, name, department }
      : { email, password };

    try {
      const res = await axios.post(endpoint, payload);

      if (isRegistering) {
        alert('Registration successful! You can now log in.');
        setIsRegistering(false);
        setName('');
        setDepartment('');
      } else {
        // Handle login response from backend
        const { access_token, professor } = res.data;
        if (access_token) {
          // Store token in localStorage (persistent) or sessionStorage (if you add a 'remember me' option)
          localStorage.setItem('peer_eval_token', access_token);
        }
        login(professor);
        navigate('/course-management');
      }
    } catch (err) {
      // The backend's error handler sends { error: { code, message } }.
      const data = err.response?.data;
      setError(data?.error?.message || data?.message || 'Something went wrong');
    }
  };

  return (
    <div style={{ maxWidth: '400px', margin: 'auto', paddingTop: '50px' }}>
      <h2>{isRegistering ? 'Professor Registration' : 'Professor Login'}</h2>
      <form onSubmit={handleSubmit}>
        {isRegistering && (
          <>
            <input
              type="text"
              placeholder="Full Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              style={{ width: '100%', marginBottom: '10px', padding: '8px' }}
            />
            <input
              type="text"
              placeholder="Department"
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
              required
              style={{ width: '100%', marginBottom: '10px', padding: '8px' }}
            />
          </>
        )}
        <div style={{ marginBottom: '10px' }}>
          <label htmlFor="login-email" style={{ display: 'block', marginBottom: '4px' }}>Email:</label>
          <input
            id="login-email"
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            style={{ width: '100%', padding: '8px' }}
          />
        </div>
        <div style={{ marginBottom: '10px' }}>
          <label htmlFor="login-password" style={{ display: 'block', marginBottom: '4px' }}>Password:</label>
          <input
            id="login-password"
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            style={{ width: '100%', padding: '8px' }}
          />
        </div>
        <button
          type="submit"
          style={{ width: '100%', padding: '10px', display: 'block', maxWidth: '100%' }}
        >
          {isRegistering ? 'Register' : 'Login'}
        </button>
        {!isRegistering && (
          <button
            type="button"
            onClick={() => setShowResetDialog(true)}
            style={{
              marginTop: '10px',
              background: 'none',
              border: 'none',
              color: '#007bff',
              cursor: 'pointer',
              textDecoration: 'underline'
            }}
          >
            Forgot Password?
          </button>
        )}
      </form>
      <button
        onClick={() => setIsRegistering((prev) => !prev)}
        style={{
          marginTop: '15px',
          background: 'none',
          border: 'none',
          color: '#007bff',
          cursor: 'pointer',
          textDecoration: 'underline'
        }}
      >
        {isRegistering
          ? 'Already have an account? Log in'
          : 'New here? Register'}
      </button>

      {error && <p style={{ color: 'red', marginTop: '10px' }}>{error}</p>}

      {/* Password Reset Dialog */}
      {showResetDialog && (
        <div style={{
          position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
          background: 'rgba(0,0,0,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
        }}>
          <div style={{ background: '#fff', padding: 24, borderRadius: 8, minWidth: 320 }}>
            <h3>Reset Password</h3>
            <form onSubmit={handlePasswordReset}>
              <input
                type="email"
                placeholder="Enter your email"
                value={resetEmail}
                onChange={e => setResetEmail(e.target.value)}
                style={{ width: '100%', marginBottom: 12, padding: 8 }}
                required
              />
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="submit" style={{ padding: '8px 16px' }}>Send Reset Link</button>
                <button type="button" style={{ padding: '8px 16px' }} onClick={() => setShowResetDialog(false)}>Cancel</button>
              </div>
            </form>
            {resetStatus && <p style={{ color: resetStatus.startsWith('If') ? 'green' : 'red', marginTop: 10 }}>{resetStatus}</p>}
          </div>
        </div>
      )}
    </div>
  );
}

export default LoginPage;
