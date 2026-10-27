#!/usr/bin/env node
// Release candidates for cd.yml (backlog CICD-28): the rc-* tag name, the release record, and the
// previous good release that a failed deploy rolls back to.
//
//   node scripts/release-record.js record <output dir>
//     SHA, RUN_URL, CI_RUN_URL, SMOKE_RESULT (the smoke job's result), SMOKE_TESTS (how many @staging
//     tests ran), BACKEND_IMAGE, FRONTEND_IMAGE, BACKEND_DIGEST, FRONTEND_DIGEST, PREVIOUS_TAG,
//     BACKEND_COVERAGE (lcov.info), FRONTEND_COVERAGE (coverage-summary.json),
//     PREVIOUS_BACKEND_COMMIT / _IMAGE / _DIGEST / _REPORTS_COMMIT (the previous release's backend, from cd.yml's
//     prepare job)
//     Reads the commit each staging service reports, then writes release-record.json and
//     release-record.md and prints the tag name. Exits 1, with no record, when a service can't say
//     which commit it runs or the smoke tests didn't pass with at least one @staging test.
//
//   [REQUIRE_IMAGE=true] node scripts/release-record.js previous <release-record.json>
//     Prints tag=, backend=, frontend=, backend_image=, backend_digest=, backend_reports_commit= lines for
//     $GITHUB_OUTPUT from a previous record; empty values when there is none or the record isn't one the
//     pipeline made (first release, a hand-made test release, a missing file). With REQUIRE_IMAGE a release
//     is treated as none unless its backend image can be redeployed (CICD-73): a well-formed image and
//     digest, the image built for that very commit, and the marker that the image reports its own commit
//     (set only by releases made after the image carried GIT_COMMIT). Older releases have an image and a
//     digest too, but redeploying their image would never report the commit CD waits for.
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
const DIGEST_RE = /^sha256:[0-9a-f]{64}$/;
// What image-build.yml records: ghcr.io/<lower-case path>:<tag>.
const IMAGE_RE = /^ghcr\.io\/[a-z0-9][a-z0-9._-]*(?:\/[a-z0-9][a-z0-9._-]*)+:[A-Za-z0-9_][A-Za-z0-9_.-]{0,127}$/;

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

// The backend artifact that is really running. A run that deployed the backend (its commit is this
// run's) records this run's image; a run that skipped it keeps what the previous release recorded, but
// only when that release's backend is the commit now live. Otherwise it is unknown (null), never this
// run's newer image paired with an older commit.
// imageReportsCommit says the image carries its commit (GIT_COMMIT, CICD-73), so a deploy of it can be waited
// for and a rollback to it can be verified. Only an image this record-writing code saw built can say so.
function backendArtifact({ env, backend, previous }) {
  if (backend === env.SHA) {
    const image = env.BACKEND_IMAGE || null;
    const digest = env.BACKEND_DIGEST || null;
    return { commit: backend, image, digest, imageReportsCommit: Boolean(image && digest) };
  }
  const kept = previous?.backend;
  if (kept && kept.commit === backend) {
    const image = kept.image || null;
    const digest = kept.digest || null;
    return { commit: backend, image, digest, imageReportsCommit: kept.imageReportsCommit === true && Boolean(image && digest) };
  }
  return { commit: backend, image: null, digest: null, imageReportsCommit: false };
}

function buildRecord({ env, backend, frontend, smoke, coverage = {}, previous, date = new Date() }) {
  const tag = tagName(env.SHA, date);
  return {
    tag,
    commit: env.SHA,
    createdAt: date.toISOString(),
    components: {
      backend: backendArtifact({ env, backend, previous }),
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
  const digestLine = (how) => (backend.digest
    ? [`The backend of this release is the image \`${backend.digest}\`: to redeploy its image by digest, ${how}, which reads the digest from this record.`]
    : []);
  const steps = (tag) => [
    'Open **Actions > Manual Rollback** on GitHub, click **Run workflow**, paste the tag into the box and click the green',
    `**Run workflow** button. Paste the tag \`${tag}\` exactly as written.`,
  ];
  const recovery = record.previousRelease
    ? [
      `**If this version is wrong, roll back to \`${record.previousRelease}\`.**`,
      ...steps(record.previousRelease),
      '',
      'CD also rolls back by itself when a deploy or the smoke tests fail. A release can be redeployed from the Render dashboard too',
      '(each service > Manual Deploy > Deploy a specific commit).',
      ...digestLine('use the same Manual Rollback run'),
      '',
      'After a rollback, the newest release is not the good one: choose the newest release made before the problem started.',
      'Going back past a database change (a new index, for example) is not safe: check the notes of the releases in between first.',
    ]
    : [
      'This is the first release candidate, so there is nothing older to roll back to. To go back to this one later, use',
      `**Actions > Manual Rollback** and paste \`${record.tag}\` into the box.`,
      ...digestLine('use that Manual Rollback run'),
      '',
      'Going back past a database change (a new index, for example) is not safe: check the notes of the releases in between first.',
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

// Reads a previous release-record.json. Anything unusable means "no previous good release". With
// requireImage, a release is usable only when its backend image can be redeployed: a well-formed ghcr.io
// image and sha256 digest, the image tagged with the backend's own commit, and the record's marker that the
// image reports its commit. Every release made before CICD-73 has an image and a digest but no marker, and
// some pair a backend commit with another run's image, so none of them is a rollback target.
function previousGood(file, { requireImage = false } = {}) {
  try {
    const record = JSON.parse(fs.readFileSync(file, 'utf8'));
    const backend = record.components?.backend?.commit;
    const frontend = record.components?.frontend?.commit;
    if (!madeByPipeline(record) || !SHA_RE.test(backend || '') || !SHA_RE.test(frontend || '')) return null;
    const image = record.components.backend.image;
    const digest = record.components.backend.digest;
    const wellFormed = IMAGE_RE.test(image || '') && DIGEST_RE.test(digest || '');
    const reports = record.components.backend.imageReportsCommit === true;
    if (requireImage && !(wellFormed && reports && image.endsWith(`:${backend}`))) return null;
    return { tag: record.tag, backend, frontend, backendImage: wellFormed ? image : null, backendDigest: wellFormed ? digest : null, backendReportsCommit: wellFormed && reports };
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
  const previous = SHA_RE.test(env.PREVIOUS_BACKEND_COMMIT || '')
    ? { backend: { commit: env.PREVIOUS_BACKEND_COMMIT, image: env.PREVIOUS_BACKEND_IMAGE || null, digest: env.PREVIOUS_BACKEND_DIGEST || null, imageReportsCommit: env.PREVIOUS_BACKEND_REPORTS_COMMIT === 'true' } }
    : undefined;
  const rec = buildRecord({ env, backend, frontend, smoke, coverage, previous, date });
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
    const prev = target ? previousGood(target, { requireImage: env.REQUIRE_IMAGE === 'true' }) : null;
    console.log(`tag=${prev?.tag || ''}\nbackend=${prev?.backend || ''}\nfrontend=${prev?.frontend || ''}\nbackend_image=${prev?.backendImage || ''}\nbackend_digest=${prev?.backendDigest || ''}\nbackend_reports_commit=${prev?.backendReportsCommit ? 'true' : ''}`);
    return 0;
  }
  console.error('Usage: node scripts/release-record.js record <output dir> | previous <release-record.json>');
  return 2;
}

// The command line's catch-all: a short message instead of a raw stack trace. The record holds no secrets, so
// the error's own message is safe to show.
function failureMessage(error) {
  return `Release record: failed (${error?.message || error}). No release.`;
}

module.exports = { RC_TAG_RE, DIGEST_RE, IMAGE_RE, tagName, smokeOutcome, readCoverage, buildRecord, formatMarkdown, madeByPipeline, previousGood, failureMessage, record, main };

if (require.main === module) {
  main(process.argv.slice(2), process.env).then(
    (code) => { process.exitCode = code; },
    (error) => { console.error(failureMessage(error)); process.exitCode = 1; },
  );
}
