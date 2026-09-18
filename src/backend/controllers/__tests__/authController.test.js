const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

jest.mock('../../models/Professor', () => {
  const mockSave = jest.fn().mockResolvedValue();
  const instances = [];
  function Professor(data) {
    Object.assign(this, data);
    this.save = mockSave;
    instances.push(this);
  }
  Professor.findOne = jest.fn();
  Professor.__mockSave = mockSave;
  Professor.__instances = instances;
  return Professor;
});
jest.mock('../../utils/emailUtils', () => ({
  sendEvaluationInvitation: jest.fn(),
  sendEvaluationReminder: jest.fn(),
  sendPasswordResetEmail: jest.fn().mockResolvedValue({ success: true }),
}));

const Professor = require('../../models/Professor');
const { sendPasswordResetEmail } = require('../../utils/emailUtils');
const authController = require('../authController');

function mockRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

beforeEach(() => {
  jest.clearAllMocks();
  Professor.__instances.length = 0;
});

describe('authController.login', () => {
  it('rejects when email or password is missing', async () => {
    const req = { body: { email: '' } };
    const res = mockRes();
    const next = jest.fn();

    await authController.login(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(next.mock.calls[0][0].status).toBe(400);
    expect(Professor.findOne).not.toHaveBeenCalled();
  });

  it('rejects with 401 when no professor matches the email', async () => {
    Professor.findOne.mockResolvedValue(null);
    const req = { body: { email: 'nobody@example.com', password: 'secret' } };
    const res = mockRes();
    const next = jest.fn();

    await authController.login(req, res, next);

    const err = next.mock.calls[0][0];
    expect(err.status).toBe(401);
    expect(err.code).toBe('AUTH_ERROR');
  });

  it('rejects with 401 when the password does not match', async () => {
    const hashed = await bcrypt.hash('correct-password', 10);
    Professor.findOne.mockResolvedValue({
      _id: 'p1',
      email: 'prof@example.com',
      password: hashed,
      save: jest.fn(),
    });
    const req = { body: { email: 'prof@example.com', password: 'wrong-password' } };
    const res = mockRes();
    const next = jest.fn();

    await authController.login(req, res, next);

    const err = next.mock.calls[0][0];
    expect(err.status).toBe(401);
  });

  it('returns mfa_required without issuing a token when MFA is enabled', async () => {
    const hashed = await bcrypt.hash('correct-password', 10);
    Professor.findOne.mockResolvedValue({
      _id: 'p1',
      email: 'prof@example.com',
      password: hashed,
      mfa_enabled: true,
      save: jest.fn(),
    });
    const req = { body: { email: 'prof@example.com', password: 'correct-password' } };
    const res = mockRes();
    const next = jest.fn();

    await authController.login(req, res, next);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ mfa_required: true }));
    expect(next).not.toHaveBeenCalled();
  });

  it('issues a JWT and updates last_login on successful login', async () => {
    const hashed = await bcrypt.hash('correct-password', 10);
    const save = jest.fn().mockResolvedValue();
    Professor.findOne.mockResolvedValue({
      _id: 'p1',
      email: 'prof@example.com',
      name: 'Prof Test',
      department: 'CS',
      password: hashed,
      mfa_enabled: false,
      save,
    });
    const req = { body: { email: 'prof@example.com', password: 'correct-password' } };
    const res = mockRes();
    const next = jest.fn();

    await authController.login(req, res, next);

    expect(save).toHaveBeenCalledTimes(1);
    expect(res.status).toHaveBeenCalledWith(200);
    const payload = res.json.mock.calls[0][0];
    expect(payload.access_token).toBeDefined();
    const decoded = jwt.verify(payload.access_token, process.env.JWT_SECRET || 'dev_secret_key');
    expect(decoded.email).toBe('prof@example.com');
    expect(payload.professor.email).toBe('prof@example.com');
  });
});

describe('authController.register', () => {
  it('rejects when required fields are missing', async () => {
    const req = { body: { email: 'a@b.com' } };
    const res = mockRes();
    const next = jest.fn();

    await authController.register(req, res, next);

    expect(next.mock.calls[0][0].status).toBe(400);
  });

  it('rejects with 409 when the email is already registered', async () => {
    Professor.findOne.mockResolvedValue({ _id: 'existing' });
    const req = { body: { email: 'a@b.com', password: 'pw', name: 'A', department: 'CS' } };
    const res = mockRes();
    const next = jest.fn();

    await authController.register(req, res, next);

    const err = next.mock.calls[0][0];
    expect(err.status).toBe(409);
    expect(err.code).toBe('DUPLICATE');
  });

  it('creates a new professor with a bcrypt-hashed password on success', async () => {
    Professor.findOne.mockResolvedValue(null);
    const req = { body: { email: 'new@b.com', password: 'plainpassword', name: 'New Prof', department: 'CS' } };
    const res = mockRes();
    const next = jest.fn();

    await authController.register(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(Professor.__mockSave).toHaveBeenCalledTimes(1);
    expect(res.status).toHaveBeenCalledWith(201);

    // The password stored on the instance should be a bcrypt hash, not the plaintext.
    const savedInstance = Professor.__instances[0];
    expect(savedInstance.password).not.toBe('plainpassword');
    expect(await bcrypt.compare('plainpassword', savedInstance.password)).toBe(true);
  });
});

describe('authController.resetPassword', () => {
  it('requires an email', async () => {
    const req = { body: {} };
    const res = mockRes();
    const next = jest.fn();

    await authController.resetPassword(req, res, next);

    expect(next.mock.calls[0][0].status).toBe(400);
  });

  it('responds with a generic message when the email is not registered (no email sent)', async () => {
    Professor.findOne.mockResolvedValue(null);
    const req = { body: { email: 'unknown@example.com' } };
    const res = mockRes();
    const next = jest.fn();

    await authController.resetPassword(req, res, next);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(sendPasswordResetEmail).not.toHaveBeenCalled();
  });

  it('generates a security token and sends the reset email for a known professor', async () => {
    const save = jest.fn().mockResolvedValue();
    Professor.findOne.mockResolvedValue({ email: 'known@example.com', save });
    const req = { body: { email: 'known@example.com' } };
    const res = mockRes();
    const next = jest.fn();

    await authController.resetPassword(req, res, next);

    expect(save).toHaveBeenCalledTimes(1);
    expect(sendPasswordResetEmail).toHaveBeenCalledWith('known@example.com', expect.any(String), undefined);
    expect(res.status).toHaveBeenCalledWith(200);
  });
});
