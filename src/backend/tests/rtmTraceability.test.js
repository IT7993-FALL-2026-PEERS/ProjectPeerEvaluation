const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { checkRtm, findKnownIds, expandIds } = require('../../../scripts/check-rtm');

// The check behind docs/requirements/rtm.md (backlog CICD-23): every test ID the matrix cites must
// exist in the code, every file it names must exist, and every requirement that is not Unsupported
// or Planned must cite at least one test that exists. The matrix can no longer point at a test
// that was renamed or never written.
const SCRIPT = path.join(__dirname, '..', '..', '..', 'scripts', 'check-rtm.js');
const REPO = path.join(__dirname, '..', '..', '..');

// A throwaway repository: `files` maps a path to the test IDs defined in it, `rtm` is the matrix.
function fixture(files, rtm, extra = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rtm-'));
  for (const [file, ids] of Object.entries(files)) {
    const full = path.join(root, ...file.split('/'));
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, ids.map((id) => `test('${id}: something', () => {});`).join('\n'));
  }
  fs.mkdirSync(path.join(root, 'docs', 'requirements'), { recursive: true });
  const rtmPath = path.join(root, 'docs', 'requirements', 'rtm.md');
  fs.writeFileSync(rtmPath, rtm);
  for (const [file, text] of Object.entries(extra)) fs.writeFileSync(path.join(root, ...file.split('/')), text);
  return { root, rtmPath };
}

const HEADER = [
  '| Business requirement ID | Functional requirement ID | Workflow | Test cases (existing) | Test type | Planned coverage | Status |',
  '|---|---|---|---|---|---|---|',
];
const matrix = (...rows) => [...HEADER, ...rows].join('\n') + '\n';
const row = (fr, tests, status = 'Validated') => `| FR9.9 | ${fr} Something | CW-01 | ${tests} | Unit | — | ${status} |`;

const check = (files, rtm, requirements = ['FR-01']) => {
  const { root, rtmPath } = fixture(files, rtm);
  return checkRtm({ root, rtmPath, requirements });
};

test('TC-RTM-01: the real matrix cites only tests and files that exist, and every covered requirement has one', () => {
  const result = checkRtm({ root: REPO });

  assert.deepEqual(result.problems, []);
  assert.ok(result.citedIds.size >= 100, `expected the matrix to cite many test IDs, found ${result.citedIds.size}`);
});

test('TC-RTM-02: test IDs are read from test titles in the backend, integration and E2E folders only', () => {
  const { root } = fixture({
    'src/backend/tests/a.test.js': ['TC-01-01'],
    'src/backend/integration/b.integration.js': ['TC-05-30'],
    'e2e/c.spec.js': ['E2E-07'],
    'docs/not-a-test.js': ['TC-99-99'],
  }, '');
  fs.writeFileSync(path.join(root, 'src', 'backend', 'tests', 'comment.test.js'), '// TC-77-01 is only mentioned here\nconst x = "TC-77-02";\n');

  const known = findKnownIds(root);

  assert.deepEqual([...known].sort(), ['E2E-07', 'TC-01-01', 'TC-05-30']);
});

test('TC-RTM-03: a cited ID that no test defines is reported with its requirement', () => {
  const result = check({ 'src/backend/tests/a.test.js': ['TC-01-01'] }, matrix(row('FR-01', '`a.test.js`: TC-01-01, TC-01-02')));

  assert.equal(result.problems.length, 1);
  assert.match(result.problems[0], /TC-01-02/);
  assert.match(result.problems[0], /FR-01/);
});

test('TC-RTM-04: a range is expanded and every number in it has to exist', () => {
  assert.deepEqual(expandIds('TC-16-20..22'), ['TC-16-20', 'TC-16-21', 'TC-16-22']);
  assert.deepEqual(expandIds('E2E-37..38'), ['E2E-37', 'E2E-38']);
  assert.deepEqual(expandIds('TC-SEC-01..02'), ['TC-SEC-01', 'TC-SEC-02']);

  const result = check({ 'src/backend/integration/a.integration.js': ['TC-16-20', 'TC-16-21'] }, matrix(row('FR-01', '`a.integration.js`: TC-16-20..22')));

  assert.equal(result.problems.length, 1);
  assert.match(result.problems[0], /TC-16-22/);
});

test('TC-RTM-05: an E2E ID is checked the same way', () => {
  const ok = check({ 'e2e/a.spec.js': ['E2E-01'] }, matrix(row('FR-01', '`a.spec.js`: E2E-01')));
  assert.deepEqual(ok.problems, []);

  const bad = check({ 'e2e/a.spec.js': ['E2E-01'] }, matrix(row('FR-01', '`a.spec.js`: E2E-01, E2E-02')));
  assert.match(bad.problems.join('\n'), /E2E-02/);
});

test('TC-RTM-06: a cited test file that does not exist is reported, and a * stands for any run of characters', () => {
  const files = {
    'src/backend/tests/a.test.js': ['TC-01-01'],
    'src/backend/integration/atomic.replicaSet.integration.js': ['TC-16-30'],
  };

  const missing = check(files, matrix(row('FR-01', '`a.test.js` TC-01-01 · `gone.test.js`')));
  assert.equal(missing.problems.length, 1);
  assert.match(missing.problems[0], /gone\.test\.js/);

  const wildcard = check(files, matrix(row('FR-01', '`a.test.js` TC-01-01 · `atomic.*.integration.js`')));
  assert.deepEqual(wildcard.problems, []);

  const noMatch = check(files, matrix(row('FR-01', '`a.test.js` TC-01-01 · `nothing.*.integration.js`')));
  assert.match(noMatch.problems.join('\n'), /nothing\.\*\.integration\.js/);
});

test('TC-RTM-07: a requirement that is not Unsupported or Planned must cite a test that exists', () => {
  const files = { 'src/backend/tests/a.test.js': ['TC-01-01'] };

  const none = check(files, matrix(row('FR-01', '—')));
  assert.equal(none.problems.length, 1);
  assert.match(none.problems[0], /FR-01.*no test/);

  const fileOnly = check(files, matrix(row('FR-01', '`a.test.js`')));
  assert.match(fileOnly.problems.join('\n'), /FR-01.*no test ID/);

  for (const status of ['Unsupported', 'Planned (D-09) — rubric is hardcoded']) {
    assert.deepEqual(check(files, matrix(row('FR-01', '—', status))).problems, [], status);
  }
});

test('TC-RTM-08: a requirement that is missing from the matrix is reported', () => {
  const result = check({ 'src/backend/tests/a.test.js': ['TC-01-01'] }, matrix(row('FR-01', 'TC-01-01')), ['FR-01', 'FR-02']);

  assert.equal(result.problems.length, 1);
  assert.match(result.problems[0], /FR-02.*not in the matrix/);
});

test('TC-RTM-09: IDs in the non-functional table and in the notes are checked too', () => {
  const rtm = matrix(row('FR-01', 'TC-01-01')) + '\n| Concern | Test cases | Traces to |\n|---|---|---|\n| Something | TC-SEC-09 | note |\n\nSee also TC-55-01 in the notes.\n';
  const result = check({ 'src/backend/tests/a.test.js': ['TC-01-01'] }, rtm);

  assert.equal(result.problems.length, 2);
  assert.match(result.problems.join('\n'), /TC-SEC-09/);
  assert.match(result.problems.join('\n'), /TC-55-01/);
});

test('TC-RTM-10: the command exits 0 on the real repository and prints what it checked', () => {
  const run = spawnSync(process.execPath, [SCRIPT], { encoding: 'utf8' });

  assert.equal(run.status, 0, run.stdout + run.stderr);
  assert.match(run.stdout, /RTM check: .*all found/);
});

test('TC-RTM-11: the command exits 1 and lists each problem when the matrix cites a test that does not exist', () => {
  const { root, rtmPath } = fixture({ 'src/backend/tests/a.test.js': ['TC-01-01'] }, matrix(row('FR-01', 'TC-01-01, TC-01-09')));

  const run = spawnSync(process.execPath, [SCRIPT, '--root', root, '--rtm', rtmPath, '--requirements', 'FR-01'], { encoding: 'utf8' });

  assert.equal(run.status, 1);
  assert.match(run.stdout + run.stderr, /TC-01-09/);
});

test('TC-RTM-12: the command exits 2 when the matrix cannot be read', () => {
  const run = spawnSync(process.execPath, [SCRIPT, '--rtm', path.join(os.tmpdir(), 'no-such-rtm.md')], { encoding: 'utf8' });

  assert.equal(run.status, 2);
});
