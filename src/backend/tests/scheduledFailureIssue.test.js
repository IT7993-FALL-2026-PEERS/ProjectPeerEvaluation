const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { SCHEDULED, AFTER_MERGE, WATCHED, plan, main } = require('../../../scripts/scheduled-failure-issue');

// A failed unattended run (scheduled, or CD after a merge) opens one GitHub issue, or comments on the open one
// (CICD-88, #272).
const REPO = 'o/r';
const RUN_URL = 'https://github.com/o/r/actions/runs/123';
const DATE = new Date('2026-11-10T06:20:00Z');
const TITLE = 'Scheduled run failed: Security scan';

test('TC-29-81: the first failure opens an issue with the workflow name, the date and the run link', () => {
  const step = plan({ workflow: 'Security scan', runUrl: RUN_URL, repo: REPO, issues: [], date: DATE });
  assert.equal(step.action, 'create');
  assert.equal(step.title, TITLE);
  assert.match(step.body, /Security scan/);
  assert.match(step.body, /Nov 10, 2026/);
  assert.equal(step.body.split('\n')[2], `Run: ${RUN_URL}`);
});

test('TC-29-82: a failure while the issue is open adds a comment instead of a second issue', () => {
  const issues = [
    { number: 7, title: 'Scheduled run failed: Staging regression' },
    { number: 9, title: TITLE },
    { number: 12, title: `${TITLE} again` },
  ];
  const step = plan({ workflow: 'Security scan', runUrl: RUN_URL, repo: REPO, issues, date: DATE });
  assert.equal(step.action, 'comment');
  assert.equal(step.number, 9);
  assert.equal(step.body, `The scheduled run failed again on Nov 10, 2026 (UTC): ${RUN_URL}`);
});

test('TC-29-83: it refuses a workflow it does not watch and a link that is not a run of this repository', () => {
  const base = { workflow: 'Security scan', runUrl: RUN_URL, repo: REPO, issues: [], date: DATE };
  assert.throws(() => plan({ ...base, workflow: 'CI' }), /watch/);
  assert.throws(() => plan({ ...base, runUrl: 'https://example.com/o/r/actions/runs/1' }), /run/);
  assert.throws(() => plan({ ...base, runUrl: 'https://github.com/other/repo/actions/runs/1' }), /run/);
  assert.throws(() => plan({ ...base, runUrl: `${RUN_URL}\n@someone` }), /run/);
});

const env = { WORKFLOW_NAME: 'Security scan', RUN_URL, GITHUB_REPOSITORY: REPO };
const fakeGh = (issues, ran, status = 0) => (argv) => {
  ran.push(argv);
  if (argv[1] === 'issue' && argv[2] === 'list') return { status: 0, stdout: JSON.stringify(issues) };
  return { status, stdout: '' };
};

test('TC-29-84: it lists the open issues, then creates or comments with gh, and a dry run changes nothing', (t) => {
  t.mock.method(console, 'log', () => {});
  t.mock.method(console, 'error', () => {});

  let ran = [];
  assert.equal(main(env, { run: fakeGh([], ran), date: DATE }), 0);
  assert.deepEqual(ran[0].slice(0, 7), ['gh', 'issue', 'list', '--repo', REPO, '--state', 'open']);
  assert.deepEqual(ran[1].slice(0, 7), ['gh', 'issue', 'create', '--repo', REPO, '--title', TITLE]);

  ran = [];
  assert.equal(main(env, { run: fakeGh([{ number: 9, title: TITLE }], ran), date: DATE }), 0);
  assert.deepEqual(ran[1].slice(0, 6), ['gh', 'issue', 'comment', '9', '--repo', REPO]);

  ran = [];
  assert.equal(main({ ...env, DRY_RUN: 'true' }, { run: fakeGh([], ran), date: DATE }), 0);
  assert.equal(ran.length, 1, 'a dry run only reads the issue list');

  ran = [];
  assert.equal(main({ ...env, WORKFLOW_NAME: 'CI' }, { run: fakeGh([], ran), date: DATE }), 2);
  assert.equal(ran.length, 0, 'a refused request never calls gh');

  assert.equal(main(env, { run: fakeGh([], [], 1), date: DATE }), 1, 'a gh failure fails the job');
});

// workflow_run matches workflows by their `name:`. If a watched workflow is renamed, or the trigger
// list and the script disagree, failures would go unreported without any error.
const workflowsDir = path.join(__dirname, '../../../.github/workflows');
const read = (file) => fs.readFileSync(path.join(workflowsDir, file), 'utf8');

test('TC-29-85: the watched names are the real scheduled workflows plus CD, and match the trigger list', () => {
  const trigger = read('scheduled-failure-issue.yml').match(/workflows: \[(.*)\]/)[1];
  const listed = [...trigger.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(listed, WATCHED);
  const scheduled = fs.readdirSync(workflowsDir)
    .map(read)
    .filter((text) => /^ {2}schedule:/m.test(text))
    .map((text) => text.match(/^name: (.+)$/m)[1].trim());
  assert.deepEqual([...scheduled].sort(), [...SCHEDULED].sort());
  // CD must keep its name and keep starting after CI, or its failures would go unreported.
  assert.deepEqual(AFTER_MERGE, ['CD']);
  assert.match(read('cd.yml'), /^name: CD$/m);
  assert.match(read('cd.yml'), /^ {2}workflow_run:\n {4}workflows: \[CI\]/m);
});

test('TC-29-86: the workflow acts only on a failed scheduled run, and only it may write issues', () => {
  const text = read('scheduled-failure-issue.yml');
  assert.match(text, /github\.event\.workflow_run\.event == 'schedule'/);
  assert.match(text, /github\.event\.workflow_run\.name == 'CD' && github\.event\.workflow_run\.event == 'workflow_run'/);
  assert.match(text, /\["failure", "timed_out"\]/);
  assert.match(text, /issues: write/);
  // The queue is on the job, so skipped runs never take the one waiting place from a real report.
  assert.doesNotMatch(text, /^concurrency:/m);
  assert.match(text, /^ {4}concurrency:\n {6}group: scheduled-failure-issue-/m);
  for (const file of fs.readdirSync(workflowsDir).filter((name) => name !== 'scheduled-failure-issue.yml')) {
    assert.doesNotMatch(read(file), /issues: write/, `${file} must not gain issue access`);
  }
});

// CD deploys and rolls back with nobody watching (#272): its issue names the failed jobs, and leads with a
// warning when the rollback itself failed, because then staging may be broken.
const CD_TITLE = 'CD run failed after a merge to main';

test('TC-29-87: a failed CD run opens its own issue that lists the failed jobs', () => {
  const step = plan({ workflow: 'CD', runUrl: RUN_URL, repo: REPO, issues: [{ number: 9, title: TITLE }], date: DATE,
    failedJobs: ['Smoke and end-to-end tests (staging)', 'smoke / Smoke and end-to-end tests (staging)'] });
  assert.equal(step.action, 'create');
  assert.equal(step.title, CD_TITLE);
  assert.equal(step.body.split('\n')[2], `Run: ${RUN_URL}`);
  assert.match(step.body, /^- smoke \/ Smoke and end-to-end tests \(staging\)$/m);
  assert.match(step.body, /After an automatic rollback/);
  assert.doesNotMatch(step.body, /may be broken/);
});

test('TC-29-88: a failed rollback leads the issue and the comment with a warning', () => {
  const failedJobs = ['Deploy to staging (backend)', 'rollback-smoke / Smoke and end-to-end tests (staging)'];
  const created = plan({ workflow: 'CD', runUrl: RUN_URL, repo: REPO, issues: [], date: DATE, failedJobs });
  assert.match(created.body.split('\n')[4], /automatic rollback did not finish, so staging may be broken/);
  const comment = plan({ workflow: 'CD', runUrl: RUN_URL, repo: REPO, issues: [{ number: 11, title: CD_TITLE }], date: DATE, failedJobs: ['Roll back (frontend)'] });
  assert.equal(comment.action, 'comment');
  assert.equal(comment.number, 11);
  assert.match(comment.body, /^The CD run failed again on Nov 10, 2026 \(UTC\)/);
  assert.match(comment.body, /may be broken/);
});

test('TC-29-89: job names are reduced to plain text, and unreadable jobs still open the issue', () => {
  const step = plan({ workflow: 'CD', runUrl: RUN_URL, repo: REPO, issues: [], date: DATE, failedJobs: ['Deploy `x` [link](http://e) @someone', ''] });
  const jobLines = step.body.split('\n').filter((line) => line.startsWith('- '));
  assert.deepEqual(jobLines, ['- Deploy x link(http://e) someone']);
  const unread = plan({ workflow: 'CD', runUrl: RUN_URL, repo: REPO, issues: [], date: DATE, failedJobs: null });
  assert.match(unread.body, /Failed jobs: could not be read/);
});

test('TC-29-90: for CD, main reads the failed jobs with gh api; if that fails it still opens the issue', (t) => {
  t.mock.method(console, 'log', () => {});
  t.mock.method(console, 'error', () => {});
  const cdEnv = { ...env, WORKFLOW_NAME: 'CD' };
  const ran = [];
  const run = (argv) => {
    ran.push(argv);
    if (argv[2] === 'list') return { status: 0, stdout: '[]' };
    if (argv[1] === 'api') return { status: 0, stdout: 'Roll back (backend)\n' };
    return { status: 0, stdout: '' };
  };
  assert.equal(main(cdEnv, { run, date: DATE }), 0);
  assert.deepEqual(ran[1].slice(0, 3), ['gh', 'api', 'repos/o/r/actions/runs/123/jobs?per_page=100']);
  assert.deepEqual(ran[2].slice(0, 7), ['gh', 'issue', 'create', '--repo', REPO, '--title', CD_TITLE]);
  assert.match(ran[2][8], /may be broken/);

  const failing = [];
  const noJobs = (argv) => { failing.push(argv); return argv[1] === 'api' ? { status: 1, stdout: '' } : run(argv); };
  assert.equal(main(cdEnv, { run: noJobs, date: DATE }), 0);
  assert.match(failing[2][8], /could not be read/);
});
