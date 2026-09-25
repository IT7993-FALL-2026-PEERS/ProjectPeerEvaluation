import React, { useState } from 'react';
import axios from 'axios';
import { getApiBaseUrl } from '../services/apiUrl';
import { useParams, useNavigate } from 'react-router-dom';

function ResetPassword() {
  const { token } = useParams();
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [status, setStatus] = useState('');
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setStatus('');
    if (!newPassword || !confirmPassword) {
      setStatus('Please fill in both fields.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setStatus('Passwords do not match.');
      return;
    }
    try {
      const baseURL = getApiBaseUrl();
      const res = await axios.post(`${baseURL}/auth/update-password`, {
        token,
        password: newPassword
      });
      // A 2xx response means the password changed; failures arrive as errors below.
      setStatus(res.data?.message || 'Password updated successfully! You can now log in.');
      setTimeout(() => navigate('/'), 2000);
    } catch (err) {
      // The backend's error handler sends { error: { code, message } }.
      const data = err.response?.data;
      setStatus(data?.error?.message || data?.message || 'Failed to update password.');
    }
  };

  return (
    <div style={{ maxWidth: '400px', margin: 'auto', paddingTop: '50px' }}>
      <h2>Reset Your Password</h2>
      <form onSubmit={handleSubmit}>
        <input
          type="password"
          placeholder="New Password"
          value={newPassword}
          onChange={e => setNewPassword(e.target.value)}
          required
          style={{ width: '100%', marginBottom: '10px', padding: '8px' }}
        />
        <input
          type="password"
          placeholder="Confirm New Password"
          value={confirmPassword}
          onChange={e => setConfirmPassword(e.target.value)}
          required
          style={{ width: '100%', marginBottom: '10px', padding: '8px' }}
        />
        <button type="submit" style={{ width: '100%', padding: '10px' }}>
          Update Password
        </button>
      </form>
      {status && <p style={{ color: status.includes('successfully') ? 'green' : 'red', marginTop: '10px' }}>{status}</p>}
    </div>
  );
}

export default ResetPassword;
