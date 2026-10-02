const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const errorHandler = require('../middleware/errorHandler');
const { applyRateLimits, readLimits, trustProxyHops, DEFAULT_LIMITS } = require('../config/rateLimit');

// API-5 (CICD-34): nothing limited how often login, password reset, sign-up or the
// student evaluation links could be hit, so passwords could be guessed and reset
// emails flooded. These tests run a real Express app on a random port and check the
// limits over HTTP, the way index.js wires them: trust proxy 1 (Render puts exactly
// one proxy in front), the health route first, then the limiters, then the routers.
const WINDOW = 60 * 1000;
const TINY = {
  general: { windowMs: WINDOW, limit: 100 },
  login: { windowMs: WINDOW, limit: 3 },
  signup: { windowMs: WINDOW, limit: 2 },
  reset: { windowMs: WINDOW, limit: 2 },
  update: { windowMs: WINDOW, limit: 3 },
  evaluate: { windowMs: WINDOW, limit: 4 },
};

async function startApp(t, limits = TINY) {
  const app = express();
  app.set('trust proxy', 1);
  app.get('/api/health', (req, res) => res.json({ status: 'OK' }));
  applyRateLimits(app, limits);
  // A login succeeds only when the test says so; every other attempt is a 401.
  app.post('/api/auth/login', (req, res) => (req.get('x-outcome') === 'ok'
    ? res.json({ token: 'jwt' })
    : res.status(401).json({ error: { code: 'AUTH_ERROR', message: 'Invalid email or password' } })));
  app.post('/api/auth/register', (req, res) => res.status(201).json({ ok: true }));
  app.post('/api/auth/reset-password', (req, res) => res.json({ ok: true }));
  app.post('/api/auth/update-password', (req, res) => res.json({ ok: true }));
  app.get('/api/evaluate/:token', (req, res) => res.json({ form: true }));
  app.get('/api/courses', (req, res) => res.json([]));
  app.use(errorHandler);

  const server = await new Promise((resolve) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}`;

  // The client's address arrives in X-Forwarded-For, as it does behind Render's proxy.
  return (method, path, { ip = '203.0.113.1', headers = {} } = {}) =>
    fetch(base + path, { method, headers: { 'X-Forwarded-For': ip, ...headers } });
}

async function statuses(call, count, method, path, options) {
  const out = [];
  for (let i = 0; i < count; i += 1) out.push((await call(method, path, options)).status);
  return out;
}

test('TC-01-01: login attempts over the limit get a 429 in the usual error shape, with Retry-After', async (t) => {
  const call = await startApp(t);
  assert.deepEqual(await statuses(call, 3, 'POST', '/api/auth/login'), [401, 401, 401]);

  const res = await call('POST', '/api/auth/login');
  assert.equal(res.status, 429);
  const body = await res.json();
  assert.equal(body.error.code, 'RATE_LIMITED');
  assert.match(body.error.message, /too many login attempts/i);
  assert.match(body.error.message, /minute/i);
  assert.ok(Number.isInteger(body.error.details.retry_after_seconds) && body.error.details.retry_after_seconds > 0);
  assert.ok(Number(res.headers.get('retry-after')) > 0, 'Retry-After header');
});

test('TC-01-02: successful logins do not use up the budget, only failed ones do', async (t) => {
  const call = await startApp(t);
  const ok = { headers: { 'x-outcome': 'ok' } };
  assert.deepEqual(await statuses(call, 6, 'POST', '/api/auth/login', ok), [200, 200, 200, 200, 200, 200]);
  assert.equal((await call('POST', '/api/auth/login')).status, 401, 'a failure after many successes is still within budget');
});

test('TC-01-03: each client address has its own budget', async (t) => {
  const call = await startApp(t);
  await statuses(call, 4, 'POST', '/api/auth/login', { ip: '198.51.100.7' });
  assert.equal((await call('POST', '/api/auth/login', { ip: '198.51.100.7' })).status, 429);
  assert.equal((await call('POST', '/api/auth/login', { ip: '198.51.100.8' })).status, 401, 'another client is not limited');
});

// Behind Render the proxy appends the real client address on the right of the chain.
// Whatever a client puts on the left must not give it a fresh budget.
test('TC-01-04: spoofing the left of X-Forwarded-For does not get around the limit', async (t) => {
  const call = await startApp(t);
  const results = [];
  for (let i = 0; i < 5; i += 1) {
    results.push((await call('POST', '/api/auth/login', { ip: `10.0.0.${i}, 198.51.100.9` })).status);
  }
  assert.deepEqual(results, [401, 401, 401, 429, 429]);
});

test('TC-01-05: reset requests are limited, with a clear message', async (t) => {
  const call = await startApp(t);
  assert.deepEqual(await statuses(call, 3, 'POST', '/api/auth/reset-password'), [200, 200, 429]);
  const res = await call('POST', '/api/auth/reset-password');
  assert.match((await res.json()).error.message, /password reset/i);
});

// Codex review: a shared budget let a burst of reset REQUESTS (for example several people
// behind one campus address) lock someone out of using the link they had just been sent,
// inside the link's one-hour life. Redeeming a link needs an unguessable token, so it only
// gets its own, looser budget.
test('TC-01-11: using up the reset-request budget does not stop an issued link from being used', async (t) => {
  const call = await startApp(t);
  assert.deepEqual(await statuses(call, 3, 'POST', '/api/auth/reset-password'), [200, 200, 429]);
  assert.equal((await call('POST', '/api/auth/update-password')).status, 200, 'the emailed link still works');
});

test('TC-01-12: password updates have their own limit', async (t) => {
  const call = await startApp(t);
  assert.deepEqual(await statuses(call, 4, 'POST', '/api/auth/update-password'), [200, 200, 200, 429]);
  assert.equal((await call('POST', '/api/auth/reset-password')).status, 200, 'and do not limit reset requests');
});

test('TC-01-06: sign-up has its own limit', async (t) => {
  const call = await startApp(t);
  assert.deepEqual(await statuses(call, 3, 'POST', '/api/auth/register'), [201, 201, 429]);
});

test('TC-01-07: using up the login budget does not limit anything else', async (t) => {
  const call = await startApp(t);
  await statuses(call, 4, 'POST', '/api/auth/login');
  assert.equal((await call('GET', '/api/evaluate/tok')).status, 200);
  assert.equal((await call('GET', '/api/courses')).status, 200);
  assert.equal((await call('POST', '/api/auth/reset-password')).status, 200);
});

test('TC-02-01: student evaluation links are limited per client address', async (t) => {
  const call = await startApp(t);
  assert.deepEqual(await statuses(call, 5, 'GET', '/api/evaluate/tok'), [200, 200, 200, 200, 429]);
  assert.equal((await call('GET', '/api/evaluate/tok', { ip: '198.51.100.20' })).status, 200);
});

test('TC-04-01: the whole API has a general limit, but the health check never counts', async (t) => {
  const call = await startApp(t, { ...TINY, general: { windowMs: WINDOW, limit: 5 } });
  assert.deepEqual(await statuses(call, 6, 'GET', '/api/courses'), [200, 200, 200, 200, 200, 429]);
  const health = await statuses(call, 20, 'GET', '/api/health');
  assert.ok(health.every((s) => s === 200), 'Render polls /api/health constantly; it must never be limited');
});

test('TC-01-08: the defaults match what the docs say', () => {
  const minute = 60 * 1000;
  assert.deepEqual(DEFAULT_LIMITS.login, { windowMs: 15 * minute, limit: 10 });
  assert.deepEqual(DEFAULT_LIMITS.signup, { windowMs: 60 * minute, limit: 10 });
  assert.deepEqual(DEFAULT_LIMITS.reset, { windowMs: 60 * minute, limit: 5 });
  assert.deepEqual(DEFAULT_LIMITS.update, { windowMs: 60 * minute, limit: 20 });
  assert.deepEqual(DEFAULT_LIMITS.evaluate, { windowMs: 15 * minute, limit: 600 });
  assert.deepEqual(DEFAULT_LIMITS.general, { windowMs: 15 * minute, limit: 1000 });
  assert.deepEqual(readLimits({}), DEFAULT_LIMITS);
});

test('TC-01-09: limits can be tuned with environment variables; bad values fall back', () => {
  const tuned = readLimits({ RATE_LIMIT_LOGIN_MAX: '25', RATE_LIMIT_EVALUATE_MAX: '900', RATE_LIMIT_RESET_MAX: '8', RATE_LIMIT_UPDATE_MAX: '40' });
  assert.equal(tuned.update.limit, 40);
  assert.equal(tuned.login.limit, 25);
  assert.equal(tuned.evaluate.limit, 900);
  assert.equal(tuned.reset.limit, 8);
  assert.equal(tuned.login.windowMs, DEFAULT_LIMITS.login.windowMs, 'only the count is tunable');
  for (const bad of ['abc', '0', '-5', '1.5', '', ' ']) {
    assert.equal(readLimits({ RATE_LIMIT_LOGIN_MAX: bad }).login.limit, DEFAULT_LIMITS.login.limit, JSON.stringify(bad));
  }
});

test('TC-01-10: trust proxy is one hop by default (Render), and can be set', () => {
  assert.equal(trustProxyHops({}), 1);
  assert.equal(trustProxyHops({ TRUST_PROXY: '2' }), 2);
  assert.equal(trustProxyHops({ TRUST_PROXY: '0' }), 0);
  for (const bad of ['true', 'abc', '-1', '1.5', '']) assert.equal(trustProxyHops({ TRUST_PROXY: bad }), 1, bad);
});
