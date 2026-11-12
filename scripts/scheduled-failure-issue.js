#!/usr/bin/env node
// Opens a GitHub issue when an unattended workflow run fails (backlog CICD-88, #272).
//
//   WORKFLOW_NAME="Security scan" RUN_URL=https://github.com/<owner>/<repo>/actions/runs/<id> \
//     GITHUB_REPOSITORY=<owner>/<repo> [DRY_RUN=true] node scripts/scheduled-failure-issue.js
//
// Two kinds of run start with nobody watching, so a red one was only visible in the Actions tab: the
// weekly runs (Staging regression on Tuesdays, Security scan on Mondays), and CD, which deploys staging
// by itself after every merge to main and rolls back when the deploy or the smoke tests fail.
// scheduled-failure-issue.yml calls this after such a run fails. One issue per workflow: while it is
// open, a later failure adds a comment instead of a second issue. Close the issue once a later run passes.
//
// For CD the issue also lists the jobs that failed (read with gh api; needs actions: read), and says so
// first when the automatic rollback itself failed, because then staging may be broken.
//
// The issue text is built here from a known workflow name, a checked run link and job names reduced to
// plain characters, so the workflow never assembles it from loose strings. DRY_RUN=true prints what it
// would do and changes nothing.
//
// Exit codes: 0 done (or dry run), 1 gh failed, 2 refused.
const { spawnSync } = require('node:child_process');

// The workflows with a schedule: reported when a run started by the schedule fails.
const SCHEDULED = ['Staging regression', 'Security scan'];
// Workflows that start by themselves after a merge (workflow_run): reported when such a run fails.
const AFTER_MERGE = ['CD'];
// Must match the `workflows:` list in scheduled-failure-issue.yml and each workflow's `name:` (a test
// checks both).
const WATCHED = [...SCHEDULED, ...AFTER_MERGE];

const DOCS = 'What to do when a run is red: `docs/operations/ci-cd-operations.md`.';
const ROLLBACK_DOC = '`docs/operations/rollback-and-recovery.md`';

// Job names come from the run, so only plain characters are kept (no Markdown, links or mentions).
const cleanJob = (name) => String(name).replace(/[^\w ()/.,:+-]/g, '').trim().slice(0, 120);
// rollback, rollback-report, rollback-smoke and rollback-pointer ("Roll back (backend)", "rollback-smoke / ...",
// "Move the staging image pointer back").
const isRollbackJob = (name) => /^roll ?back|^rollback-|pointer back/i.test(name);

// What a CD issue or comment says about the failed jobs. failedJobs is null when they could not be read.
function cdDetails(failedJobs) {
  if (failedJobs === null) return ['Failed jobs: could not be read. Open the run to see which job failed.'];
  const jobs = failedJobs.map(cleanJob).filter(Boolean);
  const lines = jobs.length ? ['Failed jobs:', ...jobs.map((job) => `- ${job}`)] : ['Failed jobs: none reported. Open the run.'];
  if (jobs.some(isRollbackJob)) {
    return [`**The automatic rollback did not finish, so staging may be broken.** Follow R1 in ${ROLLBACK_DOC}.`, '', ...lines];
  }
  return [...lines, '', `If the run rolled back, staging is on the last good release but the change is still on \`main\`: see "After an automatic rollback" in ${ROLLBACK_DOC}.`];
}

const formatDate = (date) => date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });

// Decides what to do: open an issue, or comment on the open one. Throws, with a plain reason, for
// anything it will not report.
function plan({ workflow, runUrl, repo, issues, date, failedJobs = [] }) {
  if (!WATCHED.includes(workflow)) throw new Error(`"${workflow}" is not a workflow this script watches`);
  const runPrefix = `https://github.com/${repo}/actions/runs/`;
  if (typeof runUrl !== 'string' || !runUrl.startsWith(runPrefix) || !/^\d+$/.test(runUrl.slice(runPrefix.length))) {
    throw new Error('the link must be a workflow run of this repository');
  }
  const day = `${formatDate(date)} (UTC)`;
  const afterMerge = AFTER_MERGE.includes(workflow);
  const title = afterMerge ? `${workflow} run failed after a merge to main` : `Scheduled run failed: ${workflow}`;
  const open = issues.find((issue) => issue.title === title);
  if (open) {
    const body = afterMerge
      ? [`The ${workflow} run failed again on ${day}: ${runUrl}`, '', ...cdDetails(failedJobs)].join('\n')
      : `The scheduled run failed again on ${day}: ${runUrl}`;
    return { action: 'comment', number: open.number, body };
  }
  const body = afterMerge
    ? [
      `The **${workflow}** run that started after a merge to \`main\` failed on ${day}.`,
      '',
      `Run: ${runUrl}`,
      '',
      ...cdDetails(failedJobs),
      '',
      DOCS,
      `Close this issue once a later ${workflow} run passes. While it is open, another failed run adds a comment here instead of opening a new issue.`,
    ]
    : [
      `The scheduled run of **${workflow}** failed on ${day}.`,
      '',
      `Run: ${runUrl}`,
      '',
      DOCS,
      'Close this issue once a later run passes. While it is open, another failed scheduled run adds a comment here instead of opening a new issue.',
    ];
  return { action: 'create', title, body: body.join('\n') };
}

// The names of the run's failed jobs, or null when gh could not read them (the issue is still opened).
function readFailedJobs(run, repo, runUrl) {
  const id = runUrl.slice(runUrl.lastIndexOf('/') + 1);
  const listed = run(['gh', 'api', `repos/${repo}/actions/runs/${id}/jobs?per_page=100`, '--jq',
    '.jobs[] | select(.conclusion == "failure" or .conclusion == "timed_out") | .name']);
  if (listed.status !== 0) return null;
  return listed.stdout.split('\n').filter((line) => line.trim());
}

const gh = (argv) => spawnSync(argv[0], argv.slice(1), { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });

function main(env, { run = gh, date = new Date() } = {}) {
  const repo = env.GITHUB_REPOSITORY || '';
  const request = { workflow: env.WORKFLOW_NAME, runUrl: env.RUN_URL, repo, date };
  try {
    if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) throw new Error('set GITHUB_REPOSITORY to <owner>/<repo>');
    plan({ ...request, issues: [] });
  } catch (error) {
    console.error(`Scheduled failure issue: ${error.message}.`);
    return 2;
  }

  const listed = run(['gh', 'issue', 'list', '--repo', repo, '--state', 'open', '--limit', '1000', '--json', 'number,title']);
  let issues;
  try {
    if (listed.status !== 0) throw new Error('gh failed');
    issues = JSON.parse(listed.stdout);
  } catch {
    console.error('Scheduled failure issue: could not read the open issues.');
    return 1;
  }

  const failedJobs = AFTER_MERGE.includes(request.workflow) ? readFailedJobs(run, repo, request.runUrl) : [];
  const step = plan({ ...request, issues, failedJobs });
  const what = step.action === 'comment' ? `comment on issue #${step.number}` : `open the issue "${step.title}"`;
  if (env.DRY_RUN === 'true') {
    console.log(`Scheduled failure issue (dry run): would ${what}:\n\n${step.body}`);
    return 0;
  }
  const command = step.action === 'comment'
    ? ['gh', 'issue', 'comment', String(step.number), '--repo', repo, '--body', step.body]
    : ['gh', 'issue', 'create', '--repo', repo, '--title', step.title, '--body', step.body];
  if (run(command).status !== 0) {
    console.error(`Scheduled failure issue: could not ${what}.`);
    return 1;
  }
  console.log(`Scheduled failure issue: done (${what}).`);
  return 0;
}

module.exports = { SCHEDULED, AFTER_MERGE, WATCHED, plan, main };

if (require.main === module) {
  process.exitCode = main(process.env);
}
