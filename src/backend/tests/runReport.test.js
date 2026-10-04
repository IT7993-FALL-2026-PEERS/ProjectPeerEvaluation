const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { formatDuration, jobsTable, historyTable } = require('../../../scripts/run-report');

// The run overview and build history (CICD-29): which jobs passed and how long they took, and how
// the latest runs of the workflow ended.
const scriptPath = path.join(__dirname, '..', '..', '..', 'scripts', 'run-report.js');

const job = (name, conclusion, start, end) => ({ name, conclusion, status: 'completed', started_at: start, completed_at: end, html_url: `https://x/${name}` });

test('TC-29-30: the jobs table gives each job its result and duration, and leaves out the report job', () => {
  const md = jobsTable({
    jobs: [
      job('Frontend', 'success', '2026-10-03T10:00:00Z', '2026-10-03T10:02:30Z'),
      job('Backend', 'failure', '2026-10-03T10:00:00Z', '2026-10-03T10:00:20Z'),
      job('Report', null, '2026-10-03T10:03:00Z', null),
    ],
  }, 'Report');
  assert.match(md, /\| \[Frontend\]\(https:\/\/x\/Frontend\) \| ✅ passed \| 2 min 30 s \|/);
  assert.match(md, /\| \[Backend\]\(https:\/\/x\/Backend\) \| ❌ failed \| 20\.0 s \|/);
  assert.doesNotMatch(md, /Report/);
});

test('TC-29-31: a job list that is not a list is an error', () => {
  assert.throws(() => jobsTable({}, ''), /no "jobs" list/);
});

test('TC-29-32: the build history marks this run and counts the finished runs that passed', () => {
  const run = (id, conclusion) => ({ databaseId: id, headBranch: 'main', event: 'push', headSha: 'abcdef1234567', status: conclusion ? 'completed' : 'in_progress', conclusion, createdAt: '2026-10-03T10:00:00Z', updatedAt: '2026-10-03T10:05:00Z', url: `https://x/${id}` });
  const md = historyTable([run(3, null), run(2, 'failure'), run(1, 'success')], 3);
  assert.match(md, /#3\]\(https:\/\/x\/3\) \(this run\)/);
  assert.match(md, /`abcdef1`/);
  assert.match(md, /5 min 0 s/);
  assert.match(md, /1 of the last 2 finished runs passed\./);
});

test('TC-29-33: a pipe in a branch name does not break the table', () => {
  const md = historyTable([{ databaseId: 1, headBranch: 'a|b', event: 'push', headSha: 'abc', conclusion: 'success', status: 'completed' }], 1);
  assert.match(md, /a\\\|b/);
});

test('TC-29-37: a backslash before a pipe in a branch name stays inside its cell', () => {
  const md = historyTable([{ databaseId: 1, headBranch: 'a\\|b', event: 'push', headSha: 'abcdef1234', status: 'completed', conclusion: 'success' }], '9');
  // The backslash is doubled and the pipe escaped: \\\|, so the row keeps its six cells.
  assert.ok(md.includes('a\\\\\\|b'), md);
});

test('TC-29-34: durations read as seconds, then minutes, and n/a when unknown', () => {
  assert.equal(formatDuration(2500), '2.5 s');
  assert.equal(formatDuration(125000), '2 min 5 s');
  assert.equal(formatDuration(NaN), 'n/a');
});

test('TC-29-35: the command writes the report to the job summary, and exits 2 for a missing file', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'run-report-'));
  try {
    const jobs = path.join(dir, 'jobs.json');
    const runs = path.join(dir, 'runs.json');
    const summary = path.join(dir, 'summary.md');
    fs.writeFileSync(jobs, JSON.stringify({ jobs: [job('Frontend', 'success', '2026-10-03T10:00:00Z', '2026-10-03T10:01:00Z')] }));
    fs.writeFileSync(runs, '[]');
    const ok = spawnSync(process.execPath, [scriptPath, jobs, runs, '1'], { env: { ...process.env, GITHUB_STEP_SUMMARY: summary }, encoding: 'utf8' });
    assert.equal(ok.status, 0, ok.stderr);
    assert.match(fs.readFileSync(summary, 'utf8'), /### Build history/);
    const missing = spawnSync(process.execPath, [scriptPath, path.join(dir, 'nope.json'), runs, '1'], { encoding: 'utf8' });
    assert.equal(missing.status, 2);
    assert.match(missing.stderr, /File not found/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
