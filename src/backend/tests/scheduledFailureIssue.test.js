const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { WATCHED, plan, main } = require('../../../scripts/scheduled-failure-issue');

// A failed scheduled run opens one GitHub issue, or comments on the open one (CICD-88).
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
  assert.ok(step.body.includes(RUN_URL));
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
  assert.match(step.body, /Nov 10, 2026/);
  assert.ok(step.body.includes(RUN_URL));
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

test('TC-29-85: the watched names are real scheduled workflows and match the trigger list', () => {
  const trigger = read('scheduled-failure-issue.yml').match(/workflows: \[(.*)\]/)[1];
  const listed = [...trigger.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(listed, WATCHED);
  const scheduled = fs.readdirSync(workflowsDir)
    .map(read)
    .filter((text) => /^ {2}schedule:/m.test(text))
    .map((text) => text.match(/^name: (.+)$/m)[1].trim());
  assert.deepEqual([...scheduled].sort(), [...WATCHED].sort());
});

test('TC-29-86: the workflow acts only on a failed scheduled run, and only it may write issues', () => {
  const text = read('scheduled-failure-issue.yml');
  assert.match(text, /github\.event\.workflow_run\.event == 'schedule'/);
  assert.match(text, /\["failure", "timed_out"\]/);
  assert.match(text, /issues: write/);
  // The queue is on the job, so skipped runs never take the one waiting place from a real report.
  assert.doesNotMatch(text, /^concurrency:/m);
  assert.match(text, /^ {4}concurrency:\n {6}group: scheduled-failure-issue-/m);
  for (const file of fs.readdirSync(workflowsDir).filter((name) => name !== 'scheduled-failure-issue.yml')) {
    assert.doesNotMatch(read(file), /issues: write/, `${file} must not gain issue access`);
  }
});
