/**
 * End-to-end smoke tests against the real, unmocked Express app and a real
 * MongoDB -- no jest.mock anywhere in this file. This is the gate the CI/CD
 * pipeline (.github/workflows/ci-cd.yml) runs before it will deploy: if
 * this fails, `deploy` is skipped and nothing reaches Render. Runs against
 * whatever MongoDB is reachable at MONGODB_URI, which in CI is a throwaway
 * mongo:7 service container and locally is whatever `docker compose up -d
 * mongo` (or scripts/run-local.sh, which does that for you) gives you.
 *
 * We connect to Mongo ourselves in beforeAll rather than relying on
 * index.js's own connection logic, since that logic is gated behind
 * `NODE_ENV !== 'test'` and Jest always sets NODE_ENV=test -- see the
 * comment on that block in index.js. Mongoose's default connection is a
 * process-wide singleton, so once we've connected here, every model the app
 * requires (Professor, Course, etc.) uses this same connection automatically.
 *
 * dropDatabase() in afterAll means every run starts from a clean slate --
 * the register/login flow below creates a real Professor document, and the
 * timestamped email avoids collisions with any previous run's leftovers if
 * that cleanup step is ever skipped.
 */
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
    // status/endpoints are also pinned by a unit test (core-behavior.test.js);
    // message is checked only here, so breaking it fails integration-tests
    // without touching unit-tests -- see scripts/ci-pipeline-tests/03-integration-fails.sh.
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

  // Depends on the account the register test above just created -- Jest
  // runs tests within a describe block in file order, so this only works
  // as long as it stays after 'POST /api/auth/register'.
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
