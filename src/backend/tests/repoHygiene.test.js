const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');

// Files that must never be committed: a real .env (it ends up holding secrets), the
// compiled frontend in build/ (stale output, and it rewrites itself on every local
// build), and runtime uploads. Docker build contexts (CICD-25) also depend on these
// being untracked. The tests need git and a checkout, so they skip anywhere else
// (a Docker image, a source archive); repoHygieneNoGit.test.js checks that skip.
const repoRoot = path.join(__dirname, '..', '..', '..');

function git(...args) {
  return spawnSync('git', args, { cwd: repoRoot, encoding: 'utf8' });
}

function skipReason() {
  const probe = git('rev-parse', '--is-inside-work-tree');
  if (probe.error) return 'git is not installed';
  if (probe.status !== 0 || probe.stdout.trim() !== 'true') return 'not inside a git checkout';
  return false;
}

const options = { skip: skipReason() };

// A failed `git ls-files` must fail the test, not look like "nothing is tracked".
function tracked(pattern) {
  const result = git('ls-files');
  assert.equal(result.status, 0, `git ls-files failed: ${result.stderr}`);
  return result.stdout.split('\n').filter((file) => pattern.test(file));
}

test('only .env.example is tracked, never a real .env', options, () => {
  const envFiles = tracked(/(^|\/)\.env(\..+)?$/).filter((file) => !file.endsWith('.env.example'));
  assert.deepEqual(envFiles, []);
});

test('the compiled build/ directory is not tracked', options, () => {
  assert.deepEqual(tracked(/^build\//), []);
});

test('uploaded files are not tracked', options, () => {
  assert.deepEqual(tracked(/(^|\/)uploads\//), []);
});

test('.gitignore covers .env, build/ and uploads/, but not .env.example', options, () => {
  // check-ignore -q exits 0 when the path is ignored, 1 when it is not, 128 on an error
  for (const file of ['src/backend/.env', 'src/backend/.env.local', 'build/index.html', 'src/backend/uploads/abc123']) {
    assert.equal(git('check-ignore', '-q', file).status, 0, `${file} should be ignored`);
  }
  assert.equal(git('check-ignore', '-q', 'src/backend/.env.example').status, 1, '.env.example must stay tracked');
});
