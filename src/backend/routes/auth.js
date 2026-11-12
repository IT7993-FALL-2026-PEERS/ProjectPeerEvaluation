const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { authenticateToken } = require('../middleware/auth');

// Auth endpoints
router.post('/login', authController.login);
router.post('/register', authController.register);
router.post('/logout', authenticateToken, authController.logout);
router.post('/refresh', authenticateToken, authController.refreshToken);
router.post('/verify-mfa', authController.verifyMfa);

// Password reset endpoint
router.post('/reset-password', authController.resetPassword);

// Password update via token
router.post('/update-password', authController.updatePassword);

// Email confirmation for a newly registered professor (CW-11)
router.post('/verify-email', authController.verifyEmail);
// Read-only: is this confirmation link still usable? A POST so the token stays out of URLs and logs.
router.post('/verify-email/check', authController.checkEmailLink);

module.exports = router;