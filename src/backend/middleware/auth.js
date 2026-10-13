// ...existing code from peer-evaluation-backend/middleware/auth.js
const jwt = require('jsonwebtoken');
const { getConfig } = require('../config/env');
const { renewSessionToken, isPastTotalLimit } = require('../utils/sessionToken');

function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) {
    const err = new Error('No token provided.');
    err.code = 'UNAUTHORIZED';
    err.status = 401;
    return next(err);
  }
  jwt.verify(token, getConfig().jwtSecret, (err, user) => {
    if (err) {
      const error = new Error('Invalid or expired token.');
      error.code = 'UNAUTHORIZED';
      error.status = 401;
      return next(error);
    }
    // The total limit since login holds whatever the token's own expiry says (FR-04).
    if (isPastTotalLimit(user)) {
      const error = new Error('Invalid or expired token.');
      error.code = 'UNAUTHORIZED';
      error.status = 401;
      return next(error);
    }
    // The browser works out how long a login has left from the token's dates, which come from this clock;
    // its own clock can be minutes off, so every authenticated answer says what time it is here.
    if (typeof res.setHeader === 'function') res.setHeader('X-Server-Time', String(Date.now()));
    // Still working: hand back a fresh token so the idle period starts again (FR-04).
    const renewed = renewSessionToken(user);
    if (renewed && typeof res.setHeader === 'function') res.setHeader('X-Access-Token', renewed);
    req.user = user;
    next();
  });
}

module.exports = { authenticateToken };