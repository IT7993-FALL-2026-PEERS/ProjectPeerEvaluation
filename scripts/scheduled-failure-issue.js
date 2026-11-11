#!/usr/bin/env node
// Opens a GitHub issue when a scheduled workflow run fails (backlog CICD-88).
//
//   WORKFLOW_NAME="Security scan" RUN_URL=https://github.com/<owner>/<repo>/actions/runs/<id> \
//     GITHUB_REPOSITORY=<owner>/<repo> [DRY_RUN=true] node scripts/scheduled-failure-issue.js
//
// The weekly runs (Staging regression on Tuesdays, Security scan on Mondays) start with nobody
// watching, so a red one was only visible in the Actions tab. scheduled-failure-issue.yml calls this
// after such a run fails. One issue per workflow: while it is open, a later failure adds a comment
// instead of a second issue. Close the issue once a later run passes.
//
// The issue text is built here from a known workflow name and a checked run link, so the workflow
// never assembles it from loose strings. DRY_RUN=true prints what it would do and changes nothing.
//
// Exit codes: 0 done (or dry run), 1 gh failed, 2 refused.
const { spawnSync } = require('node:child_process');

// The workflows with a schedule. Must match the `workflows:` list in scheduled-failure-issue.yml and
// each workflow's `name:` (a test checks both).
const WATCHED = ['Staging regression', 'Security scan'];

const formatDate = (date) => date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });

// Decides what to do: open an issue, or comment on the open one. Throws, with a plain reason, for
// anything it will not report.
function plan({ workflow, runUrl, repo, issues, date }) {
  if (!WATCHED.includes(workflow)) throw new Error(`"${workflow}" is not a workflow this script watches`);
  const runPrefix = `https://github.com/${repo}/actions/runs/`;
  if (typeof runUrl !== 'string' || !runUrl.startsWith(runPrefix) || !/^\d+$/.test(runUrl.slice(runPrefix.length))) {
    throw new Error('the link must be a workflow run of this repository');
  }
  const title = `Scheduled run failed: ${workflow}`;
  const day = `${formatDate(date)} (UTC)`;
  const open = issues.find((issue) => issue.title === title);
  if (open) {
    return { action: 'comment', number: open.number, body: `The scheduled run failed again on ${day}: ${runUrl}` };
  }
  const body = [
    `The scheduled run of **${workflow}** failed on ${day}.`,
    '',
    `Run: ${runUrl}`,
    '',
    'What to do when a run is red: `docs/operations/ci-cd-operations.md`.',
    'Close this issue once a later run passes. While it is open, another failed scheduled run adds a comment here instead of opening a new issue.',
  ].join('\n');
  return { action: 'create', title, body };
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

  const step = plan({ ...request, issues });
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

module.exports = { WATCHED, plan, main };

if (require.main === module) {
  process.exitCode = main(process.env);
}
