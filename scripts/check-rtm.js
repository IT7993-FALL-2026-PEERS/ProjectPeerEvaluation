#!/usr/bin/env node
// Checks docs/requirements/rtm.md against the code (backlog CICD-23):
//   - every test ID the matrix cites (TC-16-20, a range such as TC-16-20..27, E2E-11) is the start of a
//     test title in src/backend/tests, src/backend/integration or e2e;
//   - every test file it names in backticks exists (a * stands for any run of characters);
//   - every requirement row whose status is not Unsupported or Planned cites at least one test ID that
//     exists, so a "covered" row is never covered only in words;
//   - every requirement in docs/requirements/requirements.md has a row.
//
//   node scripts/check-rtm.js [--root <repo>] [--rtm <file>] [--requirements FR-01,FR-02,...]
//
// Exit codes: 0 all found, 1 problems (listed), 2 the matrix could not be read. It runs in CI inside
// the backend tests (src/backend/tests/rtmTraceability.test.js), so a renamed or deleted test that the
// matrix still cites fails the pull request.
const fs = require('node:fs');
const path = require('node:path');

const ID = '(?:TC-[A-Z0-9]+-\\d+|E2E-\\d+)';
const CITATION = new RegExp(`\\b(TC-[A-Z0-9]+-)(\\d+)(?:\\.\\.(\\d+))?|\\b(E2E-)(\\d+)(?:\\.\\.(\\d+))?`, 'g');
const TEST_TITLE = new RegExp(`^\\s*(?:test|it|describe)(?:\\.\\w+)?\\(\\s*['"\`](${ID})\\b`);
const TEST_FILE = /`([^`\s]*\.(?:test|integration|spec)\.js)`/g;
const TEST_DIRS = [['src', 'backend', 'tests'], ['src', 'backend', 'integration'], ['e2e']];
const OPEN_STATUS = /^\s*(?:\*+)?\s*(?:Unsupported|Planned)\b/i;

function walk(dir, files = []) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return files;
  }
  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name === '.git') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, files);
    else if (entry.name.endsWith('.js')) files.push(full);
  }
  return files;
}

// The test IDs defined by test titles in the three test folders.
function findKnownIds(root) {
  const known = new Set();
  for (const parts of TEST_DIRS) {
    for (const file of walk(path.join(root, ...parts))) {
      for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
        const match = TEST_TITLE.exec(line);
        if (match) known.add(match[1]);
      }
    }
  }
  return known;
}

// "TC-16-20..22" -> TC-16-20, TC-16-21, TC-16-22. A single ID comes back as itself.
function expandIds(text) {
  const ids = [];
  CITATION.lastIndex = 0;
  let match;
  while ((match = CITATION.exec(text))) {
    const prefix = match[1] || match[4];
    const from = match[2] || match[5];
    const to = match[3] || match[6];
    if (!to) {
      ids.push(prefix + from);
      continue;
    }
    for (let n = Number(from); n <= Number(to); n += 1) ids.push(prefix + String(n).padStart(from.length, '0'));
  }
  return ids;
}

function splitRow(line) {
  return line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((cell) => cell.trim());
}

// The rows of the requirements matrix: the table whose header has a "Test cases (existing)" column.
function matrixRows(lines) {
  const header = lines.findIndex((line) => /^\|.*Test cases \(existing\)/.test(line));
  if (header < 0) return [];
  const columns = splitRow(lines[header]);
  const testsAt = columns.findIndex((c) => /^Test cases/.test(c));
  const rows = [];
  for (let i = header + 2; i < lines.length && lines[i].trim().startsWith('|'); i += 1) {
    const cells = splitRow(lines[i]);
    rows.push({ line: i + 1, cells, tests: cells[testsAt] || '', status: cells[cells.length - 1] || '' });
  }
  return rows;
}

function requirementName(cells) {
  const fr = /FR-\d+/.exec(cells[1] || '');
  if (fr) return fr[0];
  return (cells[2] || cells[0] || 'a row').replace(/\*/g, '').trim();
}

function defaultRequirements(root) {
  try {
    const text = fs.readFileSync(path.join(root, 'docs', 'requirements', 'requirements.md'), 'utf8');
    const found = [...text.matchAll(/^###\s+(FR-\d+)\b/gm)].map((m) => m[1]);
    if (found.length) return found;
  } catch { /* fall through to the signed-off count */ }
  return Array.from({ length: 23 }, (_, i) => `FR-${String(i + 1).padStart(2, '0')}`);
}

function checkRtm({ root = path.join(__dirname, '..'), rtmPath, requirements } = {}) {
  const file = rtmPath || path.join(root, 'docs', 'requirements', 'rtm.md');
  const text = fs.readFileSync(file, 'utf8');
  const lines = text.split(/\r?\n/);
  const known = findKnownIds(root);
  const knownFiles = new Set(
    [path.join(root, 'src'), path.join(root, 'e2e')].flatMap((dir) => walk(dir)).map((f) => path.basename(f)),
  );
  const problems = [];
  const citedIds = new Set();
  const citedFiles = new Set();

  const rows = matrixRows(lines);
  const rowLines = new Map(rows.map((row) => [row.line, row]));

  // Every ID and file cited anywhere in the document.
  lines.forEach((line, index) => {
    const row = rowLines.get(index + 1);
    const where = row ? requirementName(row.cells) : `line ${index + 1}`;
    for (const id of expandIds(line)) {
      citedIds.add(id);
      if (!known.has(id)) problems.push(`${id} cited for ${where} is not the title of any test`);
    }
    for (const match of line.matchAll(TEST_FILE)) {
      const name = path.basename(match[1]);
      citedFiles.add(name);
      const pattern = new RegExp(`^${name.split('*').map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*')}$`);
      if (![...knownFiles].some((candidate) => pattern.test(candidate))) {
        problems.push(`${name} cited for ${where} does not exist`);
      }
    }
  });

  // A covered requirement must cite a test that exists.
  for (const row of rows) {
    if (OPEN_STATUS.test(row.status)) continue;
    const ids = expandIds(row.tests).filter((id) => known.has(id));
    if (ids.length === 0) {
      problems.push(`${requirementName(row.cells)} (${row.status.split(' ')[0] || 'no status'}) cites no test ID that exists in the code`);
    }
  }

  // Every requirement has a row.
  const present = new Set(rows.map((row) => /FR-\d+/.exec(row.cells[1] || '')).filter(Boolean).map((m) => m[0]));
  for (const requirement of requirements || defaultRequirements(root)) {
    if (!present.has(requirement)) problems.push(`${requirement} is not in the matrix`);
  }

  return { problems, citedIds, citedFiles, rows: rows.length, knownIds: known.size };
}

function parseArgs(argv) {
  const options = {};
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--root') options.root = path.resolve(argv[++i]);
    else if (argv[i] === '--rtm') options.rtmPath = path.resolve(argv[++i]);
    else if (argv[i] === '--requirements') options.requirements = argv[++i].split(',').map((s) => s.trim()).filter(Boolean);
  }
  return options;
}

function main(argv = process.argv.slice(2)) {
  let result;
  try {
    result = checkRtm(parseArgs(argv));
  } catch (error) {
    console.error(`RTM check: could not read the matrix (${error.code || error.message}).`);
    return 2;
  }
  if (result.problems.length > 0) {
    console.log(`RTM check: ${result.problems.length} problem${result.problems.length === 1 ? '' : 's'}:`);
    result.problems.forEach((problem) => console.log(`  - ${problem}`));
    return 1;
  }
  console.log(`RTM check: ${result.rows} rows, ${result.citedIds.size} test IDs and ${result.citedFiles.size} files cited, all found (${result.knownIds} test IDs in the code).`);
  return 0;
}

module.exports = { checkRtm, findKnownIds, expandIds, main };

if (require.main === module) process.exitCode = main();
