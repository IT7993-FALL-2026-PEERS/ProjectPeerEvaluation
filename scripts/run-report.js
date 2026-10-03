#!/usr/bin/env node
// Run overview and build history (backlog CICD-29). Reads two JSON files the workflow fetches with
// the GitHub CLI and appends a "this run's jobs" table and a "recent runs" table to the job summary.
//
//   node scripts/run-report.js <jobs.json> <runs.json> <current run id> [self job name]
//
//   jobs.json  gh api repos/<repo>/actions/runs/<id>/jobs      ({ "jobs": [...] })
//   runs.json  gh run list --workflow <file> --json databaseId,displayTitle,headBranch,headSha,
//              event,status,conclusion,createdAt,updatedAt,url --limit 10
//
// It reports and never fails a run. Exit codes: 0 written, 2 a file was missing or not usable.
const fs = require('node:fs');

function formatDuration(ms) {
  if (!Number.isFinite(ms) || ms < 0) return 'n/a';
  if (ms < 59950) return `${(ms / 1000).toFixed(1)} s`;
  const seconds = Math.round(ms / 1000);
  return `${Math.floor(seconds / 60)} min ${seconds % 60} s`;
}

const span = (start, end) => (start && end ? Date.parse(end) - Date.parse(start) : NaN);

const ICONS = { success: '✅ passed', failure: '❌ failed', cancelled: '⚪ cancelled', skipped: '⏭ skipped' };
const label = (conclusion, status) => ICONS[conclusion] || (status && status !== 'completed' ? `⏳ ${status}` : conclusion || '⏳ running');

// Table cells: a title can contain a pipe or a newline, which would break the table.
// Backslashes go first, so a backslash in the text cannot cancel the one added before a pipe.
const cell = (text) => String(text ?? '').replace(/\\/g, '\\\\').replace(/\|/g, '\\|').replace(/\s+/g, ' ').trim();

function jobsTable(jobsFile, selfName) {
  const jobs = Array.isArray(jobsFile?.jobs) ? jobsFile.jobs : null;
  if (!jobs) throw new Error('The jobs file has no "jobs" list.');
  const rows = jobs
    .filter((job) => job.name !== selfName)
    .map((job) => `| ${job.html_url ? `[${cell(job.name)}](${job.html_url})` : cell(job.name)} | ${label(job.conclusion, job.status)} | ${formatDuration(span(job.started_at, job.completed_at))} |`);
  return ['### Jobs in this run', '', '| Job | Result | Duration |', '|---|---|---|', ...rows, ''].join('\n');
}

function historyTable(runs, currentId) {
  if (!Array.isArray(runs)) throw new Error('The runs file is not a list.');
  const rows = runs.map((run) => {
    const here = String(run.databaseId) === String(currentId);
    const id = run.url ? `[#${run.databaseId}](${run.url})` : `#${run.databaseId}`;
    return `| ${id}${here ? ' (this run)' : ''} | ${cell(run.headBranch)} | ${cell(run.event)} | \`${String(run.headSha || '').slice(0, 7)}\` | ${label(run.conclusion, run.status)} | ${formatDuration(span(run.createdAt, run.updatedAt))} |`;
  });
  const done = runs.filter((run) => run.conclusion);
  const passed = done.filter((run) => run.conclusion === 'success').length;
  return [
    '### Build history (latest runs of this workflow)',
    '',
    '| Run | Branch | Trigger | Commit | Result | Duration |',
    '|---|---|---|---|---|---|',
    ...rows,
    '',
    done.length ? `${passed} of the last ${done.length} finished runs passed.` : 'No finished runs yet.',
    '',
  ].join('\n');
}

function readJson(file) {
  if (!fs.existsSync(file)) throw new Error(`File not found: ${file}`);
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    throw new Error(`${file} is not valid JSON: ${error.message}`);
  }
}

function main(args) {
  const [jobsPath, runsPath, runId, selfName = ''] = args;
  if (!jobsPath || !runsPath || !runId) {
    console.error('Usage: node scripts/run-report.js <jobs.json> <runs.json> <run id> [self job name]');
    return 2;
  }
  let markdown;
  try {
    markdown = `${jobsTable(readJson(jobsPath), selfName)}\n${historyTable(readJson(runsPath), runId)}`;
  } catch (error) {
    console.error(`Run report: ${error.message}`);
    return 2;
  }
  console.log(markdown);
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, markdown + '\n');
  return 0;
}

module.exports = { formatDuration, jobsTable, historyTable };

if (require.main === module) process.exitCode = main(process.argv.slice(2));
