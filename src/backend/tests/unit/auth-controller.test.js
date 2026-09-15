const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

jest.mock('bcryptjs');
jest.mock('jsonwebtoken');
jest.mock('crypto');
jest.mock('../../utils/emailUtils', () => ({
  sendPasswordResetEmail: jest.fn()
}));
jest.mock('../../models/Professor', () => {
  const Professor = jest.fn((data) => ({
    ...data,
    _id: 'new-professor-id',
    save: jest.fn().mockResolvedValue(undefined)
  }));
  Professor.findOne = jest.fn();
  return Professor;
});

const Professor = require('../../models/Professor');
const { sendPasswordResetEmail } = require('../../utils/emailUtils');
const authController = require('../../controllers/authController');

function responseMock() {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn()
  };
}

function errorWith(code, status, message) {
  return expect.objectContaining({ code, status, message });
}

describe('auth controller', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    bcrypt.compare.mockResolvedValue(true);
    bcrypt.hash.mockResolvedValue('hashed-password');
    jwt.sign.mockReturnValue('access-token');
    crypto.randomBytes.mockReturnValue({ toString: () => 'reset-token' });
    sendPasswordResetEmail.mockResolvedValue({ success: true });
  });

  describe('login', () => {
    test('rejects missing credentials', async () => {
      const next = jest.fn();
      await authController.login({ body: {} }, responseMock(), next);
      expect(next).toHaveBeenCalledWith(errorWith('VALIDATION_ERROR', 400, 'Email and password are required.'));
    });

    test('rejects an unknown professor', async () => {
      Professor.findOne.mockResolvedValue(null);
      const next = jest.fn();
      await authController.login({ body: { email: 'missing@example.com', password: 'pass' } }, responseMock(), next);
      expect(next).toHaveBeenCalledWith(errorWith('AUTH_ERROR', 401, 'Invalid email or password.'));
    });

    test('rejects an incorrect password', async () => {
      Professor.findOne.mockResolvedValue({ password: 'stored-password' });
      bcrypt.compare.mockResolvedValue(false);
      const next = jest.fn();
      await authController.login({ body: { email: 'user@example.com', password: 'wrong' } }, responseMock(), next);
      expect(next).toHaveBeenCalledWith(errorWith('AUTH_ERROR', 401, 'Invalid email or password.'));
    });

    test('returns MFA requirement', async () => {
      const professor = { _id: 'prof-1', mfa_enabled: true };
      Professor.findOne.mockResolvedValue(professor);
      const res = responseMock();
      await authController.login({ body: { email: 'user@example.com', password: 'pass' } }, res, jest.fn());
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ mfa_required: true, professor_id: 'prof-1' });
    });

    test('returns a token and updates last login', async () => {
      const professor = {
        _id: 'prof-1', email: 'user@example.com', name: 'User', department: 'CS',
        mfa_enabled: false, created_at: 'created', save: jest.fn().mockResolvedValue(undefined)
      };
      Professor.findOne.mockResolvedValue(professor);
      const res = responseMock();
      await authController.login({ body: { email: professor.email, password: 'pass' } }, res, jest.fn());
      expect(jwt.sign).toHaveBeenCalled();
      expect(professor.save).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ access_token: 'access-token' }));
    });

    test('forwards database failures', async () => {
      const error = new Error('database failure');
      Professor.findOne.mockRejectedValue(error);
      const next = jest.fn();
      await authController.login({ body: { email: 'user@example.com', password: 'pass' } }, responseMock(), next);
      expect(next).toHaveBeenCalledWith(error);
      expect(error.code).toBe('SERVER_ERROR');
      expect(error.status).toBe(500);
    });
  });

  describe('register', () => {
    test('rejects incomplete registration', async () => {
      const next = jest.fn();
      await authController.register({ body: { email: 'user@example.com' } }, responseMock(), next);
      expect(next).toHaveBeenCalledWith(errorWith('VALIDATION_ERROR', 400, 'All fields are required.'));
    });

    test('rejects an existing email', async () => {
      Professor.findOne.mockResolvedValue({ _id: 'existing' });
      const next = jest.fn();
      await authController.register({ body: { email: 'user@example.com', password: 'pass', name: 'User', department: 'CS' } }, responseMock(), next);
      expect(next).toHaveBeenCalledWith(errorWith('DUPLICATE', 409, 'Email already registered.'));
    });

    test('creates a professor', async () => {
      Professor.findOne.mockResolvedValue(null);
      const res = responseMock();
      await authController.register({ body: { email: 'user@example.com', password: 'pass', name: 'User', department: 'CS' } }, res, jest.fn());
      expect(bcrypt.hash).toHaveBeenCalledWith('pass', 10);
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({ message: 'Registration successful.', professor_id: 'new-professor-id' });
    });

    test('forwards registration failures', async () => {
      const error = new Error('save failure');
      Professor.findOne.mockRejectedValue(error);
      const next = jest.fn();
      await authController.register({ body: { email: 'user@example.com', password: 'pass', name: 'User', department: 'CS' } }, responseMock(), next);
      expect(next).toHaveBeenCalledWith(error);
    });
  });

  test('logs out successfully', async () => {
    const res = responseMock();
    await authController.logout({}, res);
    expect(res.json).toHaveBeenCalledWith({ message: 'Logout successful.' });
  });

  test.each([
    ['refreshToken', 'Refresh token not implemented.'],
    ['verifyMfa', 'MFA verification not implemented.']
  ])('%s is not implemented', async (method, message) => {
    const next = jest.fn();
    await authController[method]({}, {}, next);
    expect(next).toHaveBeenCalledWith(errorWith('NOT_IMPLEMENTED', 501, message));
  });

  describe('resetPassword', () => {
    test('rejects a missing email', async () => {
      const next = jest.fn();
      await authController.resetPassword({ body: {} }, responseMock(), next);
      expect(next).toHaveBeenCalledWith(errorWith('VALIDATION_ERROR', 400, 'Email is required.'));
    });

    test('does not reveal unknown emails', async () => {
      Professor.findOne.mockResolvedValue(null);
      const res = responseMock();
      await authController.resetPassword({ body: { email: 'missing@example.com' } }, res, jest.fn());
      expect(res.status).toHaveBeenCalledWith(200);
      expect(sendPasswordResetEmail).not.toHaveBeenCalled();
    });

    test('stores a reset token and sends email', async () => {
      const professor = { email: 'user@example.com', save: jest.fn().mockResolvedValue(undefined) };
      Professor.findOne.mockResolvedValue(professor);
      const res = responseMock();
      await authController.resetPassword({ body: { email: professor.email } }, res, jest.fn());
      expect(professor.securityToken).toBe('reset-token');
      expect(professor.save).toHaveBeenCalled();
      expect(sendPasswordResetEmail).toHaveBeenCalledWith(professor.email, 'reset-token', undefined);
      expect(res.status).toHaveBeenCalledWith(200);
    });

    test('forwards reset-password failures', async () => {
      const error = new Error('reset lookup failure');
      Professor.findOne.mockRejectedValue(error);
      const next = jest.fn();
      await authController.resetPassword({ body: { email: 'user@example.com' } }, responseMock(), next);
      expect(next).toHaveBeenCalledWith(error);
    });
  });

  describe('updatePassword', () => {
    test('rejects missing token or password', async () => {
      const next = jest.fn();
      await authController.updatePassword({ body: {} }, responseMock(), next);
      expect(next).toHaveBeenCalledWith(errorWith('VALIDATION_ERROR', 400, 'Token and new password are required.'));
    });

    test.each([
      null,
      { securityTokenExpires: undefined },
      { securityTokenExpires: Date.now() - 1 }
    ])('rejects invalid or expired token: %j', async (professor) => {
      Professor.findOne.mockResolvedValue(professor);
      const next = jest.fn();
      await authController.updatePassword({ body: { token: 'token', password: 'new-pass' } }, responseMock(), next);
      expect(next).toHaveBeenCalledWith(errorWith('TOKEN_ERROR', 400, 'Invalid or expired token.'));
    });

    test('updates a valid token password', async () => {
      const professor = { securityTokenExpires: Date.now() + 10000, save: jest.fn().mockResolvedValue(undefined) };
      Professor.findOne.mockResolvedValue(professor);
      const res = responseMock();
      await authController.updatePassword({ body: { token: 'token', password: 'new-pass' } }, res, jest.fn());
      expect(professor.password).toBe('hashed-password');
      expect(professor.securityToken).toBeUndefined();
      expect(professor.save).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith({ message: 'Password updated successfully.' });
    });

    test('forwards password-update failures', async () => {
      const error = new Error('password lookup failure');
      Professor.findOne.mockRejectedValue(error);
      const next = jest.fn();
      await authController.updatePassword({ body: { token: 'token', password: 'new-pass' } }, responseMock(), next);
      expect(next).toHaveBeenCalledWith(error);
    });
  });
});
