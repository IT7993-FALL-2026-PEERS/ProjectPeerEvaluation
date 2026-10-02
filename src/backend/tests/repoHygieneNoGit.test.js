const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');

// repoHygiene.test.js needs git. In a Docker image or a source archive there may be
// no git at all, and the backend suite must still pass there: the hygiene checks
// have to skip, not crash. This runs that file in a child process with git removed
// from PATH (a separate file, so the child can't start itself again).
test('the hygiene checks skip, not crash, when git is not installed', () => {
  const env = { ...process.env };
  for (const key of Object.keys(env)) {
    if (key.toLowerCase() === 'path') delete env[key];
  }
  env.PATH = '';
  // Inside `node --test` this variable makes a nested run act as a sub-process and
  // print nothing readable.
  delete env.NODE_TEST_CONTEXT;

  const child = ['--test', '--test-reporter=spec', path.join(__dirname, 'repoHygiene.test.js')];
  const result = spawnSync(process.execPath, child, {
    env,
    encoding: 'utf8',
  });

  assert.equal(result.status, 0, `exit ${result.status}\n${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /skipped 4/);
});
