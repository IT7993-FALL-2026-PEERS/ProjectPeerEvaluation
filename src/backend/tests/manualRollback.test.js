const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// CICD-78: Manual Rollback (manual-rollback.yml) starts cd.yml and finds the run it started by the run's title.
// If either file changes the title or the rules the other one depends on, a rollback would start but not be
// followed, or be refused at the wrong place. These tests keep the two files in step.
const read = (name) => fs.readFileSync(path.join(__dirname, '..', '..', '..', '.github', 'workflows', name), 'utf8').replace(/\r\n/g, '\n');
const manual = read('manual-rollback.yml');
const cd = read('cd.yml');

test('TC-29-78: cd.yml titles a manual rollback run "CD: roll back to <tag>", the title Manual Rollback looks for', () => {
  assert.match(cd, /^run-name: .*inputs\.rollback_to != ''.*format\('CD: roll back to \{0\}', inputs\.rollback_to\)/m);
  assert.ok(manual.includes('.displayTitle == \\"CD: roll back to ${TAG}\\"'));
});

test('TC-29-79: Manual Rollback accepts the same rc tag shape as cd.yml and runs only from main', () => {
  const pattern = '^rc-[0-9]{8}-[0-9]{4}-[0-9a-f]{7}$';
  assert.ok(cd.includes(pattern), 'cd.yml tag pattern');
  assert.ok(manual.includes(pattern), 'manual-rollback.yml tag pattern');
  assert.match(manual, /if: github\.ref == 'refs\/heads\/main'/);
  assert.match(manual, /gh workflow run cd\.yml .*--ref main -f rollback_to="\$TAG"/);
  assert.match(cd, /github\.event_name == 'workflow_dispatch' && github\.ref == 'refs\/heads\/main'/);
});

test('TC-29-80: Manual Rollback may start a workflow and nothing else, takes the tag only through env, and refuses while CD is busy', () => {
  assert.match(manual, /permissions:\n {6}actions: write\n {6}contents: read/);
  assert.doesNotMatch(manual, /(contents|packages|id-token|pull-requests): write/);
  // The pasted value never appears inside a script: only as an environment variable.
  assert.doesNotMatch(manual, /run: .*\$\{\{ *inputs\./);
  assert.match(manual, /RELEASE: \$\{\{ inputs\.release \}\}/);
  assert.match(manual, /select\(\.status != "completed"\)/);
});
