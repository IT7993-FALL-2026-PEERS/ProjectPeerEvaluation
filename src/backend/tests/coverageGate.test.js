const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const {
  parseLcov,
  parseJestSummary,
  evaluate,
  formatMarkdown,
} = require('../../../scripts/coverage-gate');

// The coverage gate (CICD-20): measures the backend (lcov from node:test) and the
// frontend (Jest json-summary) against the floors in coverage-floors.json, writes a
// table to the job summary, and fails when a number drops below its floor.
const scriptPath = path.join(__dirname, '..', '..', '..', 'scripts', 'coverage-gate.js');

const LCOV = [
  'TN:', 'SF:controllers/a.js', 'FNF:4', 'FNH:3', 'LF:20', 'LH:15', 'BRF:10', 'BRH:5', 'end_of_record',
  'TN:', 'SF:controllers/b.js', 'FNF:6', 'FNH:6', 'LF:30', 'LH:30', 'BRF:0', 'BRH:0', 'end_of_record',
  '',
].join('\n');

const JEST_SUMMARY = JSON.stringify({
  total: {
    lines: { total: 200, covered: 20, skipped: 0, pct: 10 },
    statements: { total: 220, covered: 22, skipped: 0, pct: 10 },
    functions: { total: 50, covered: 5, skipped: 0, pct: 10 },
    branches: { total: 80, covered: 4, skipped: 0, pct: 5 },
  },
});

test('TC-20-01: lcov totals are summed across files', () => {
  const m = parseLcov(LCOV);
  assert.deepEqual(m.lines, { covered: 45, total: 50, pct: 90 });
  assert.deepEqual(m.functions, { covered: 9, total: 10, pct: 90 });
  assert.deepEqual(m.branches, { covered: 5, total: 10, pct: 50 });
});

test('TC-20-02: a file-less or empty lcov report is an error, not 100%', () => {
  assert.throws(() => parseLcov(''), /no coverage records/i);
  assert.throws(() => parseLcov('TN:\n'), /no coverage records/i);
});

// Codex review: a report that is cut short or missing counters must fail the gate, not
// read as 100% because the missing numbers default to zero.
const RECORD = ['SF:x.js', 'FNF:2', 'FNH:1', 'LF:10', 'LH:5', 'BRF:4', 'BRH:2', 'end_of_record'];

test('TC-20-14: a record with no counters is an error, not 100%', () => {
  assert.throws(() => parseLcov('SF:controllers/a.js\nend_of_record\n'), /no (LF|LH|BRF|BRH|FNF|FNH) counter/);
  assert.throws(() => parseLcov('SF:controllers/a.js\n'), /truncated|no .* counter/i);
});

test('TC-20-15: a record missing one counter is an error', () => {
  for (const missing of ['FNF', 'FNH', 'LF', 'LH', 'BRF', 'BRH']) {
    const lines = RECORD.filter((l) => !l.startsWith(missing + ':'));
    assert.throws(() => parseLcov(lines.join('\n')), new RegExp(`no ${missing} counter`), missing);
  }
});

test('TC-20-16: a report cut off before end_of_record is an error', () => {
  assert.throws(() => parseLcov(RECORD.slice(0, -1).join('\n')), /truncated/i);
  assert.throws(() => parseLcov(RECORD.concat(['SF:y.js', 'LF:3']).join('\n')), /truncated/i);
});

test('TC-20-17: counts that are not whole numbers, or where covered exceeds total, are errors', () => {
  assert.throws(() => parseLcov(RECORD.map((l) => (l === 'LF:10' ? 'LF:abc' : l)).join('\n')), /LF/);
  assert.throws(() => parseLcov(RECORD.map((l) => (l === 'LH:5' ? 'LH:-1' : l)).join('\n')), /LH/);
  assert.throws(() => parseLcov(RECORD.map((l) => (l === 'LH:5' ? 'LH:11' : l)).join('\n')), /LH.*exceed.*LF/i);
});

test('TC-20-18: a report with no executable lines at all is an error', () => {
  const none = RECORD.map((l) => (l === 'LF:10' ? 'LF:0' : l === 'LH:5' ? 'LH:0' : l));
  assert.throws(() => parseLcov(none.join('\n')), /no executable lines/i);
});

test('TC-20-19: a Jest summary with no lines, or covered above total, is an error', () => {
  const summary = (lines) => JSON.stringify({ total: { lines, branches: { total: 1, covered: 1 }, functions: { total: 1, covered: 1 } } });
  assert.throws(() => parseJestSummary(summary({ total: 0, covered: 0 })), /no executable lines/i);
  assert.throws(() => parseJestSummary(summary({ total: 5, covered: 6 })), /exceed/i);
});

test('TC-20-03: a metric with nothing to measure counts as fully covered', () => {
  const m = parseLcov('SF:x.js\nFNF:0\nFNH:0\nLF:10\nLH:10\nBRF:0\nBRH:0\nend_of_record\n');
  assert.equal(m.branches.pct, 100);
  assert.equal(m.functions.pct, 100);
});

test('TC-20-04: the Jest summary is read from its total block', () => {
  const m = parseJestSummary(JEST_SUMMARY);
  assert.deepEqual(m.lines, { covered: 20, total: 200, pct: 10 });
  assert.deepEqual(m.functions, { covered: 5, total: 50, pct: 10 });
  assert.deepEqual(m.branches, { covered: 4, total: 80, pct: 5 });
});

test('TC-20-05: a Jest summary without totals is an error', () => {
  assert.throws(() => parseJestSummary('{}'), /total/i);
  assert.throws(() => parseJestSummary('not json'), /json/i);
});

const measured = {
  lines: { covered: 68, total: 100, pct: 68 },
  branches: { covered: 80, total: 100, pct: 80 },
  functions: { covered: 85, total: 100, pct: 85 },
};

test('TC-20-06: the gate passes when every metric is at or above its floor', () => {
  const result = evaluate(measured, { lines: 68, branches: 79, functions: 84 });
  assert.equal(result.pass, true);
  assert.deepEqual(result.rows.map((r) => r.status), ['pass', 'pass', 'pass']);
});

test('TC-20-07: the gate fails when any metric is below its floor, naming it', () => {
  const result = evaluate(measured, { lines: 69, branches: 79, functions: 84 });
  assert.equal(result.pass, false);
  assert.deepEqual(result.rows.filter((r) => r.status === 'FAIL').map((r) => r.metric), ['lines']);
});

test('TC-20-08: a floor missing for a metric is an error', () => {
  assert.throws(() => evaluate(measured, { lines: 60, branches: 60 }), /functions/);
});

test('TC-20-09: the summary shows numbers, floors and status, and nudges when the floor is far behind', () => {
  const md = formatMarkdown('Backend', evaluate(measured, { lines: 60, branches: 79, functions: 84 }));
  assert.match(md, /### Backend coverage/);
  assert.match(md, /\| lines \| 68 \/ 100 \| 68\.00% \| 60% \| \+8\.00 \| pass \|/);
  assert.match(md, /70% target/);
  assert.match(md, /raise the floor/i, 'lines is 8 points above its floor');
});

test('TC-20-10: no raise-the-floor nudge when the floors are close', () => {
  const md = formatMarkdown('Backend', evaluate(measured, { lines: 66, branches: 78, functions: 83 }));
  assert.doesNotMatch(md, /raise the floor/i);
});

// Floors may sit above 70 where coverage already does (backend branches and functions).
test('the committed floors are percentages for every metric of both projects', () => {
  const floors = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', '..', 'coverage-floors.json'), 'utf8'));
  for (const project of ['backend', 'frontend']) {
    for (const metric of ['lines', 'branches', 'functions']) {
      const value = floors[project][metric];
      assert.equal(typeof value, 'number', `${project}.${metric}`);
      assert.ok(value >= 0 && value <= 100, `${project}.${metric} = ${value}`);
    }
  }
});

function run(args, env = {}) {
  return spawnSync(process.execPath, [scriptPath, ...args], {
    encoding: 'utf8',
    env: { ...process.env, GITHUB_STEP_SUMMARY: '', ...env },
  });
}

function tempFiles(t, { report, floors }) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cov-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const files = { report: path.join(dir, 'lcov.info'), floors: path.join(dir, 'floors.json'), summary: path.join(dir, 'summary.md') };
  if (report !== undefined) fs.writeFileSync(files.report, report);
  fs.writeFileSync(files.floors, JSON.stringify(floors));
  return files;
}

test('TC-20-11: the command exits 0 and appends to the job summary when coverage meets the floors', (t) => {
  const f = tempFiles(t, { report: LCOV, floors: { backend: { lines: 80, branches: 40, functions: 80 } } });
  const r = run(['backend', '--report', f.report, '--floors', f.floors], { GITHUB_STEP_SUMMARY: f.summary });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(fs.readFileSync(f.summary, 'utf8'), /### Backend coverage/);
});

test('TC-20-12: the command exits 1 when coverage is below a floor', (t) => {
  const f = tempFiles(t, { report: LCOV, floors: { backend: { lines: 95, branches: 40, functions: 80 } } });
  const r = run(['backend', '--report', f.report, '--floors', f.floors]);
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stdout, /FAIL/);
});

test('TC-20-13: the command exits 2 when the coverage report is missing, so a broken run cannot pass', (t) => {
  const f = tempFiles(t, { floors: { backend: { lines: 1, branches: 1, functions: 1 } } });
  const r = run(['backend', '--report', f.report, '--floors', f.floors]);
  assert.equal(r.status, 2, r.stdout + r.stderr);
  assert.match(r.stderr, /report/i);
});

test('the command rejects an unknown project name', () => {
  const r = run(['mobile']);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /backend|frontend/);
});
