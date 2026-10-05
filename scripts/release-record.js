#!/usr/bin/env node
// Release candidates for cd.yml (backlog CICD-28): the rc-* tag name, the release record, and the
// previous good release that a failed deploy rolls back to.
//
//   node scripts/release-record.js record <output dir>
//     SHA, RUN_URL, CI_RUN_URL, SMOKE_RESULT (the smoke job's result), SMOKE_TESTS (how many @staging
//     tests ran), BACKEND_IMAGE, FRONTEND_IMAGE, BACKEND_DIGEST, FRONTEND_DIGEST, PREVIOUS_TAG,
//     BACKEND_COVERAGE (lcov.info), FRONTEND_COVERAGE (coverage-summary.json)
//     Reads the commit each staging service reports, then writes release-record.json and
//     release-record.md and prints the tag name. Exits 1, with no record, when a service can't say
//     which commit it runs or the smoke tests didn't pass with at least one @staging test.
//
//   node scripts/release-record.js previous <release-record.json>
//     Prints tag=, backend=, frontend= lines for $GITHUB_OUTPUT from a previous record; empty values
//     when there is none or the record isn't one the pipeline made (first release, a hand-made test
//     release, a missing file).
//
// The record is attached to the GitHub release as release-record.json, which is where `previous`
// reads it back from: the release is the one place that keeps it for good.
const fs = require('node:fs');
const path = require('node:path');
const { SERVICES, liveCommit } = require('./render-deploy');
const { parseLcov, parseJestSummary } = require('./coverage-gate');

const SHA_RE = /^[0-9a-f]{40}$/;
const RC_TAG_RE = /^rc-[0-9]{8}-[0-9]{4}-[0-9a-f]{7}$/;
const RUN_URL_RE = /^https:\/\/github\.com\/[^/]+\/[^/]+\/actions\/runs\/[0-9]+/;

// rc-20261105-1432-1a2b3c4: sortable by time, and the short SHA says what was released.
function tagName(sha, date = new Date()) {
  const stamp = date.toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 13);
  return `rc-${stamp}-${sha.slice(0, 7)}`;
}

// The smoke tests count only when the job passed and actually ran @staging tests: a pass with zero
// tests means only the health and frontend checks ran (Khoa's review of #146).
function smokeOutcome(env) {
  const tests = Number(env.SMOKE_TESTS);
  if (env.SMOKE_RESULT !== 'success') return { passed: false, text: `not passed (Staging regression: ${env.SMOKE_RESULT || 'not run'})` };
  if (!Number.isInteger(tests) || tests < 1) return { passed: false, text: 'not passed: no @staging tests ran, only the health and frontend checks' };
  return { passed: true, tests, text: `passed: ${tests} @staging test${tests === 1 ? '' : 's'} plus the health and frontend checks (Staging regression)` };
}

// Line, branch and function coverage from CI's own reports, in whole-number percentages. A missing
// or unreadable report is recorded as null rather than stopping the release.
function readCoverage(file, parse) {
  try {
    const measured = parse(fs.readFileSync(file, 'utf8'));
    return Object.fromEntries(['lines', 'branches', 'functions'].map((m) => [m, Math.round(measured[m].pct * 10) / 10]));
  } catch {
    return null;
  }
}

function buildRecord({ env, backend, frontend, smoke, coverage = {}, date = new Date() }) {
  const tag = tagName(env.SHA, date);
  return {
    tag,
    commit: env.SHA,
    createdAt: date.toISOString(),
    components: {
      backend: { commit: backend, image: env.BACKEND_IMAGE || null, digest: env.BACKEND_DIGEST || null },
      frontend: { commit: frontend, image: env.FRONTEND_IMAGE || null, digest: env.FRONTEND_DIGEST || null },
    },
    smokeTests: smoke.text,
    smoke: { passed: smoke.passed, tests: smoke.tests ?? 0 },
    coverage: { backend: coverage.backend ?? null, frontend: coverage.frontend ?? null },
    ci: env.CI_RUN_URL || null,
    previousRelease: env.PREVIOUS_TAG || null,
    run: env.RUN_URL || null,
  };
}

const short = (sha) => (sha ? `\`${sha.slice(0, 7)}\`` : 'unknown');
const pct = (c) => (c ? `lines ${c.lines}%, branches ${c.branches}%, functions ${c.functions}%` : 'not available');
const image = (c) => (c.image ? `\`${c.image}\`${c.digest ? ` (\`${c.digest}\`)` : ''}` : '—');

function formatMarkdown(record) {
  const { backend, frontend } = record.components;
  const recovery = record.previousRelease
    ? [
      'CD rolls back by itself when a deploy or the smoke tests fail. To go back to a release by hand, run',
      `**Actions > CD > Run workflow** on \`main\` with **rollback_to** set to its tag (the one before this is`,
      `\`${record.previousRelease}\`), or redeploy its commits from the Render dashboard (each service > Manual Deploy >`,
      'Deploy a specific commit).',
    ]
    : [
      'This is the first release candidate, so there is nothing older to roll back to. To go back to this one later, run',
      `**Actions > CD > Run workflow** on \`main\` with **rollback_to** set to \`${record.tag}\`.`,
    ];
  return [
    `## Release candidate ${record.tag}`,
    '',
    `Commit ${short(record.commit)} passed CI${record.ci ? ` ([run](${record.ci}))` : ''} and was deployed to staging.`,
    '',
    '| Component | Commit on staging | Image (digest) |',
    '|---|---|---|',
    `| Backend | ${short(backend.commit)} | ${image(backend)} |`,
    `| Frontend | ${short(frontend.commit)} | ${image(frontend)} |`,
    '',
    'A component can be on an older commit than the release when nothing it uses changed since then.',
    '',
    `**Smoke tests:** ${record.smokeTests}`,
    '',
    `**Coverage (CI):** backend ${pct(record.coverage?.backend)}; frontend ${pct(record.coverage?.frontend)}`,
    '',
    `**Previous release:** ${record.previousRelease || 'none'}`,
    '',
    '### How to recover',
    '',
    ...recovery,
    '',
    record.run ? `[CD run](${record.run})` : '',
    '',
  ].join('\n');
}

// True only for a record the pipeline made: an rc-* tag, a CD run link, and smoke tests that passed.
// A hand-made release (like the #147 test candidate) fails this, so it is never promoted or chosen
// as a rollback target.
function madeByPipeline(record) {
  return Boolean(record && RC_TAG_RE.test(record.tag || '') && RUN_URL_RE.test(record.run || '')
    && typeof record.smokeTests === 'string' && record.smokeTests.startsWith('passed'));
}

// Reads a previous release-record.json. Anything unusable means "no previous good release".
function previousGood(file) {
  try {
    const record = JSON.parse(fs.readFileSync(file, 'utf8'));
    const backend = record.components?.backend?.commit;
    const frontend = record.components?.frontend?.commit;
    if (!madeByPipeline(record) || !SHA_RE.test(backend || '') || !SHA_RE.test(frontend || '')) return null;
    return { tag: record.tag, backend, frontend };
  } catch {
    return null;
  }
}

async function record(env, outDir, { fetchImpl = fetch, date = new Date() } = {}) {
  if (!SHA_RE.test(env.SHA || '')) {
    console.error('Release record: set SHA to the full commit.');
    return 2;
  }
  const smoke = smokeOutcome(env);
  if (!smoke.passed) {
    console.error(`Release record: smoke tests ${smoke.text}. No release.`);
    return 1;
  }
  const backend = await liveCommit(SERVICES.backend.versionUrl, fetchImpl);
  const frontend = await liveCommit(SERVICES.frontend.versionUrl, fetchImpl);
  if (!backend || !frontend) {
    console.error(`Release record: staging did not report its commits (backend ${backend || 'unknown'}, frontend ${frontend || 'unknown'}). No release.`);
    return 1;
  }
  const coverage = {
    backend: env.BACKEND_COVERAGE ? readCoverage(env.BACKEND_COVERAGE, parseLcov) : null,
    frontend: env.FRONTEND_COVERAGE ? readCoverage(env.FRONTEND_COVERAGE, parseJestSummary) : null,
  };
  const rec = buildRecord({ env, backend, frontend, smoke, coverage, date });
  const markdown = formatMarkdown(rec);
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'release-record.json'), JSON.stringify(rec, null, 2) + '\n');
  fs.writeFileSync(path.join(outDir, 'release-record.md'), markdown);
  if (env.GITHUB_STEP_SUMMARY) fs.appendFileSync(env.GITHUB_STEP_SUMMARY, markdown + '\n');
  console.log(rec.tag);
  return 0;
}

async function main(argv, env, deps) {
  const [command, target] = argv;
  if (command === 'record' && target) return record(env, target, deps);
  if (command === 'previous') {
    const prev = target ? previousGood(target) : null;
    console.log(`tag=${prev?.tag || ''}\nbackend=${prev?.backend || ''}\nfrontend=${prev?.frontend || ''}`);
    return 0;
  }
  console.error('Usage: node scripts/release-record.js record <output dir> | previous <release-record.json>');
  return 2;
}

module.exports = { RC_TAG_RE, tagName, smokeOutcome, readCoverage, buildRecord, formatMarkdown, madeByPipeline, previousGood, record, main };

if (require.main === module) {
  main(process.argv.slice(2), process.env).then((code) => { process.exitCode = code; });
}
