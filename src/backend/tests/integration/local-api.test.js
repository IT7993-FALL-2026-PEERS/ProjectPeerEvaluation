const request = require('supertest');
const mongoose = require('mongoose');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/peer-evaluation-integration-test';

jest.setTimeout(30000);

let app;

beforeAll(async () => {
  await mongoose.connect(MONGODB_URI);
  app = require('../../index');
});

afterAll(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

describe('Local integration tests (real app + real MongoDB)', () => {
  const credentials = {
    email: `integration-${Date.now()}@example.com`,
    password: 'IntegrationPass123!',
    name: 'Integration Admin',
    department: 'Computer Science'
  };

  test('GET /', async () => {
    const res = await request(app).get('/');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('status', 'Running');
    expect(res.body).toHaveProperty('message', '🎓 Peer Evaluation System API');
    expect(res.body).toHaveProperty('endpoints');
  });

  test('GET /api/health', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBeGreaterThanOrEqual(200);
    expect(res.status).toBeLessThan(400);
    expect(res.body).toBeTruthy();
  });

  test('POST /api/auth/register', async () => {
    const res = await request(app).post('/api/auth/register').send(credentials);
    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('message');
  });

  test('POST /api/auth/login', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: credentials.email, password: credentials.password });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('access_token');
  });

  test('GET /api/courses without auth', async () => {
    const res = await request(app).get('/api/courses').set('Authorization', 'Bearer invalid-token');
    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty('error');
  });

  test('POST /api/ai/summarize without auth', async () => {
    const res = await request(app).post('/api/ai/summarize').send({ text: 'integration test' });
    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty('error');
  });
});
