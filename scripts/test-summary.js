#!/usr/bin/env node
// Test summary (backlog CICD-29). Reads a test runner's own result file, prints a "tests, passed,
// failed, skipped, duration" table and appends it to the GitHub job summary.
//
//   node scripts/test-summary.js "<title>" <node|jest|playwright> <result file>
//
//   node        the file written by node --test --test-reporter=junit (backend unit and integration)
//   jest        the file written by jest --json --outputFile (frontend)
//   playwright  the file written by Playwright's json reporter (end-to-end)
//
// It reports; the test step itself is what fails a job. Exit codes: 0 the table was written (even
// when tests failed), 2 the file was missing, cut off, empty or in an unknown format. A run that
// never happened must not look like a run that passed.
const fs = require('node:fs');

const FORMATS = ['node', 'jest', 'playwright'];

function count(value, name) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new Error(`The report has no usable ${name} (${JSON.stringify(value)}).`);
  }
  return value;
}

function finish({ total, passed, failed, skipped, flaky = 0, durationMs }) {
  if (count(total, 'total') === 0) throw new Error('The report shows no tests were run.');
  return { total, passed, failed, skipped, flaky, durationMs: count(durationMs, 'duration') };
}

// node --test's junit reporter ends with the totals as comments: <!-- tests 290 -->, <!-- pass 290 -->, ...
// Cancelled tests did not pass, so they count as failed; todo tests are counted as skipped.
const NODE_TOTALS = ['tests', 'pass', 'fail', 'cancelled', 'skipped', 'todo', 'duration_ms'];

function parseNodeTestReport(text) {
  const totals = {};
  for (const match of text.matchAll(/<!--\s*([a-z_]+)\s+(\S+)\s*-->/g)) {
    if (NODE_TOTALS.includes(match[1])) totals[match[1]] = Number(match[2]);
  }
  if (Object.keys(totals).length === 0) throw new Error('The node test report has no totals.');
  for (const name of NODE_TOTALS) {
    if (!Object.hasOwn(totals, name)) throw new Error(`The node test report has no ${name} total.`);
    count(totals[name], name);
  }
  return finish({
    total: totals.tests,
    passed: totals.pass,
    failed: totals.fail + totals.cancelled,
    skipped: totals.skipped + totals.todo,
    durationMs: totals.duration_ms,
  });
}

// Jest's --json report: the counts and the run's start time are at the top, and each test file has
// an end time, so the duration runs from the run's start to the last file's finish.
function parseJestReport(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch (error) {
    throw new Error(`The Jest report is not valid JSON: ${error.message}`);
  }
  if (!data || typeof data !== 'object') throw new Error('The Jest report has no numTotalTests.');
  const results = Array.isArray(data.testResults) ? data.testResults : [];
  const starts = results.map((r) => r.startTime).filter(Number.isFinite);
  const ends = results.map((r) => r.endTime).filter(Number.isFinite);
  const total = count(data.numTotalTests, 'numTotalTests');
  const passed = count(data.numPassedTests, 'numPassedTests');
  const failed = count(data.numFailedTests, 'numFailedTests');
  const skipped = count(data.numPendingTests, 'numPendingTests') + count(data.numTodoTests ?? 0, 'numTodoTests');
  if (total === 0) throw new Error('The report shows no tests were run.');
  if (ends.length === 0) throw new Error('The Jest report has no test file times, so no duration.');
  // The run's own start time, or failing that the first test file's.
  const start = Number.isFinite(data.startTime) ? data.startTime : Math.min(...starts);
  return finish({ total, passed, failed, skipped, durationMs: Math.max(...ends) - start });
}

// Playwright's json report: totals under "stats". A flaky test failed, then passed on a retry:
// it counts as passed and is called out separately.
function parsePlaywrightReport(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch (error) {
    throw new Error(`The Playwright report is not valid JSON: ${error.message}`);
  }
  if (!data || typeof data.stats !== 'object' || data.stats === null) throw new Error('The Playwright report has no stats block.');
  const { expected, unexpected, skipped, flaky, duration } = data.stats;
  count(expected, 'expected');
  count(unexpected, 'unexpected');
  count(skipped, 'skipped');
  count(flaky, 'flaky');
  return finish({
    total: expected + unexpected + skipped + flaky,
    passed: expected + flaky,
    failed: unexpected,
    skipped,
    flaky,
    durationMs: duration,
  });
}

function formatDuration(ms) {
  if (ms < 59950) return `${(ms / 1000).toFixed(1)} s`;
  const seconds = Math.round(ms / 1000);
  return `${Math.floor(seconds / 60)} min ${seconds % 60} s`;
}

function formatMarkdown(title, result) {
  const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
  const lines = [
    `### ${title}`,
    '',
    '| Tests | Passed | Failed | Skipped | Duration |',
    '|---|---|---|---|---|',
    `| ${result.total} | ${result.passed} | ${result.failed} | ${result.skipped} | ${formatDuration(result.durationMs)} |`,
    '',
  ];
  if (result.failed > 0) lines.push(`${plural(result.failed, 'test')} failed.`, '');
  if (result.flaky > 0) lines.push(`${plural(result.flaky, 'test')} passed only after a retry.`, '');
  return lines.join('\n');
}

const PARSERS = { node: parseNodeTestReport, jest: parseJestReport, playwright: parsePlaywrightReport };

function main(args) {
  const [title, format, file] = args;
  if (!title || !FORMATS.includes(format) || !file) {
    console.error('Usage: node scripts/test-summary.js "<title>" <node|jest|playwright> <result file>');
    return 2;
  }
  let markdown;
  try {
    if (!fs.existsSync(file)) throw new Error(`Test report not found: ${file}`);
    markdown = formatMarkdown(title, PARSERS[format](fs.readFileSync(file, 'utf8')));
  } catch (error) {
    console.error(`${title}: ${error.message}`);
    return 2;
  }
  console.log(markdown);
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, markdown + '\n');
  return 0;
}

module.exports = { parseNodeTestReport, parseJestReport, parsePlaywrightReport, formatDuration, formatMarkdown };

if (require.main === module) process.exitCode = main(process.argv.slice(2));
