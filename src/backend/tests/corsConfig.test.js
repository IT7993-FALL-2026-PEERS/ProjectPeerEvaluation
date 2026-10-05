const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const express = require('express');
const cors = require('cors');
const { toOrigin, allowedOrigins, originCheck, corsOptions } = require('../config/corsConfig');

// CORS (CICD-37, audit A-03): only the configured frontend, plus localhost outside production.
const STAGING = { NODE_ENV: 'production', FRONTEND_URL: 'https://peers-frontend-staging.onrender.com' };
const check = (env, origin) => new Promise((resolve, reject) => {
  originCheck(env)(origin, (err, allowed) => (err ? reject(err) : resolve(allowed)));
});

test('FRONTEND_URL is reduced to its origin', () => {
  assert.equal(toOrigin('https://peers-frontend-staging.onrender.com/'), 'https://peers-frontend-staging.onrender.com');
  assert.equal(toOrigin('http://localhost:3000/evaluate/abc'), 'http://localhost:3000');
  assert.equal(toOrigin('not a url'), null);
  assert.equal(toOrigin('ftp://example.com'), null);
});

test('staging allows only its frontend', async () => {
  assert.deepEqual([...allowedOrigins(STAGING)], ['https://peers-frontend-staging.onrender.com']);
  assert.equal(await check(STAGING, 'https://peers-frontend-staging.onrender.com'), true);
});

test('staging refuses other Render sites, which the old wildcard let in', async () => {
  assert.equal(await check(STAGING, 'https://attacker.onrender.com'), false);
  assert.equal(await check(STAGING, 'https://peer-evaluation-frontend.onrender.com'), false);
  assert.equal(await check(STAGING, 'https://peers-frontend-staging.onrender.com.evil.com'), false);
  assert.equal(await check(STAGING, 'http://peers-frontend-staging.onrender.com'), false);
});

test('production does not allow localhost', async () => {
  assert.equal(await check(STAGING, 'http://localhost:3000'), false);
  assert.equal(await check(STAGING, 'http://127.0.0.1:3000'), false);
});

test('local development allows localhost:3000 by name and by address', async () => {
  const dev = { FRONTEND_URL: 'http://localhost:3000' };
  assert.equal(await check(dev, 'http://localhost:3000'), true);
  assert.equal(await check(dev, 'http://127.0.0.1:3000'), true);
  assert.equal(await check(dev, 'http://localhost:4000'), false);
  assert.equal(await check({}, 'http://localhost:3000'), true);
});

test('Docker Compose (production, frontend on localhost) allows its FRONTEND_URL', async () => {
  const compose = { NODE_ENV: 'production', FRONTEND_URL: 'http://localhost:8080' };
  assert.equal(await check(compose, 'http://localhost:8080'), true);
  assert.equal(await check(compose, 'http://localhost:3000'), false);
});

test('production without FRONTEND_URL allows no browser origin', async () => {
  assert.equal(allowedOrigins({ NODE_ENV: 'production' }).size, 0);
  assert.equal(await check({ NODE_ENV: 'production' }, 'https://peers-frontend-staging.onrender.com'), false);
});

test('requests without an Origin header (curl, health checks) are not blocked', async () => {
  assert.equal(await check(STAGING, undefined), true);
});

// The headers a browser sees, through the real cors middleware.
async function withServer(env, fn) {
  const app = express();
  app.use(cors(corsOptions(env)));
  app.get('/api/health', (_req, res) => res.json({ status: 'OK' }));
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  try {
    await fn(server.address().port);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

const request = (port, method, headers) => new Promise((resolve, reject) => {
  const req = http.request({ port, method, path: '/api/health', headers }, (res) => {
    res.resume();
    res.on('end', () => resolve(res));
  });
  req.on('error', reject);
  req.end();
});

test('the frontend gets Access-Control-Allow-Origin and credentials', async () => {
  await withServer(STAGING, async (port) => {
    const res = await request(port, 'GET', { Origin: STAGING.FRONTEND_URL });
    assert.equal(res.statusCode, 200);
    assert.equal(res.headers['access-control-allow-origin'], STAGING.FRONTEND_URL);
    assert.equal(res.headers['access-control-allow-credentials'], 'true');
  });
});

test('another Render site gets no CORS headers, and no error', async () => {
  await withServer(STAGING, async (port) => {
    const res = await request(port, 'GET', { Origin: 'https://attacker.onrender.com' });
    assert.equal(res.statusCode, 200);
    assert.equal(res.headers['access-control-allow-origin'], undefined);
  });
});

test('a preflight from the frontend is answered for PATCH with Authorization', async () => {
  await withServer(STAGING, async (port) => {
    const res = await request(port, 'OPTIONS', {
      Origin: STAGING.FRONTEND_URL,
      'Access-Control-Request-Method': 'PATCH',
      'Access-Control-Request-Headers': 'authorization,content-type',
    });
    assert.equal(res.statusCode, 204);
    assert.equal(res.headers['access-control-allow-origin'], STAGING.FRONTEND_URL);
    assert.match(res.headers['access-control-allow-methods'], /PATCH/);
    assert.match(res.headers['access-control-allow-headers'], /Authorization/);
  });
});
