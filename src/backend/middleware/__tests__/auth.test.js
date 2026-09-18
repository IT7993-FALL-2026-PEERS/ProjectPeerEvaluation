const jwt = require('jsonwebtoken');
const { authenticateToken } = require('../auth');

function mockReqRes(authHeader) {
  const req = { headers: authHeader ? { authorization: authHeader } : {} };
  const res = {};
  const next = jest.fn();
  return { req, res, next };
}

describe('authenticateToken middleware', () => {
  const SECRET = process.env.JWT_SECRET || 'dev_secret_key';

  it('calls next with a 401 UNAUTHORIZED error when no token is provided', () => {
    const { req, res, next } = mockReqRes();

    authenticateToken(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    const err = next.mock.calls[0][0];
    expect(err).toBeInstanceOf(Error);
    expect(err.status).toBe(401);
    expect(err.code).toBe('UNAUTHORIZED');
  });

  it('calls next with a 401 UNAUTHORIZED error when the token is invalid', () => {
    const { req, res, next } = mockReqRes('Bearer not-a-real-token');

    authenticateToken(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    const err = next.mock.calls[0][0];
    expect(err.status).toBe(401);
    expect(err.code).toBe('UNAUTHORIZED');
    expect(req.user).toBeUndefined();
  });

  it('attaches the decoded user and calls next() with no error for a valid token', () => {
    const payload = { id: 'prof123', email: 'prof@example.com', name: 'Prof Test' };
    const token = jwt.sign(payload, SECRET, { expiresIn: '1h' });
    const { req, res, next } = mockReqRes(`Bearer ${token}`);

    authenticateToken(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledWith();
    expect(req.user).toMatchObject(payload);
  });

  it('rejects an expired token', () => {
    const token = jwt.sign({ id: 'prof123' }, SECRET, { expiresIn: -10 });
    const { req, res, next } = mockReqRes(`Bearer ${token}`);

    authenticateToken(req, res, next);

    const err = next.mock.calls[0][0];
    expect(err.status).toBe(401);
    expect(err.message).toMatch(/expired/i);
  });
});
