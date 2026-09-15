const request = require('supertest');
const jwt = require('jsonwebtoken');

jest.mock('jsonwebtoken');
jest.mock('../../models/Professor', () => ({
  findById: jest.fn()
}));

const Professor = require('../../models/Professor');
const app = require('../../index');
const { authenticateToken } = require('../../middleware/auth');
const errorHandler = require('../../middleware/errorHandler');
const aiController = require('../../controllers/aiController');
const professorController = require('../../controllers/professorController');

function responseMock() {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn()
  };
}

describe('authentication middleware', () => {
  beforeEach(() => jest.clearAllMocks());

  test('passes an authenticated user to the next handler', () => {
    const req = { headers: { authorization: 'Bearer valid-token' } };
    const next = jest.fn();
    jwt.verify.mockImplementation((token, secret, callback) => callback(null, { id: 'prof-1' }));

    authenticateToken(req, {}, next);

    expect(jwt.verify).toHaveBeenCalledWith('valid-token', 'dev_secret_key', expect.any(Function));
    expect(req.user).toEqual({ id: 'prof-1' });
    expect(next).toHaveBeenCalledWith();
  });

  test('rejects a missing token', () => {
    const next = jest.fn();

    authenticateToken({ headers: {} }, {}, next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({
      code: 'UNAUTHORIZED',
      status: 401,
      message: 'No token provided.'
    }));
  });

  test('rejects an invalid token', () => {
    const next = jest.fn();
    jwt.verify.mockImplementation((token, secret, callback) => callback(new Error('invalid')));

    authenticateToken({ headers: { authorization: 'Bearer invalid-token' } }, {}, next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({
      code: 'UNAUTHORIZED',
      status: 401,
      message: 'Invalid or expired token.'
    }));
  });
});

describe('global error handler', () => {
  test('uses supplied error values', () => {
    const res = responseMock();
    errorHandler({ status: 422, code: 'VALIDATION', message: 'Bad input', details: { field: 'email' } }, {}, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(422);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      error: expect.objectContaining({ code: 'VALIDATION', message: 'Bad input', details: { field: 'email' } })
    }));
  });

  test('uses defaults when error values are absent', () => {
    const res = responseMock();
    errorHandler({}, {}, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      error: expect.objectContaining({ code: 'SERVER_ERROR', message: 'Internal server error', details: {} })
    }));
  });
});

describe('AI controller stubs', () => {
  test.each([
    ['summarize', 'Summarize not implemented.'],
    ['redFlags', 'Red flags not implemented.'],
    ['sentiment', 'Sentiment not implemented.']
  ])('%s forwards a 501 error', async (method, message) => {
    const next = jest.fn();

    await aiController[method]({}, {}, next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({
      code: 'NOT_IMPLEMENTED',
      status: 501,
      message
    }));
  });
});

describe('professor AI-word controller', () => {
  beforeEach(() => jest.clearAllMocks());

  test('returns 404 when the professor does not exist', async () => {
    Professor.findById.mockResolvedValue(null);
    const res = responseMock();

    await professorController.getAiWords({ user: { id: 'missing' } }, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ error: 'Professor not found' });
  });

  test('returns the professor words or an empty list', async () => {
    Professor.findById.mockResolvedValue({ aiConcerningWords: undefined });
    const res = responseMock();

    await professorController.getAiWords({ user: { id: 'prof-1' } }, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ words: [] });
  });

  test('forwards lookup errors', async () => {
    const error = new Error('database failure');
    Professor.findById.mockRejectedValue(error);
    const next = jest.fn();

    await professorController.getAiWords({ user: { id: 'prof-1' } }, responseMock(), next);

    expect(next).toHaveBeenCalledWith(error);
  });

  test.each([
    [{ action: 'add', word: 'late' }, ['existing', 'late']],
    [{ action: 'edit', index: 0, word: 'updated' }, ['updated']],
    [{ action: 'delete', index: 0 }, []],
    [{ action: 'edit', index: 9, word: 'unused' }, ['existing']],
    [{ action: 'delete', index: 9 }, ['existing']],
    [{ action: 'add' }, ['existing']],
    [{ action: 'edit', index: 0 }, ['existing']],
    [{ action: 'edit', index: '0', word: 'unused' }, ['existing']],
    [{ action: 'delete', index: '0' }, ['existing']],
    [{ action: 'unknown' }, ['existing']]
  ])('updates words for request %j', async (body, expectedWords) => {
    const professor = {
      aiConcerningWords: ['existing'],
      save: jest.fn().mockResolvedValue(undefined)
    };
    Professor.findById.mockResolvedValue(professor);
    const res = responseMock();

    await professorController.updateAiWords({ user: { id: 'prof-1' }, body }, res, jest.fn());

    expect(professor.aiConcerningWords).toEqual(expectedWords);
    expect(professor.save).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ words: expectedWords });
  });

  test('returns 404 before updating a missing professor', async () => {
    Professor.findById.mockResolvedValue(null);
    const res = responseMock();

    await professorController.updateAiWords({ user: { id: 'missing' }, body: {} }, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ error: 'Professor not found' });
  });

  test('initializes missing words before adding a word', async () => {
    const professor = {
      save: jest.fn().mockResolvedValue(undefined)
    };
    Professor.findById.mockResolvedValue(professor);
    const res = responseMock();

    await professorController.updateAiWords({
      user: { id: 'prof-1' },
      body: { action: 'add', word: 'late' }
    }, res, jest.fn());

    expect(professor.aiConcerningWords).toEqual(['late']);
    expect(res.json).toHaveBeenCalledWith({ words: ['late'] });
  });

  test('forwards save errors', async () => {
    const error = new Error('save failure');
    Professor.findById.mockResolvedValue({ aiConcerningWords: [], save: jest.fn().mockRejectedValue(error) });
    const next = jest.fn();

    await professorController.updateAiWords({ user: { id: 'prof-1' }, body: {} }, responseMock(), next);

    expect(next).toHaveBeenCalledWith(error);
  });
});

describe('application boundary routes', () => {
  test('serves the root API description', async () => {
    const response = await request(app).get('/');

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('Running');
    expect(response.body.endpoints).toEqual(expect.arrayContaining(['GET /api/courses - List courses']));
  });

  test('formats an unknown route error', async () => {
    const response = await request(app).get('/api/does-not-exist');

    expect(response.status).toBe(404);
    expect(response.body).toEqual({});
  });
});
