#!/usr/bin/env node
// Coverage gate (backlog CICD-20). Reads a coverage report, compares it with the floors in
// coverage-floors.json, prints a table (and appends it to the GitHub job summary), and
// exits 1 when any metric is below its floor.
//
//   node scripts/coverage-gate.js backend    reads src/backend/coverage/lcov.info (written by c8)
//   node scripts/coverage-gate.js frontend   reads coverage/coverage-summary.json
//   options: --report <path>  --floors <path>
//
// Exit codes: 0 passes, 1 below a floor, 2 the report or floors could not be used. A
// missing or unreadable report fails the gate, so a broken test run can't pass silently.
//
// Floors are set just below the measured baseline and only ever go up, until the 70%
// target in docs/testing-strategy/testing-strategy.md is reached.
const fs = require('node:fs');
const path = require('node:path');

const METRICS = ['lines', 'branches', 'functions'];
const TARGET = 70;
const NUDGE_AT = 5; // points above a floor before the summary suggests raising it

const repoRoot = path.join(__dirname, '..');
const DEFAULT_REPORTS = {
  backend: path.join(repoRoot, 'src', 'backend', 'coverage', 'lcov.info'),
  frontend: path.join(repoRoot, 'coverage', 'coverage-summary.json'),
};

function percent(covered, total) {
  // Nothing to measure counts as fully covered, so it can't hold the gate down.
  return total === 0 ? 100 : (covered * 100) / total;
}

function metric(covered, total) {
  return { covered, total, pct: percent(covered, total) };
}

// An lcov report (from c8): one record per source file, each ended by end_of_record and
// carrying all six counters. Anything incomplete is an error: a cut-off or empty report
// must fail the gate, never read as 100% because the missing numbers default to zero.
const LCOV_COUNTERS = ['LF', 'LH', 'BRF', 'BRH', 'FNF', 'FNH'];
const LCOV_PAIRS = [['LH', 'LF'], ['BRH', 'BRF'], ['FNH', 'FNF']];

function parseLcov(text) {
  const sums = Object.fromEntries(LCOV_COUNTERS.map((key) => [key, 0]));
  let current = null;
  let records = 0;

  const finish = () => {
    for (const key of LCOV_COUNTERS) {
      if (!Object.hasOwn(current.counts, key)) throw new Error(`The lcov record for ${current.file} has no ${key} counter.`);
    }
    for (const [hit, found] of LCOV_PAIRS) {
      if (current.counts[hit] > current.counts[found]) {
        throw new Error(`The lcov record for ${current.file} has ${hit} exceeding ${found}.`);
      }
    }
    for (const key of LCOV_COUNTERS) sums[key] += current.counts[key];
  };

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (line.startsWith('SF:')) {
      if (current) throw new Error(`The lcov report is truncated: the record for ${current.file} has no end_of_record.`);
      current = { file: line.slice(3), counts: {} };
      records += 1;
    } else if (line === 'end_of_record') {
      if (current) finish();
      current = null;
    } else if (current) {
      const colon = line.indexOf(':');
      const key = colon === -1 ? '' : line.slice(0, colon);
      if (LCOV_COUNTERS.includes(key)) {
        const value = Number(line.slice(colon + 1));
        if (!Number.isInteger(value) || value < 0) throw new Error(`The lcov record for ${current.file} has an invalid ${key}: ${line}`);
        current.counts[key] = value;
      }
    }
  }
  if (current) throw new Error(`The lcov report is truncated: the record for ${current.file} has no end_of_record.`);
  if (records === 0) throw new Error('The lcov report has no coverage records.');
  if (sums.LF === 0) throw new Error('The lcov report has no executable lines.');
  return {
    lines: metric(sums.LH, sums.LF),
    branches: metric(sums.BRH, sums.BRF),
    functions: metric(sums.FNH, sums.FNF),
  };
}

// Jest's json-summary reporter: totals for the whole run under "total".
function parseJestSummary(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch (error) {
    throw new Error(`The coverage summary is not valid JSON: ${error.message}`);
  }
  if (!data || typeof data.total !== 'object') throw new Error('The coverage summary has no total block.');
  const result = {};
  for (const name of METRICS) {
    const m = data.total[name];
    if (!m || !Number.isInteger(m.covered) || !Number.isInteger(m.total) || m.covered < 0 || m.total < 0) {
      throw new Error(`The coverage summary total has no usable ${name}.`);
    }
    if (m.covered > m.total) throw new Error(`The coverage summary has ${name} covered exceeding the total.`);
    result[name] = metric(m.covered, m.total);
  }
  if (result.lines.total === 0) throw new Error('The coverage summary has no executable lines.');
  return result;
}

function evaluate(measured, floors) {
  const rows = METRICS.map((name) => {
    const floor = floors[name];
    if (typeof floor !== 'number') throw new Error(`No numeric floor for ${name}.`);
    const { covered, total, pct } = measured[name];
    return { metric: name, covered, total, pct, floor, headroom: pct - floor, status: pct >= floor ? 'pass' : 'FAIL' };
  });
  return { rows, pass: rows.every((row) => row.status === 'pass') };
}

function formatMarkdown(title, { rows, pass }) {
  const sign = (n) => (n >= 0 ? '+' : '') + n.toFixed(2);
  const lines = [
    `### ${title} coverage`,
    '',
    '| Metric | Covered | Coverage | Floor | Headroom | Status |',
    '|---|---|---|---|---|---|',
    ...rows.map((r) => `| ${r.metric} | ${r.covered} / ${r.total} | ${r.pct.toFixed(2)}% | ${r.floor}% | ${sign(r.headroom)} | ${r.status} |`),
    '',
  ];
  if (!pass) {
    const below = rows.filter((r) => r.status === 'FAIL').map((r) => r.metric).join(', ');
    lines.push(`Coverage fell below the floor for: ${below}. Add tests; the floor is not lowered to make a build pass.`, '');
  }
  const far = rows.filter((r) => r.headroom >= NUDGE_AT).map((r) => r.metric);
  if (pass && far.length > 0) {
    lines.push(`Coverage is ${NUDGE_AT} or more points above the floor for ${far.join(', ')}. Raise the floor in coverage-floors.json (floors only go up).`, '');
  }
  lines.push(`The ${TARGET}% target is where the floors are heading; see docs/testing-strategy/testing-strategy.md.`, '');
  return lines.join('\n');
}

function option(args, name) {
  const i = args.indexOf(name);
  return i === -1 ? undefined : args[i + 1];
}

function main(args) {
  const project = args[0];
  if (!DEFAULT_REPORTS[project]) {
    console.error('Usage: node scripts/coverage-gate.js <backend|frontend> [--report <path>] [--floors <path>]');
    return 2;
  }
  const reportPath = option(args, '--report') || DEFAULT_REPORTS[project];
  const floorsPath = option(args, '--floors') || path.join(repoRoot, 'coverage-floors.json');

  let evaluation;
  try {
    if (!fs.existsSync(reportPath)) throw new Error(`Coverage report not found: ${reportPath}`);
    const text = fs.readFileSync(reportPath, 'utf8');
    const measured = project === 'backend' ? parseLcov(text) : parseJestSummary(text);
    const floors = JSON.parse(fs.readFileSync(floorsPath, 'utf8'))[project];
    if (!floors) throw new Error(`No floors for ${project} in ${floorsPath}`);
    evaluation = evaluate(measured, floors);
  } catch (error) {
    console.error(error.message);
    return 2;
  }

  const markdown = formatMarkdown(project === 'backend' ? 'Backend' : 'Frontend', evaluation);
  console.log(markdown);
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, markdown + '\n');
  return evaluation.pass ? 0 : 1;
}

module.exports = { parseLcov, parseJestSummary, evaluate, formatMarkdown };

if (require.main === module) process.exitCode = main(process.argv.slice(2));
