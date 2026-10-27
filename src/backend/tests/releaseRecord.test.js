const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  tagName, smokeOutcome, readCoverage, buildRecord, formatMarkdown, madeByPipeline, previousGood, record, main,
} = require('../../../scripts/release-record');
const { parseLcov, parseJestSummary } = require('../../../scripts/coverage-gate');

// Release candidates in cd.yml (CICD-28): the rc-* tag, the release record, and the previous good
// release that a failed deploy rolls back to. Khoa's review of #146 and #147 added the real smoke
// result, the CI run, coverage and digests, and "only the pipeline's own releases count".
const A = 'a'.repeat(40);
const B = 'b'.repeat(40);
const C = 'c'.repeat(40);
const WHEN = new Date('2026-11-05T14:32:09Z');
const RUN = 'https://github.com/IT7993-FALL-2026-PEERS/ProjectPeerEvaluation/actions/runs/123';
const CI = 'https://github.com/IT7993-FALL-2026-PEERS/ProjectPeerEvaluation/actions/runs/122';
const PASSED = { SMOKE_RESULT: 'success', SMOKE_TESTS: '3' };
const reply = (status, body) => ({ ok: status >= 200 && status < 300, status, text: async () => body });
const staging = ({ backend = B, frontend = C } = {}) => async (url) => (String(url).includes('/api/health')
  ? reply(200, JSON.stringify({ status: 'OK', commit: backend }))
  : reply(frontend ? 200 : 404, frontend ? `${frontend}\n` : 'Not Found'));
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'release-record-'));
const LCOV = 'SF:a.js\nLF:10\nLH:8\nBRF:4\nBRH:3\nFNF:2\nFNH:2\nend_of_record\n';
const JEST = JSON.stringify({ total: { lines: { covered: 42, total: 100 }, branches: { covered: 5, total: 10 }, functions: { covered: 1, total: 4 } } });
const pipelineRecord = (overrides = {}) => buildRecord({
  env: { SHA: A, RUN_URL: RUN, ...overrides }, backend: B, frontend: C, smoke: smokeOutcome(PASSED), date: WHEN,
});

test('the tag is rc-<date>-<time>-<short sha>, in UTC', () => {
  assert.equal(tagName(A, WHEN), 'rc-20261105-1432-aaaaaaa');
  assert.match(tagName(A, WHEN), /^rc-[0-9]{8}-[0-9]{4}-[0-9a-f]{7}$/);
});

test('smoke tests count only when the job passed and ran at least one @staging test', () => {
  assert.deepEqual(smokeOutcome(PASSED), { passed: true, tests: 3, text: 'passed: 3 @staging tests plus the health and frontend checks (Staging regression)' });
  assert.match(smokeOutcome({ SMOKE_RESULT: 'success', SMOKE_TESTS: '1' }).text, /passed: 1 @staging test plus/);
  assert.equal(smokeOutcome({ SMOKE_RESULT: 'success', SMOKE_TESTS: '0' }).passed, false);
  assert.match(smokeOutcome({ SMOKE_RESULT: 'success', SMOKE_TESTS: '0' }).text, /no @staging tests ran/);
  assert.equal(smokeOutcome({ SMOKE_RESULT: 'success' }).passed, false);
  assert.match(smokeOutcome({ SMOKE_RESULT: 'failure', SMOKE_TESTS: '3' }).text, /not passed \(Staging regression: failure\)/);
  assert.match(smokeOutcome({}).text, /not run/);
});

test('coverage comes from the CI reports the coverage gate reads, or null when missing', () => {
  const dir = tmp();
  fs.writeFileSync(path.join(dir, 'lcov.info'), LCOV);
  fs.writeFileSync(path.join(dir, 'summary.json'), JEST);
  assert.deepEqual(readCoverage(path.join(dir, 'lcov.info'), parseLcov), { lines: 80, branches: 75, functions: 100 });
  assert.deepEqual(readCoverage(path.join(dir, 'summary.json'), parseJestSummary), { lines: 42, branches: 50, functions: 25 });
  assert.equal(readCoverage(path.join(dir, 'missing.info'), parseLcov), null);
});

test('the record lists commits, images and digests, smoke, coverage, the CI run and the previous release', () => {
  const rec = buildRecord({
    env: {
      SHA: A, BACKEND_IMAGE: 'ghcr.io/x/backend:a', BACKEND_DIGEST: 'sha256:1234', PREVIOUS_TAG: 'rc-20261101-0900-bbbbbbb',
      RUN_URL: RUN, CI_RUN_URL: CI,
    },
    backend: B,
    frontend: C,
    smoke: smokeOutcome(PASSED),
    coverage: { backend: { lines: 66.1, branches: 80.5, functions: 72.9 } },
    date: WHEN,
  });
  assert.equal(rec.tag, 'rc-20261105-1432-aaaaaaa');
  // The backend on staging is B, not this run's commit A, so this run's image is not what runs there (TC-29-59).
  assert.deepEqual(rec.components.backend, { commit: B, image: null, digest: null, imageReportsCommit: false });
  assert.deepEqual(rec.components.frontend, { commit: C, image: null, digest: null });
  assert.deepEqual(rec.smoke, { passed: true, tests: 3 });
  assert.equal(rec.coverage.frontend, null);
  assert.equal(rec.ci, CI);
  assert.equal(rec.run, RUN);
  assert.equal(rec.previousRelease, 'rc-20261101-0900-bbbbbbb');
});

test('the release notes state the real smoke result instead of a fixed "passed"', () => {
  const md = formatMarkdown(pipelineRecord({ CI_RUN_URL: CI, PREVIOUS_TAG: 'rc-20261101-0900-bbbbbbb' }));
  assert.match(md, /## Release candidate rc-20261105-1432-aaaaaaa/);
  assert.match(md, /passed CI \(\[run\]\(https:\/\/github\.com\/.*\/122\)\) and was deployed to staging\./);
  assert.doesNotMatch(md, /passed the smoke tests/);
  assert.match(md, /\*\*Smoke tests:\*\* passed: 3 @staging tests/);
  assert.match(md, /\*\*Coverage \(CI\):\*\* backend not available; frontend not available/);
  assert.match(md, /### How to recover/);
  assert.match(md, /Manual Rollback[\s\S]*rc-20261101-0900-bbbbbbb/);
});

test('the first release says there is nothing older to roll back to', () => {
  const md = formatMarkdown(pipelineRecord());
  assert.match(md, /first release candidate/);
  assert.match(md, /\*\*Previous release:\*\* none/);
});

test('only a record the pipeline made counts: rc tag, CD run link, smoke passed', () => {
  assert.equal(madeByPipeline(pipelineRecord()), true);
  assert.equal(madeByPipeline({ ...pipelineRecord(), run: null }), false);
  assert.equal(madeByPipeline({ ...pipelineRecord(), run: 'https://example.com/run' }), false);
  assert.equal(madeByPipeline({ ...pipelineRecord(), smokeTests: 'not run: hand-made test release candidate for the #147 dry run' }), false);
  assert.equal(madeByPipeline({ ...pipelineRecord(), tag: 'rc-latest' }), false);
});

test('previousGood reads the commits back from a pipeline release record', () => {
  const file = path.join(tmp(), 'release-record.json');
  fs.writeFileSync(file, JSON.stringify(pipelineRecord()));
  assert.deepEqual(previousGood(file), { tag: 'rc-20261105-1432-aaaaaaa', backend: B, frontend: C, backendImage: null, backendDigest: null, backendReportsCommit: false });
});

test('previousGood ignores hand-made, missing and broken records', () => {
  const dir = tmp();
  // The #147 test candidate: right shape, but no CD run and no smoke tests.
  fs.writeFileSync(path.join(dir, 'test.json'), JSON.stringify({ tag: 'rc-20261005-2223-955dfcc', smokeTests: 'not run: hand-made test release candidate for the #147 dry run', run: null, components: { backend: { commit: B }, frontend: { commit: C } } }));
  assert.equal(previousGood(path.join(dir, 'test.json')), null);
  assert.equal(previousGood(path.join(dir, 'missing.json')), null);
  fs.writeFileSync(path.join(dir, 'bad.json'), '{not json');
  assert.equal(previousGood(path.join(dir, 'bad.json')), null);
  fs.writeFileSync(path.join(dir, 'short.json'), JSON.stringify({ ...pipelineRecord(), components: { backend: { commit: 'abc' }, frontend: { commit: C } } }));
  assert.equal(previousGood(path.join(dir, 'short.json')), null);
});

test('record writes the JSON and the notes, with coverage, and prints the tag', async (t) => {
  const log = t.mock.method(console, 'log', () => {});
  const dir = tmp();
  fs.writeFileSync(path.join(dir, 'lcov.info'), LCOV);
  const env = { SHA: A, RUN_URL: RUN, CI_RUN_URL: CI, ...PASSED, BACKEND_COVERAGE: path.join(dir, 'lcov.info'), FRONTEND_COVERAGE: path.join(dir, 'none.json') };
  assert.equal(await record(env, dir, { fetchImpl: staging(), date: WHEN }), 0);
  assert.equal(log.mock.calls[0].arguments[0], 'rc-20261105-1432-aaaaaaa');
  const rec = JSON.parse(fs.readFileSync(path.join(dir, 'release-record.json'), 'utf8'));
  assert.equal(rec.components.backend.commit, B);
  assert.equal(rec.components.frontend.commit, C);
  assert.deepEqual(rec.coverage, { backend: { lines: 80, branches: 75, functions: 100 }, frontend: null });
  assert.equal(madeByPipeline(rec), true);
  assert.ok(fs.readFileSync(path.join(dir, 'release-record.md'), 'utf8').includes('How to recover'));
});

test('no release when no @staging test ran, even though the smoke job passed', async (t) => {
  const err = t.mock.method(console, 'error', () => {});
  const dir = tmp();
  assert.equal(await record({ SHA: A, RUN_URL: RUN, SMOKE_RESULT: 'success', SMOKE_TESTS: '0' }, dir, { fetchImpl: staging(), date: WHEN }), 1);
  assert.match(err.mock.calls[0].arguments[0], /no @staging tests ran, only the health and frontend checks\. No release\./);
  assert.equal(fs.existsSync(path.join(dir, 'release-record.json')), false);
});

test('no release when staging cannot say which commit it runs', async (t) => {
  t.mock.method(console, 'error', () => {});
  const dir = tmp();
  assert.equal(await record({ SHA: A, RUN_URL: RUN, ...PASSED }, dir, { fetchImpl: staging({ frontend: null }), date: WHEN }), 1);
  assert.equal(fs.existsSync(path.join(dir, 'release-record.json')), false);
});

test('record refuses a missing commit', async (t) => {
  t.mock.method(console, 'error', () => {});
  assert.equal(await record({ SHA: 'main', ...PASSED }, tmp(), { fetchImpl: staging() }), 2);
});

test('main previous prints empty outputs when there is no earlier release', async (t) => {
  const log = t.mock.method(console, 'log', () => {});
  assert.equal(await main(['previous', ''], {}), 0);
  assert.equal(log.mock.calls[0].arguments[0], 'tag=\nbackend=\nfrontend=\nbackend_image=\nbackend_digest=\nbackend_reports_commit=');
});

test('main rejects an unknown command', async (t) => {
  t.mock.method(console, 'error', () => {});
  assert.equal(await main(['publish'], {}), 2);
});

// Khoa's follow-up on #146: a short message instead of a raw stack trace.
const { spawnSync } = require('node:child_process');
const { failureMessage } = require('../../../scripts/release-record');

test('an unexpected error becomes one short line', () => {
  assert.equal(failureMessage(new Error('EACCES: permission denied')), 'Release record: failed (EACCES: permission denied). No release.');
});

test('the command line exits 2 with its usage line, not a stack trace', () => {
  const script = path.join(__dirname, '..', '..', '..', 'scripts', 'release-record.js');
  const run = spawnSync(process.execPath, [script, 'publish'], { encoding: 'utf8' });
  assert.equal(run.status, 2);
  assert.match(run.stderr, /^Usage: node scripts\/release-record\.js/);
  assert.doesNotMatch(run.stderr, /at .*\.js:\d+/);
});

// Image deploy mode (CICD-73): the record names the artifact that is really running, and a rollback
// only targets a release whose backend image is recorded.
const D1 = `sha256:${'1'.repeat(64)}`;
const D2 = `sha256:${'2'.repeat(64)}`;
const IMG = (sha) => `ghcr.io/it7993-fall-2026-peers/projectpeerevaluation/backend:${sha}`;

test('TC-29-59: a backend skipped by a run keeps the artifact that is really running, never this run\'s newer image', () => {
  const env = { SHA: A, RUN_URL: RUN, BACKEND_IMAGE: IMG(A), BACKEND_DIGEST: D2 };
  const previous = { backend: { commit: B, image: IMG(B), digest: D1, imageReportsCommit: true } };
  const kept = buildRecord({ env, backend: B, frontend: A, smoke: smokeOutcome(PASSED), previous, date: WHEN });
  assert.deepEqual(kept.components.backend, { commit: B, image: IMG(B), digest: D1, imageReportsCommit: true });
  const fresh = buildRecord({ env, backend: A, frontend: A, smoke: smokeOutcome(PASSED), previous, date: WHEN });
  assert.deepEqual(fresh.components.backend, { commit: A, image: IMG(A), digest: D2, imageReportsCommit: true });
  const unknown = buildRecord({ env, backend: B, frontend: A, smoke: smokeOutcome(PASSED), date: WHEN });
  assert.deepEqual(unknown.components.backend, { commit: B, image: null, digest: null, imageReportsCommit: false });
  const old = buildRecord({ env, backend: B, frontend: A, smoke: smokeOutcome(PASSED), previous: { backend: { commit: B, image: IMG(B), digest: D1 } }, date: WHEN });
  assert.deepEqual(old.components.backend, { commit: B, image: IMG(B), digest: D1, imageReportsCommit: false }, 'an old release is carried forward as it is; it never gains the marker');
  const other = buildRecord({ env, backend: B, frontend: A, smoke: smokeOutcome(PASSED), previous: { backend: { commit: C, image: IMG(C), digest: D1 } }, date: WHEN });
  assert.deepEqual(other.components.backend, { commit: B, image: null, digest: null, imageReportsCommit: false }, 'a previous release on another commit says nothing about what runs now');
});

test('TC-29-69: record() takes the skipped backend\'s artifact from the previous release passed in by CD', async (t) => {
  t.mock.method(console, 'log', () => {});
  const dir = tmp();
  const env = {
    SHA: A, RUN_URL: RUN, ...PASSED, BACKEND_IMAGE: IMG(A), BACKEND_DIGEST: D2,
    PREVIOUS_BACKEND_COMMIT: B, PREVIOUS_BACKEND_IMAGE: IMG(B), PREVIOUS_BACKEND_DIGEST: D1, PREVIOUS_BACKEND_REPORTS_COMMIT: 'true',
  };
  assert.equal(await record(env, dir, { fetchImpl: staging({ backend: B, frontend: A }), date: WHEN }), 0);
  const rec = JSON.parse(fs.readFileSync(path.join(dir, 'release-record.json'), 'utf8'));
  assert.deepEqual(rec.components.backend, { commit: B, image: IMG(B), digest: D1, imageReportsCommit: true });
});

test('TC-29-60: with requireImage, previousGood selects only a release whose backend has an image and a digest, and returns them', () => {
  const dir = tmp();
  const write = (name, backend) => {
    const file = path.join(dir, name);
    fs.writeFileSync(file, JSON.stringify({ ...pipelineRecord(), components: { backend, frontend: { commit: C } } }));
    return file;
  };
  const withImage = write('with.json', { commit: B, image: IMG(B), digest: D1, imageReportsCommit: true });
  const without = write('without.json', { commit: B, image: null, digest: null });
  const badDigest = write('bad.json', { commit: B, image: IMG(B), digest: 'sha256:short', imageReportsCommit: true });
  const foreignImage = write('foreign.json', { commit: B, image: `docker.io/library/node:${B}`, digest: D1, imageReportsCommit: true });
  // The shape every release made before this change already has: an image and a digest, the tag equal to the
  // commit, but no marker. Its image predates GIT_COMMIT (it cannot report its commit), so it is not a target.
  const realOld = write('real-old.json', { commit: B, image: IMG(B), digest: D1 });
  // An image built for another commit than the backend that was running (a skipped backend in the old code).
  const wrongCommit = write('wrong-commit.json', { commit: B, image: IMG(A), digest: D1, imageReportsCommit: true });
  assert.deepEqual(previousGood(withImage, { requireImage: true }), { tag: pipelineRecord().tag, backend: B, frontend: C, backendImage: IMG(B), backendDigest: D1, backendReportsCommit: true });
  assert.equal(previousGood(without, { requireImage: true }), null);
  assert.equal(previousGood(badDigest, { requireImage: true }), null);
  assert.equal(previousGood(foreignImage, { requireImage: true }), null);
  assert.equal(previousGood(realOld, { requireImage: true }), null, 'a release made before the image deploy is not a rollback target');
  assert.equal(previousGood(wrongCommit, { requireImage: true }), null, 'an image of another commit is not a rollback target');
  assert.equal(previousGood(without).backend, B, 'source mode still accepts it');
  assert.equal(previousGood(without).backendImage, null);
  assert.equal(previousGood(realOld).backendReportsCommit, false, 'carried forward as it is, without claiming more');
});

test('TC-29-70: the previous command prints the backend image and digest, and REQUIRE_IMAGE skips a release without one', async (t) => {
  const log = t.mock.method(console, 'log', () => {});
  const dir = tmp();
  const file = path.join(dir, 'release-record.json');
  fs.writeFileSync(file, JSON.stringify({ ...pipelineRecord(), components: { backend: { commit: B, image: IMG(B), digest: D1, imageReportsCommit: true }, frontend: { commit: C } } }));
  assert.equal(await main(['previous', file], {}), 0);
  assert.equal(log.mock.calls[0].arguments[0], `tag=${pipelineRecord().tag}\nbackend=${B}\nfrontend=${C}\nbackend_image=${IMG(B)}\nbackend_digest=${D1}\nbackend_reports_commit=true`);
  fs.writeFileSync(file, JSON.stringify({ ...pipelineRecord(), components: { backend: { commit: B }, frontend: { commit: C } } }));
  assert.equal(await main(['previous', file], { REQUIRE_IMAGE: 'true' }), 0);
  assert.equal(log.mock.calls[1].arguments[0], 'tag=\nbackend=\nfrontend=\nbackend_image=\nbackend_digest=\nbackend_reports_commit=');
  assert.equal(await main(['previous', file], {}), 0);
  assert.match(log.mock.calls[2].arguments[0], new RegExp(`backend=${B}`));
});

test('TC-29-71: the recovery text names the image digest for a component that has one', () => {
  const rec = { ...pipelineRecord({ PREVIOUS_TAG: 'rc-20261101-0900-bbbbbbb' }), components: { backend: { commit: B, image: IMG(B), digest: D1, imageReportsCommit: true }, frontend: { commit: C, image: null, digest: null } } };
  const md = formatMarkdown(rec);
  assert.match(md, new RegExp(`Backend.*${D1}`));
  assert.match(md, /redeploy its image by digest/);
});

// CICD-78: the notes tell a person which tag to paste into Actions > Manual Rollback, so nobody has to find it.
test('TC-29-75: the notes name the previous release as the one to paste into Manual Rollback', () => {
  const md = formatMarkdown(pipelineRecord({ PREVIOUS_TAG: 'rc-20261101-0900-bbbbbbb' }));
  assert.match(md, /If this version is wrong, roll back to `rc-20261101-0900-bbbbbbb`/);
  assert.match(md, /Actions > Manual Rollback/);
  assert.match(md, /Paste the tag/);
});

test('TC-29-76: the first release has nothing older to roll back to, and does not name a previous tag', () => {
  const rec = pipelineRecord();
  const md = formatMarkdown(rec);
  assert.match(md, /first release candidate/);
  assert.doesNotMatch(md, /If this version is wrong, roll back to/);
  assert.match(md, /Actions > Manual Rollback/);
  assert.ok(md.includes(`\`${rec.tag}\``));
});

test('TC-29-77: the notes warn that after a rollback the newest release may not be the good one, and about database changes', () => {
  const md = formatMarkdown(pipelineRecord({ PREVIOUS_TAG: 'rc-20261101-0900-bbbbbbb' }));
  assert.match(md, /newest release made before the problem started/);
  assert.match(md, /database change/);
});
