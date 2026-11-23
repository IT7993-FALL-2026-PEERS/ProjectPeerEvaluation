// CICD-91: the configuration check runs once at startup, before the app connects or listens.
// With NODE_ENV=production a missing or short JWT_SECRET must stop the process with a clear message,
// as docs/startup-and-environment.md says, instead of a healthy service whose logins all fail.
// Each case starts the real entry point (index.js) in a child process.
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ENTRY = path.join(__dirname, '..', 'index.js');
const STARTED = /Server running on port/;

// The child runs from an empty folder, so dotenv finds no .env file and only the variables given
// here count. The database address points at a closed port: the app logs the connection error and
// still listens, which is all these cases need.
function start(extraEnv) {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'peers-startup-'));
  const env = { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, PORT: '0',
    MONGODB_URI: 'mongodb://127.0.0.1:1/peers-startup-test', ...extraEnv };
  // A coverage run (c8) passes NODE_V8_COVERAGE so the child's lines count too.
  if (process.env.NODE_V8_COVERAGE) env.NODE_V8_COVERAGE = process.env.NODE_V8_COVERAGE;
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [ENTRY], { cwd, env });
    let out = '';
    let result = null;
    // The first outcome wins: it started, it exited, or it did neither in time. A child still
    // running is stopped; the folder is removed once the child has closed (Windows keeps it locked
    // while the process lives).
    const decide = (r) => {
      if (result) return;
      result = r;
      clearTimeout(timer);
      if (child.exitCode === null) child.kill();
    };
    const collect = (chunk) => {
      out += chunk;
      if (STARTED.test(out)) decide({ started: true, code: null });
    };
    child.stdout.on('data', collect);
    child.stderr.on('data', collect);
    child.on('exit', (code) => decide({ started: false, code }));
    child.on('error', (err) => { out += `\n[spawn error] ${err.message}`; decide({ started: false, code: 'spawn-error' }); });
    child.on('close', () => {
      fs.rmSync(cwd, { recursive: true, force: true });
      resolve({ ...result, out });
    });
    const timer = setTimeout(() => decide({ started: false, code: 'timeout' }), 15000);
  });
}

test('TC-ENV-01: production without JWT_SECRET exits non-zero before listening and names the variable', async () => {
  const r = await start({ NODE_ENV: 'production' });
  assert.equal(r.started, false, r.out);
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /Invalid configuration/);
  assert.match(r.out, /JWT_SECRET is not set/);
});

test('TC-ENV-02: production with a 31-character JWT_SECRET exits non-zero before listening', async () => {
  const r = await start({ NODE_ENV: 'production', JWT_SECRET: 'x'.repeat(31) });
  assert.equal(r.started, false, r.out);
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /JWT_SECRET is too short/);
});

test('TC-ENV-03: production with a 32-character JWT_SECRET starts', async () => {
  const r = await start({ NODE_ENV: 'production', JWT_SECRET: 'x'.repeat(32) });
  assert.equal(r.started, true, r.out);
  assert.doesNotMatch(r.out, /Invalid configuration/);
});

test('TC-ENV-04: outside production a missing JWT_SECRET still starts, with the development warning', async () => {
  const r = await start({});
  assert.equal(r.started, true, r.out);
  assert.match(r.out, /JWT_SECRET is not set\. Using an insecure development default/);
});
