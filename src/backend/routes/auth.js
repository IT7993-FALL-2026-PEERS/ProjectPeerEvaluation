const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { authenticateToken } = require('../middleware/auth');

// Auth endpoints
router.post('/login', authController.login);
router.post('/register', authController.register);
router.post('/logout', authenticateToken, authController.logout);
router.post('/refresh', authController.refreshToken);
router.post('/verify-mfa', authController.verifyMfa);

router.post('/verify-mfa', authController.verifyMfa);
// Password reset endpoint
router.post('/reset-password', authController.resetPassword);

// Password update via token
router.post('/update-password', authController.updatePassword);

module.exports = router;