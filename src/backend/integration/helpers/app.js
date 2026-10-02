// Express app for the integration tests: the real routers, middleware and error handler from
// index.js, without its side effects (index.js connects to MongoDB and starts listening when
// it is required). The rate limits are left out so tests can log in as often as they need;
// they have their own tests. If index.js gains a router, add it here too.
process.env.JWT_SECRET = process.env.JWT_SECRET || 'integration-test-secret-at-least-32-characters';

const express = require('express');
const jwt = require('jsonwebtoken');
const errorHandler = require('../../middleware/errorHandler');

async function startApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/auth', require('../../routes/auth'));
  app.use('/api/courses', require('../../routes/courses'));
  app.use('/api/evaluate', require('../../routes/evaluate'));
  app.use('/api/professor', require('../../routes/professor'));
  app.use(errorHandler);

  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  // JSON request helper. `token` adds a bearer header; `body` is sent as JSON.
  async function request(method, path, { token, body } = {}) {
    const res = await fetch(baseUrl + path, {
      method,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : null };
  }

  const tokenFor = (professorId, email) =>
    jwt.sign({ id: String(professorId), email }, process.env.JWT_SECRET, { expiresIn: '1h' });

  return { request, tokenFor, close: () => new Promise((resolve) => server.close(resolve)) };
}

module.exports = { startApp };
