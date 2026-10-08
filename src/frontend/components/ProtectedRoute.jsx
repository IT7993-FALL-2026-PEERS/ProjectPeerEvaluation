import React from 'react';
import { Navigate } from 'react-router-dom';

// Professor pages need the login token the backend checks. Without one, go to the
// login page instead of showing a dashboard whose API calls all fail. The token is
// read directly (not from AuthContext) because the stored user is only restored
// after the first render.
function ProtectedRoute({ children }) {
  const token = localStorage.getItem('peer_eval_token') || sessionStorage.getItem('peer_eval_session');
  if (!token) {
    return <Navigate to="/" replace />;
  }
  return children;
}

export default ProtectedRoute;
