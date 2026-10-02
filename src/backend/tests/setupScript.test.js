const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

// scripts/setup.js (CICD-50): a fresh clone gets a root .env and a src/backend/.env, each with a
// random JWT_SECRET; an existing .env is never touched. The script resolves everything from its own
// location, so each test copies it into a throwaway folder shaped like the repo and runs it there.
const repoRoot = path.join(__dirname, '..', '..', '..');

function makeRepo({ rootExample = true, backendExample = true } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'peers-setup-'));
  fs.mkdirSync(path.join(dir, 'scripts'));
  fs.mkdirSync(path.join(dir, 'src', 'backend'), { recursive: true });
  fs.copyFileSync(path.join(repoRoot, 'scripts', 'setup.js'), path.join(dir, 'scripts', 'setup.js'));
  fs.writeFileSync(path.join(dir, '.nvmrc'), '1\n');
  if (rootExample) {
    fs.writeFileSync(path.join(dir, '.env.example'), 'JWT_SECRET=replace-me\nFRONTEND_PORT=3000\n');
  }
  if (backendExample) {
    fs.writeFileSync(
      path.join(dir, 'src', 'backend', '.env.example'),
      'PORT=5000\nJWT_SECRET=replace-me\nMONGODB_URI=mongodb://localhost:27017/peer-eval\n'
    );
  }
  return dir;
}

const runSetup = (dir) =>
  spawnSync(process.execPath, [path.join(dir, 'scripts', 'setup.js'), '--env-only'], { encoding: 'utf8' });

const cleanup = (dir) => fs.rmSync(dir, { recursive: true, force: true });

test('TC-50-01: a missing .env is created in the root and in src/backend', () => {
  const dir = makeRepo();
  try {
    const result = runSetup(dir);
    assert.equal(result.status, 0, result.stderr);
    assert.ok(fs.existsSync(path.join(dir, '.env')));
    assert.ok(fs.existsSync(path.join(dir, 'src', 'backend', '.env')));
  } finally {
    cleanup(dir);
  }
});

test('TC-50-02: the new .env keeps the example values and gets a random 96-character JWT_SECRET', () => {
  const dir = makeRepo();
  try {
    runSetup(dir);
    const backendEnv = fs.readFileSync(path.join(dir, 'src', 'backend', '.env'), 'utf8');
    assert.match(backendEnv, /^PORT=5000$/m);
    assert.match(backendEnv, /^MONGODB_URI=mongodb:\/\/localhost:27017\/peer-eval$/m);
    assert.match(backendEnv, /^JWT_SECRET=[0-9a-f]{96}$/m);
    assert.doesNotMatch(backendEnv, /replace-me/);

    const rootSecret = fs.readFileSync(path.join(dir, '.env'), 'utf8').match(/^JWT_SECRET=(.*)$/m)[1];
    const backendSecret = backendEnv.match(/^JWT_SECRET=(.*)$/m)[1];
    assert.notEqual(rootSecret, backendSecret, 'each file gets its own secret');
  } finally {
    cleanup(dir);
  }
});

test('TC-50-03: an existing .env is left byte-for-byte untouched', () => {
  const dir = makeRepo();
  try {
    const mine = 'JWT_SECRET=my-own-secret\r\nSMTP_PASS=keep me\r\n';
    fs.writeFileSync(path.join(dir, '.env'), mine);
    fs.writeFileSync(path.join(dir, 'src', 'backend', '.env'), mine);
    const result = runSetup(dir);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(fs.readFileSync(path.join(dir, '.env'), 'utf8'), mine);
    assert.equal(fs.readFileSync(path.join(dir, 'src', 'backend', '.env'), 'utf8'), mine);
  } finally {
    cleanup(dir);
  }
});

test('TC-50-04: running setup twice does not change the files it created', () => {
  const dir = makeRepo();
  try {
    runSetup(dir);
    const first = fs.readFileSync(path.join(dir, '.env'), 'utf8');
    runSetup(dir);
    assert.equal(fs.readFileSync(path.join(dir, '.env'), 'utf8'), first);
  } finally {
    cleanup(dir);
  }
});

test('TC-50-05: a missing .env.example fails with a non-zero exit and creates no .env', () => {
  const dir = makeRepo({ rootExample: false });
  try {
    const result = runSetup(dir);
    assert.notEqual(result.status, 0);
    assert.ok(!fs.existsSync(path.join(dir, '.env')));
  } finally {
    cleanup(dir);
  }
});

test('TC-50-06: both example files the script needs are committed to the repo', () => {
  assert.ok(fs.existsSync(path.join(repoRoot, '.env.example')), 'root .env.example');
  assert.ok(fs.existsSync(path.join(repoRoot, 'src', 'backend', '.env.example')), 'backend .env.example');
});
