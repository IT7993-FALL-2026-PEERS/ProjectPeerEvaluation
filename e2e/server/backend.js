// The backend for the end-to-end tests (CICD-26): the real app (src/backend/index.js, with its
// routers, CORS and rate limits) on a throwaway MongoDB, seeded with the integration-test fixture.
// Email is captured at the Nodemailer transport and never sent.
//
//   node e2e/server/backend.js
//
// Playwright starts this (see playwright.config.js). A small control server on CONTROL_PORT lets the
// tests reset the data and read the captured email:
//
//   POST   /reset    empties the database, seeds it again, clears the captured email;
//                    /reset?evaluations=1 also adds the fixed set of submitted evaluations
//   GET    /emails   the captured emails, oldest first: [{ to, subject, html }]
//   GET    /health   { e2e: true }: Playwright waits for this, so an ordinary backend that happens to
//                    be running on the API port is never mistaken for this one
//
// The MongoDB binary is downloaded on first use (see the integration tests' notes); set
// MONGOMS_VERSION to use one you already have.
const http = require('node:http');
const net = require('node:net');
const path = require('node:path');
const { createRequire } = require('node:module');

const backendDir = path.join(__dirname, '..', '..', 'src', 'backend');
const fromBackend = createRequire(path.join(backendDir, 'package.json'));

const API_PORT = Number(process.env.E2E_API_PORT || 5000);
const CONTROL_PORT = Number(process.env.E2E_CONTROL_PORT || 5051);

Object.assign(process.env, {
  PORT: String(API_PORT),
  JWT_SECRET: 'e2e-test-secret-at-least-32-characters-long',
  FRONTEND_URL: process.env.E2E_FRONTEND_URL || 'http://localhost:3000',
  EMAIL_SEND_INTERVAL_MS: '0',
  // Every test logs in from the same address; the limits have their own tests.
  RATE_LIMIT_LOGIN_MAX: '10000',
  RATE_LIMIT_GENERAL_MAX: '100000',
  RATE_LIMIT_EVALUATE_MAX: '10000',
  RATE_LIMIT_UPDATE_MAX: '10000',
  RATE_LIMIT_RESET_MAX: '10000',
  RATE_LIMIT_SIGNUP_MAX: '10000',
});

// The tests must talk to this backend and its throwaway database, never to a developer's own backend
// (which may point at a real database and a real mail account). If something already listens on the
// API port, stop here instead of letting the browser reach it.
function assertPortFree(port) {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once('error', () => reject(new Error(
      `Port ${port} is already in use by another server, so the E2E backend cannot start. ` +
      'Stop that server (for example your local backend) and run the tests again.'
    )));
    probe.once('listening', () => probe.close(() => resolve()));
    probe.listen(port);
  });
}

// Capture email before anything loads emailUtils.
const nodemailer = fromBackend('nodemailer');
const sentEmails = [];
const createTransport = nodemailer.createTransport;
nodemailer.createTransport = () => {
  const transport = createTransport({ jsonTransport: true });
  const sendMail = transport.sendMail.bind(transport);
  transport.sendMail = async (options) => {
    const info = await sendMail(options);
    sentEmails.push({ to: options.to, subject: options.subject, html: options.html });
    return info;
  };
  return transport;
};

async function main() {
  await assertPortFree(API_PORT);
  const { MongoMemoryReplSet } = fromBackend('mongodb-memory-server');
  const mongoose = fromBackend('mongoose');
  // The models, the database helpers and the seed come from the integration tests.
  const { clearDatabase } = require(path.join(backendDir, 'integration', 'helpers', 'db'));
  const { seed, PASSWORDS } = require(path.join(backendDir, 'integration', 'helpers', 'seed'));
  const { seedEvaluations } = require(path.join(backendDir, 'integration', 'helpers', 'evaluations'));

  const version = process.env.MONGOMS_VERSION || '8.0.32';
  const replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 }, binary: { version } });
  const uri = replSet.getUri('peers-e2e');
  process.env.MONGODB_URI = uri;

  await mongoose.connect(uri);
  await Promise.all(Object.values(mongoose.models).map((model) => model.init()));
  await seed();

  // The real app starts after the seed, so its health check only answers once the data is in.
  require(path.join(backendDir, 'index.js'));

  const control = http.createServer(async (req, res) => {
    const json = (status, body) => {
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(body));
    };
    try {
      if (req.method === 'POST' && req.url.split('?')[0] === '/reset') {
        await clearDatabase();
        await seed();
        if (new URL(req.url, 'http://x').searchParams.get('evaluations') === '1') await seedEvaluations();
        sentEmails.length = 0;
        return json(200, { passwords: PASSWORDS, professor: 'ada@example.edu', course: 'CS 4850' });
      }
      if (req.method === 'GET' && req.url === '/emails') return json(200, sentEmails);
      if (req.method === 'GET' && req.url === '/health') return json(200, { e2e: true });
      return json(404, { error: 'not found' });
    } catch (err) {
      return json(500, { error: err.message });
    }
  });
  control.listen(CONTROL_PORT, '127.0.0.1', () => console.log(`E2E control server on ${CONTROL_PORT}`));

  const stop = async () => {
    control.close();
    await mongoose.disconnect();
    await replSet.stop();
    process.exit(0);
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
