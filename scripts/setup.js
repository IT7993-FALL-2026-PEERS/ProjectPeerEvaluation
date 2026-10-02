#!/usr/bin/env node
// One-command setup for a fresh clone. Run with: npm run setup
//
// Written in Node (not bash) so it behaves the same on Windows, macOS and Linux:
// npm runs scripts through cmd.exe on Windows, where `bash` is not guaranteed.
// Safe to run repeatedly: it never overwrites an existing .env and skips installs
// that are already up to date.
//
//   node scripts/setup.js              full setup (env files + dependencies)
//   node scripts/setup.js --env-only   only create missing .env files (used by docker:up)
//   node scripts/setup.js --force      reinstall dependencies even if up to date

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const backend = path.join(root, 'src', 'backend');
const args = new Set(process.argv.slice(2));
const envOnly = args.has('--env-only');
const force = args.has('--force');

const log = (msg) => console.log(msg);
const fail = (msg) => {
  console.error(`\n✖ ${msg}`);
  process.exit(1);
};

// 1. Node version: single source of truth is .nvmrc (same file CI reads).
function checkNode() {
  const required = fs.readFileSync(path.join(root, '.nvmrc'), 'utf8').trim().replace(/^v/, '');
  const requiredMajor = parseInt(required, 10);
  const currentMajor = parseInt(process.versions.node, 10);
  if (currentMajor < requiredMajor) {
    fail(
      `Node ${requiredMajor}+ is required (found ${process.versions.node}).\n` +
        `  Install Node ${requiredMajor} from https://nodejs.org/ or run: nvm use`
    );
  }
  log(`✔ Node ${process.versions.node} (needs ${requiredMajor}+)`);
}

// 2. Copy .env.example -> .env only when .env is missing; give it a random JWT_SECRET.
function ensureEnvFile(dir, label) {
  const example = path.join(dir, '.env.example');
  const target = path.join(dir, '.env');
  if (fs.existsSync(target)) {
    log(`✔ ${label}/.env already exists (left untouched)`);
    return;
  }
  const secret = crypto.randomBytes(48).toString('hex');
  const text = fs
    .readFileSync(example, 'utf8')
    .replace(/^JWT_SECRET=.*$/m, `JWT_SECRET=${secret}`);
  fs.writeFileSync(target, text, { mode: 0o600 });
  log(`✔ Created ${label}/.env from .env.example (random JWT_SECRET generated)`);
}

// 3. npm ci unless node_modules is already newer than the lockfile.
function upToDate(dir) {
  if (force) return false;
  const lock = path.join(dir, 'package-lock.json');
  const installed = path.join(dir, 'node_modules', '.package-lock.json');
  if (!fs.existsSync(installed)) return false;
  return fs.statSync(installed).mtimeMs >= fs.statSync(lock).mtimeMs;
}

function install(dir, label) {
  if (upToDate(dir)) {
    log(`✔ ${label} dependencies already installed`);
    return;
  }
  log(`… Installing ${label} dependencies (npm ci)`);
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  // shell:true is required to spawn .cmd files on current Node for Windows.
  const result = spawnSync(npm, ['ci'], { cwd: dir, stdio: 'inherit', shell: process.platform === 'win32' });
  if (result.status !== 0) fail(`npm ci failed in ${label}. Check your Node/npm versions (Node 24, npm 11) and network.`);
  log(`✔ ${label} dependencies installed`);
}

checkNode();
ensureEnvFile(root, 'root');
ensureEnvFile(backend, 'src/backend');

if (envOnly) process.exit(0);

// Root `npm ci` also runs the root "postinstall" hook, which installs the backend.
// The second call then finds the backend already up to date and skips it.
install(root, 'root (frontend)');
install(backend, 'backend');

log(`
Setup complete. Next steps:
  1. Make sure MongoDB is reachable at MONGODB_URI in src/backend/.env
     (default mongodb://localhost:27017/peer-eval). No local MongoDB?
       docker run -d --name peers-dev-mongo -p 27017:27017 mongo:7
  2. npm run dev                      # frontend :3000 + backend :5000
  3. bash scripts/verify-env.sh       # in a second terminal, confirms both are up
Prefer containers? Run: npm run docker:up   (see docs/docker-setup.md)
Email sending needs real SMTP_* values in src/backend/.env; the app starts without them.`);
