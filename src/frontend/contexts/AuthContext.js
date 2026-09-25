import React, { createContext, useContext, useState, useEffect } from 'react';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [currentUser, setCurrentUser] = useState(null);

  useEffect(() => {
    // Replace with real auth logic (e.g., check localStorage or API)
    const user = JSON.parse(localStorage.getItem('user'));
    if (user) setCurrentUser(user);
  }, []);

  const login = (userData) => {
    localStorage.setItem('user', JSON.stringify(userData));
    setCurrentUser(userData);
  };

  const logout = () => {
    localStorage.removeItem('user');
    // The token is what the backend accepts, so it has to go too.
    localStorage.removeItem('peer_eval_token');
    sessionStorage.removeItem('peer_eval_session');
    setCurrentUser(null);
  };

  return (
    <AuthContext.Provider value={{ currentUser, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);