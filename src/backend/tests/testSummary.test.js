const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const {
  parseNodeTestReport,
  parseJestReport,
  parsePlaywrightReport,
  formatDuration,
  formatMarkdown,
} = require('../../../scripts/test-summary');

// The test summary (CICD-29): turns each runner's own result file into a "tests run, passed,
// failed, skipped, duration" table in the CI job summary. It reports; the test step itself is
// what fails the job. A result file that is missing, cut off or empty is an error, so a run that
// never happened cannot look like a run that passed.
const scriptPath = path.join(__dirname, '..', '..', '..', 'scripts', 'test-summary.js');

// What node --test --test-reporter=junit writes: the totals are in comments at the end.
const nodeReport = (totals = {}) => {
  const t = { tests: 10, suites: 0, pass: 9, fail: 1, cancelled: 0, skipped: 0, todo: 0, duration_ms: 2500.5, ...totals };
  return [
    '<?xml version="1.0" encoding="utf-8"?>',
    '<testsuites>',
    '\t<testcase name="a" time="0.001" classname="test" file="x.js"/>',
    ...Object.entries(t).map(([key, value]) => `\t<!-- ${key} ${value} -->`),
    '</testsuites>',
    '',
  ].join('\n');
};

// What jest --json --outputFile writes (only the fields the summary reads).
const jestReport = (overrides = {}) => JSON.stringify({
  numTotalTests: 51,
  numPassedTests: 49,
  numFailedTests: 1,
  numPendingTests: 1,
  numTodoTests: 0,
  startTime: 1000,
  testResults: [
    { startTime: 1100, endTime: 3000 },
    { startTime: 1200, endTime: 6500 },
  ],
  ...overrides,
});

// What Playwright's json reporter writes: the totals are under "stats".
const playwrightReport = (stats = {}) => JSON.stringify({
  stats: { startTime: '2026-10-03T02:37:16.616Z', duration: 22201.278, expected: 15, skipped: 1, unexpected: 0, flaky: 0, ...stats },
});

test('TC-29-01: the node test report gives tests, passed, failed, skipped and duration', () => {
  const result = parseNodeTestReport(nodeReport());
  assert.deepEqual(result, { total: 10, passed: 9, failed: 1, skipped: 0, flaky: 0, durationMs: 2500.5 });
});

test('TC-29-02: cancelled tests count as failed, and todo tests as skipped', () => {
  const result = parseNodeTestReport(nodeReport({ tests: 12, pass: 8, fail: 1, cancelled: 2, skipped: 0, todo: 1 }));
  assert.equal(result.failed, 3);
  assert.equal(result.skipped, 1);
});

test('TC-29-03: a node test report that is cut off, has no totals or ran nothing is refused', () => {
  assert.throws(() => parseNodeTestReport(''), /no totals/i);
  assert.throws(() => parseNodeTestReport('<testsuites>\n\t<!-- tests 10 -->\n</testsuites>'), /pass/);
  assert.throws(() => parseNodeTestReport(nodeReport({ tests: 0, pass: 0, fail: 0 })), /no tests/i);
  assert.throws(() => parseNodeTestReport(nodeReport({ tests: 'many' })), /tests/);
});

test('TC-29-04: the Jest report gives the counts, and the duration from the run start to the last file finish', () => {
  const result = parseJestReport(jestReport());
  assert.deepEqual(result, { total: 51, passed: 49, failed: 1, skipped: 1, flaky: 0, durationMs: 5500 });
});

test('TC-29-05: a Jest report that is not JSON, has no counts or ran nothing is refused', () => {
  assert.throws(() => parseJestReport('not json'), /not valid JSON/i);
  assert.throws(() => parseJestReport('{}'), /numTotalTests/);
  assert.throws(() => parseJestReport(jestReport({ numTotalTests: 0, numPassedTests: 0, numFailedTests: 0, numPendingTests: 0 })), /no tests/i);
  assert.throws(() => parseJestReport(jestReport({ testResults: [] })), /duration/i);
});

test('TC-29-06: the Playwright report gives the counts and the run time, and a flaky test counts as passed', () => {
  assert.deepEqual(parsePlaywrightReport(playwrightReport()), { total: 16, passed: 15, failed: 0, skipped: 1, flaky: 0, durationMs: 22201.278 });
  const flaky = parsePlaywrightReport(playwrightReport({ expected: 14, flaky: 1 }));
  assert.equal(flaky.passed, 15);
  assert.equal(flaky.flaky, 1);
  assert.equal(flaky.total, 16);
});

test('TC-29-07: a Playwright report that is not JSON, has no stats or ran nothing is refused', () => {
  assert.throws(() => parsePlaywrightReport('nope'), /not valid JSON/i);
  assert.throws(() => parsePlaywrightReport('{}'), /stats/i);
  assert.throws(() => parsePlaywrightReport(playwrightReport({ expected: 0, skipped: 0 })), /no tests/i);
  assert.throws(() => parsePlaywrightReport(playwrightReport({ unexpected: -1 })), /unexpected/);
});

test('TC-29-08: durations read as seconds under a minute and minutes and seconds after', () => {
  assert.equal(formatDuration(400), '0.4 s');
  assert.equal(formatDuration(2500.5), '2.5 s');
  assert.equal(formatDuration(59949), '59.9 s');
  assert.equal(formatDuration(125000), '2 min 5 s');
  assert.equal(formatDuration(3600000), '60 min 0 s');
});

test('TC-29-09: the table has one row with the five figures, and says so when something failed or was flaky', () => {
  const ok = formatMarkdown('Backend unit tests', { total: 290, passed: 290, failed: 0, skipped: 0, flaky: 0, durationMs: 1900 });
  assert.match(ok, /### Backend unit tests/);
  assert.match(ok, /\| Tests \| Passed \| Failed \| Skipped \| Duration \|/);
  assert.match(ok, /\| 290 \| 290 \| 0 \| 0 \| 1\.9 s \|/);
  assert.doesNotMatch(ok, /failed\.|flaky/i);

  const bad = formatMarkdown('Integration tests', { total: 10, passed: 8, failed: 2, skipped: 0, flaky: 0, durationMs: 1000 });
  assert.match(bad, /2 tests failed\./);

  const one = formatMarkdown('Integration tests', { total: 10, passed: 9, failed: 1, skipped: 0, flaky: 0, durationMs: 1000 });
  assert.match(one, /1 test failed\./);

  const flaky = formatMarkdown('End-to-end tests', { total: 16, passed: 16, failed: 0, skipped: 0, flaky: 2, durationMs: 22000 });
  assert.match(flaky, /2 tests passed only after a retry/);
});

function run(args, env = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-summary-'));
  const summary = path.join(dir, 'summary.md');
  const result = spawnSync(process.execPath, [scriptPath, ...args], {
    encoding: 'utf8',
    env: { ...process.env, GITHUB_STEP_SUMMARY: summary, ...env },
  });
  return { ...result, dir, summaryText: fs.existsSync(summary) ? fs.readFileSync(summary, 'utf8') : '' };
}

function write(dir, name, text) {
  const file = path.join(dir, name);
  fs.writeFileSync(file, text);
  return file;
}

test('TC-29-10: the command prints the table and appends it to the job summary, and exits 0 even when tests failed', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-summary-in-'));
  const file = write(dir, 'junit.xml', nodeReport());
  const result = run(['Backend unit tests', 'node', file]);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /\| 10 \| 9 \| 1 \| 0 \| 2\.5 s \|/);
  assert.match(result.summaryText, /### Backend unit tests/);
  assert.match(result.summaryText, /1 test failed\./);
});

test('TC-29-11: the command reads Jest and Playwright files too', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-summary-in-'));
  const jest = run(['Frontend unit tests', 'jest', write(dir, 'jest.json', jestReport())]);
  assert.equal(jest.status, 0, jest.stderr);
  assert.match(jest.summaryText, /\| 51 \| 49 \| 1 \| 1 \| 5\.5 s \|/);
  const pw = run(['End-to-end tests', 'playwright', write(dir, 'pw.json', playwrightReport())]);
  assert.equal(pw.status, 0, pw.stderr);
  assert.match(pw.summaryText, /\| 16 \| 15 \| 0 \| 1 \| 22\.2 s \|/);
});

test('TC-29-12: a missing file, an unknown format or a broken report exits 2 and writes no summary', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-summary-in-'));
  const missing = run(['Backend unit tests', 'node', path.join(dir, 'nope.xml')]);
  assert.equal(missing.status, 2);
  assert.match(missing.stderr, /not found/i);
  assert.equal(missing.summaryText, '');

  const format = run(['Backend unit tests', 'tap', write(dir, 'a.txt', 'x')]);
  assert.equal(format.status, 2);
  assert.match(format.stderr, /usage/i);

  const broken = run(['Backend unit tests', 'node', write(dir, 'broken.xml', '<testsuites>')]);
  assert.equal(broken.status, 2);
  assert.equal(broken.summaryText, '');
});
