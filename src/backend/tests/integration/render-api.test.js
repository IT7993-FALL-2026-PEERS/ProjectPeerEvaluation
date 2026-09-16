const https = require('https');

jest.setTimeout(30000);

const BASE_URL = 'https://peer-evaluation-backend-rd6z.onrender.com/api';

function fetchJson(url, options = {}) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, {
      method: options.method || 'GET',
      headers: options.headers || {},
      timeout: 25000
    }, (res) => {
      let body = '';
      res.on('data', (chunk) => {
        body += chunk;
      });
      res.on('end', () => {
        const parsed = body ? (() => {
          try {
            return JSON.parse(body);
          } catch (error) {
            return body;
          }
        })() : null;
        resolve({ status: res.statusCode, data: parsed });
      });
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy(new Error('Request timed out'));
    });

    if (options.body) {
      req.write(JSON.stringify(options.body));
    }

    req.end();
  });
}

const integrationCases = [
  {
    name: 'GET /',
    call: () => fetchJson('https://peer-evaluation-backend-rd6z.onrender.com/'),
    expect: (response) => {
      expect(response.status).toBe(200);
      expect(response.data).toHaveProperty('status', 'Running');
      expect(response.data).toHaveProperty('message', '🎓 Peer Evaluation System API');
      expect(response.data).toHaveProperty('endpoints');
    }
  },
  {
    name: 'GET /api/health',
    call: () => fetchJson(`${BASE_URL}/health`),
    expect: (response) => {
      expect(response.status).toBeGreaterThanOrEqual(200);
      expect(response.status).toBeLessThan(400);
      expect(response.data).toBeTruthy();
    }
  },
  {
    name: 'POST /api/auth/register',
    call: () => fetchJson(`${BASE_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: {
        email: `integration-${Date.now()}@example.com`,
        password: 'IntegrationPass123!',
        name: 'Integration Admin',
        department: 'Computer Science'
      }
    }),
    expect: (response) => {
      expect(response.status).toBe(201);
      expect(response.data).toHaveProperty('message');
    }
  },
  {
    name: 'POST /api/auth/login',
    call: () => fetchJson(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: {
        email: 'admin@example.com',
        password: 'admin-password'
      }
    }),
    expect: (response) => {
      expect(response.status).toBe(200);
      expect(response.data).toHaveProperty('access_token');
    }
  },
  {
    name: 'GET /api/courses without auth',
    call: () => fetchJson(`${BASE_URL}/courses`, {
      headers: { Authorization: 'Bearer invalid-token' }
    }),
    expect: (response) => {
      expect(response.status).toBe(401);
      expect(response.data).toHaveProperty('error');
    }
  },
  {
    name: 'POST /api/ai/summarize without auth',
    call: () => fetchJson(`${BASE_URL}/ai/summarize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: { text: 'integration test' }
    }),
    expect: (response) => {
      expect(response.status).toBe(401);
      expect(response.data).toHaveProperty('error');
    }
  }
];

describe('Render API integration smoke tests', () => {
  test.each(integrationCases)('$name', async ({ name, call, expect: assertExpectation }) => {
    const response = await call();
    console.log(`[INTEGRATION] ${name} -> ${response.status}`);
    console.log(`[INTEGRATION] ${JSON.stringify(response.data)}`);
    try {
      assertExpectation(response);
      console.log(`[INTEGRATION] PASS: ${name}`);
    } catch (error) {
      console.error(`[INTEGRATION] FAIL: ${name}`);
      console.error(`[INTEGRATION] ERROR: ${error.message}`);
      throw error;
    }
  });
});
