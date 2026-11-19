const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// CICD-90: the Docker images CD builds are scanned for known vulnerabilities before staging runs the backend image.
// The scan is a job of its own with read-only permissions (never a step of the image build, the one job that can
// write packages), the scanner is pinned to a reviewed commit (Trivy's GitHub Action was hijacked in March 2026,
// GHSA-69fq-xp46-6x23), and an accepted finding must be narrow, dated and explained, like the OWASP suppressions.
const root = path.join(__dirname, '..', '..', '..');
// The workflow files are LF (.gitattributes); the ignore file is read strictly below, so normalise to be safe.
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8').replace(/\r\n/g, '\n');
const cd = read('.github', 'workflows', 'cd.yml');
const imageBuild = read('.github', 'workflows', 'image-build.yml');

// The text of one top-level job: from "  name:" to the line before the next job.
function job(workflow, name) {
  const lines = workflow.split('\n');
  const start = lines.findIndex((l) => l === `  ${name}:`);
  assert.ok(start >= 0, `job ${name} not found`);
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i += 1) {
    if (/^ {2}[A-Za-z0-9_-]+:\s*$/.test(lines[i])) { end = i; break; }
  }
  return lines.slice(start, end).join('\n');
}

// The steps of a job as separate texts, each starting at its "      - " line.
function steps(jobText) {
  const parts = jobText.split(/\n(?= {6}- )/);
  // Comment lines before the next step describe no step's behaviour, so they are left out.
  return parts.slice(1).map((p) => p.split('\n').filter((l) => !/^\s*#/.test(l)).join('\n'));
}

// The expression of a key such as "    if:" or "      result:", whether it is on one line or a folded block (>-),
// without the ${{ }} wrapper.
function expression(jobText, key, indent) {
  const lines = jobText.split('\n');
  const pad = ' '.repeat(indent);
  const i = lines.findIndex((l) => l.startsWith(`${pad}${key}:`));
  assert.ok(i >= 0, `${key} not found`);
  let value = lines[i].slice(pad.length + key.length + 1).trim();
  if (value === '>-' || value === '>') {
    const body = [];
    for (let j = i + 1; j < lines.length && lines[j].startsWith(`${pad}  `); j += 1) body.push(lines[j].trim());
    value = body.join(' ');
  }
  return value.replace(/^\$\{\{\s*/, '').replace(/\s*\}\}$/, '');
}

// Evaluates a GitHub Actions condition for given job results, so the tests check what the condition DOES, not
// only what it says. Only the few constructs the workflow uses are supported; anything else throws.
function evaluate(expr, { results, outputs = {}, inputs = {}, cancelled = false }) {
  const needs = {};
  for (const [name, result] of Object.entries(results)) needs[name] = { result, outputs: outputs[name] || {} };
  const js = expr
    .replace(/!cancelled\(\)/g, '!cancelled')
    .replace(/contains\(fromJSON\('(\[[^']*\])'\), ([\w.]+)\)/g, '$1.includes($2)')
    .replace(/needs\.(prepare|images|scan|deploy)\.outputs\.(\w+)/g, 'needs.$1.outputs.$2')
    .replace(/needs\.([\w-]+)\./g, (m, n) => `needs["${n}"].`);
  if (/[^\w\s.'"[\],!&|=()<>$-]/.test(js)) throw new Error(`unsupported expression: ${js}`);
  return new Function('needs', 'inputs', 'cancelled', `return (${js});`)(needs, inputs, cancelled);
}

const REVIEWED_ACTION = 'aquasecurity/trivy-action@ed142fd0673e97e23eac54620cfb913e5ce36c25';
// Malicious Trivy releases named in GHSA-69fq-xp46-6x23.
const MALICIOUS = ['v0.69.4', 'v0.69.5', 'v0.69.6'];

test('TC-SEC-20: the scan is a job of its own that waits for the images and has read-only permissions', () => {
  const scan = job(cd, 'scan');
  assert.match(scan, /needs: \[images\]/);
  assert.match(scan, /needs\.images\.result == 'success'/);
  assert.match(scan, /permissions:\n\s+contents: read\n\s+packages: read\n/);
  assert.doesNotMatch(scan, /: write/, 'the scan job must not hold a write permission');
  // The scan job runs exactly when the images job succeeded (skipped while CD_RELEASE is off, never after a failure).
  const when = expression(scan, 'if', 4);
  const runs = (images, cancelled = false) => evaluate(when, { results: { images }, cancelled });
  assert.equal(runs('success'), true);
  for (const images of ['failure', 'skipped', 'cancelled']) assert.equal(runs(images), false, `images ${images}`);
  assert.equal(runs('success', true), false, 'a cancelled run');
  // The job token (read-only here) is the registry login for the pull; no other secret belongs in this job.
  assert.doesNotMatch(scan, /secrets\.(?!GITHUB_TOKEN\b)/, 'the scan job must not read secrets');
});

test('TC-SEC-21: the image build job does not run the scanner, so the job that can write packages stays free of it', () => {
  assert.doesNotMatch(imageBuild, /trivy/i);
  assert.match(imageBuild, /packages: write/);
});

test('TC-SEC-22: the scanner action is pinned to the reviewed commit and an explicit Trivy version, never latest', () => {
  const scan = job(cd, 'scan');
  const uses = [...scan.matchAll(/uses: (aquasecurity\/[^\s]+)/g)].map((m) => m[1]);
  assert.equal(uses.length, 2, 'the scan job runs trivy-action twice (backend, frontend)');
  for (const u of uses) assert.equal(u, REVIEWED_ACTION, `${u} is not the reviewed commit`);
  const versions = [...scan.matchAll(/^\s+version: (\S+)/gm)].map((m) => m[1]);
  assert.equal(versions.length, uses.length, 'every scanner step sets version');
  for (const v of versions) {
    assert.match(v, /^v\d+\.\d+\.\d+$/, `version must be explicit: ${v}`);
    assert.ok(!MALICIOUS.includes(v), `${v} is a malicious release`);
    const [, minor, patch] = /^v0\.(\d+)\.(\d+)$/.exec(v) || [];
    assert.ok(minor !== undefined && (Number(minor) > 69 || (Number(minor) === 69 && Number(patch) <= 3)), `${v} is not a release the advisory calls safe`);
  }
});

test('TC-SEC-23: the backend image is pulled by its digest, saved as backend.tar, scanned after the registry login is gone, and blocks on fixable HIGH and CRITICAL operating-system findings', () => {
  const scan = job(cd, 'scan');
  const all = steps(scan);
  const pull = all.find((s) => /Pull the backend image/.test(s));
  assert.ok(pull, 'a backend pull step');
  assert.match(pull, /DIGEST: \$\{\{ needs\.images\.outputs\.backend_digest \}\}/, 'the backend digest, not the frontend one');
  assert.match(pull, /\^sha256:\[0-9a-f\]\{64\}\$/, 'the digest is checked before it is used');
  assert.match(pull, /docker pull "\$\{repo\}\/backend@\$\{DIGEST\}"/);
  assert.match(pull, /docker save -o scan\/backend\.tar "\$\(docker image inspect --format '\{\{\.Id\}\}' "\$\{repo\}\/backend@\$\{DIGEST\}"\)"/, 'the saved image is the one pulled by digest');
  assert.doesNotMatch(pull, /frontend/, 'the backend step touches no frontend image');
  assert.doesNotMatch(pull, /continue-on-error/, 'a backend pull problem must stop the job');
  assert.doesNotMatch(pull, /\n\s+if:/, 'the backend pull has no condition that could skip it');

  const index = (re) => all.findIndex((s) => re.test(s));
  const logout = index(/docker logout ghcr\.io/);
  const backendScan = index(/input: scan\/backend\.tar/);
  assert.ok(logout > index(/Pull the backend image/) && backendScan > logout, 'the registry login is removed before the scanner runs');
  const scanStep = all[backendScan];
  assert.match(scanStep, /uses: aquasecurity\/trivy-action/);
  assert.match(scanStep, /severity: HIGH,CRITICAL/);
  assert.match(scanStep, /ignore-unfixed: true/);
  assert.match(scanStep, /vuln-type: os/);
  assert.match(scanStep, /exit-code: '1'/);
  assert.match(scanStep, /trivyignores: \.github\/trivyignore\.yaml/);
  assert.doesNotMatch(scanStep, /continue-on-error/, 'the backend scan must be able to fail the job');
  assert.doesNotMatch(scanStep, /\n\s+if:/, 'the backend scan has no condition that could skip it, so a green scan job means it ran');
});

test('TC-SEC-24: the frontend image is scanned and reported, and nothing about it can fail the job', () => {
  const all = steps(job(cd, 'scan'));
  const pull = all.find((s) => /Pull the frontend image/.test(s));
  const frontendScan = all.find((s) => /input: scan\/frontend\.tar/.test(s));
  assert.ok(pull && frontendScan, 'a frontend pull and a frontend scan');
  assert.match(pull, /DIGEST: \$\{\{ needs\.images\.outputs\.frontend_digest \}\}/);
  assert.match(pull, /docker save -o scan\/frontend\.tar/);
  assert.doesNotMatch(pull, /backend/, 'the frontend step touches no backend image');
  for (const s of [pull, frontendScan]) assert.match(s, /\n\s+continue-on-error: true\n/, 'a frontend problem must not fail the job');
  assert.match(frontendScan, /exit-code: '0'/);
});

test('TC-SEC-25: deploy waits for the scan: a failed, cancelled or missing scan stops it, a skipped one (CD_RELEASE off) does not', () => {
  const deploy = job(cd, 'deploy');
  assert.match(deploy, /needs: \[prepare, images, scan\]/);
  const expr = expression(deploy, 'if', 4);
  const run = (over) => evaluate(expr, {
    results: { prepare: 'success', images: 'success', scan: 'success', ...over.results },
    outputs: { prepare: { stale: 'false' } },
    inputs: { rollback_to: '' },
    ...over.rest,
  });
  assert.equal(run({}), true, 'images and scan passed');
  assert.equal(run({ results: { images: 'skipped', scan: 'skipped' } }), true, 'CD_RELEASE off: deploys as before');
  assert.equal(run({ results: { scan: 'failure' } }), false, 'a failed scan');
  assert.equal(run({ results: { scan: 'cancelled' } }), false, 'a cancelled scan');
  assert.equal(run({ results: { images: 'failure', scan: 'skipped' } }), false, 'failed images');
  assert.equal(run({ rest: { cancelled: true } }), false, 'a cancelled run');
  assert.equal(run({ results: { prepare: 'failure' } }), false, 'a failed prepare');
  assert.equal(run({ rest: { inputs: { rollback_to: 'rc-1' } } }), false, 'a manual rollback never runs the deploy job');
  assert.equal(run({ rest: { outputs: { prepare: { stale: 'true' } } } }), false, 'a stale run');
});

test('TC-SEC-26: a failed scan is reported as a failure that deployed nothing, and the report still runs for a normal deploy', () => {
  const report = job(cd, 'report');
  assert.match(report, /needs: \[prepare, images, scan, deploy\]/);
  const when = expression(report, 'if', 4);
  const result = expression(report, 'result', 6);
  const base = { prepare: 'success', images: 'success', scan: 'success', deploy: 'success' };
  const ctx = (over) => ({ results: { ...base, ...over }, outputs: {}, inputs: {} });
  // the report runs when a deploy ran, or when the images or the scan failed and nothing deployed
  assert.equal(evaluate(when, ctx({})), true);
  assert.equal(evaluate(when, ctx({ scan: 'failure', deploy: 'skipped' })), true, 'a failed scan is reported');
  assert.equal(evaluate(when, ctx({ images: 'failure', scan: 'skipped', deploy: 'skipped' })), true, 'failed images are still reported');
  assert.equal(evaluate(when, ctx({ images: 'skipped', scan: 'skipped', deploy: 'skipped' })), false, 'nothing ran: no report');
  // and says failure for a failed scan, otherwise what the deploy did
  assert.equal(evaluate(result, ctx({ scan: 'failure', deploy: 'skipped' })), 'failure');
  assert.equal(evaluate(result, ctx({ images: 'failure', scan: 'skipped', deploy: 'skipped' })), 'failure');
  assert.equal(evaluate(result, ctx({})), 'success');
  assert.equal(evaluate(result, ctx({ deploy: 'failure' })), 'failure');
  assert.match(report, /image scan/i);
});

// The accepted-risk file. It is read with a strict line grammar, not a YAML parser, so an entry written another way
// (a flow mapping on one line, another top-level key, a comment where a value belongs, a repeated field, a
// missing field) is refused instead of being skipped. TC-SEC-27 runs this reader on the real file and TC-SEC-29 on
// documents written to slip past it.
function readIgnoreEntries(text) {
  const lines = text.replace(/\r\n/g, '\n').split('\n').filter((l) => l.trim() !== '' && !/^\s*#/.test(l));
  if (!(lines.length >= 1 && /^vulnerabilities:( \[\])?$/.test(lines[0]))) {
    throw new Error('the file must start with "vulnerabilities:" or "vulnerabilities: []"');
  }
  const empty = lines[0].endsWith('[]');
  if (empty && lines.length > 1) throw new Error('entries under "vulnerabilities: []" are not read');
  const entries = [];
  for (const line of lines.slice(1)) {
    let m;
    const last = entries[entries.length - 1];
    if ((m = /^ {2}- id: (CVE-\d{4}-\d{4,}|GHSA-[0-9a-z]{4}-[0-9a-z]{4}-[0-9a-z]{4})$/.exec(line))) {
      entries.push({ id: m[1] });
    } else if (last && (m = /^ {4}expired_at: (\d{4}-\d{2}-\d{2})$/.exec(line))) {
      if (last.expired) throw new Error(`${last.id}: expired_at is given twice`);
      last.expired = m[1];
    } else if (last && (m = /^ {4}statement: ([A-Za-z][^#]*)$/.exec(line)) && !/ #/.test(m[1]) && !/: /.test(m[1])) {
      // A plain scalar that starts with a letter: a "#" would turn the rest into a comment and leave no statement.
      if (last.statement) throw new Error(`${last.id}: statement is given twice`);
      last.statement = m[1].trim();
    } else {
      throw new Error(`unsupported line (use the block form shown in the file's header): ${line}`);
    }
  }
  for (const e of entries) {
    if (!e.expired) throw new Error(`${e.id}: expired_at is missing`);
    if (!e.statement || e.statement.length < 40) throw new Error(`${e.id}: statement missing or shorter than 40 characters`);
  }
  return entries;
}

const ignoreText = read('.github', 'trivyignore.yaml');

test('TC-SEC-27: every accepted image finding in the real file names one advisory, expires and says why', () => {
  assert.doesNotThrow(() => readIgnoreEntries(ignoreText));
});

test('TC-SEC-28: no accepted image finding expires within 14 days; re-triage and extend it before then', () => {
  const WARNING_DAYS = 14;
  for (const e of readIgnoreEntries(ignoreText)) {
    const daysLeft = Math.floor((new Date(`${e.expired}T00:00:00Z`).getTime() - Date.now()) / 86400000);
    assert.ok(daysLeft > WARNING_DAYS, `an accepted image finding expires on ${e.expired} (${daysLeft} days): re-triage it (docs/security/security-policy.md)`);
  }
});

// The same reader, on documents written to slip past it. Each of these would be valid YAML that Trivy accepts.
test('TC-SEC-29: the reader refuses entries written to slip past it, and accepts a proper one', () => {
  const entry = (...rest) => ['vulnerabilities:', '  - id: CVE-2026-12345', ...rest].join('\n');
  const GOOD_STATEMENT = '    statement: Not reachable from the application and no fixed package exists yet.';
  const GOOD_DATE = '    expired_at: 2027-01-31';
  assert.equal(readIgnoreEntries(entry(GOOD_DATE, GOOD_STATEMENT)).length, 1);
  assert.deepEqual(readIgnoreEntries('# a comment\nvulnerabilities: []\n'), []);
  for (const bad of [
    'vulnerabilities: [{id: CVE-2026-12345}]',
    'vulnerabilities:\n  - {id: CVE-2026-12345, statement: x}',
    'misconfigurations:\n  - id: CVE-2026-12345',
    'vulnerabilities: []\n  - id: CVE-2026-12345',
    entry(GOOD_DATE),
    entry(GOOD_STATEMENT),
    entry('    expired_at: never', GOOD_STATEMENT),
    entry(GOOD_DATE, '    statement: too short'),
    entry(GOOD_DATE, '    statement: # a long comment that is not a value, so Trivy sees no statement at all'),
    entry(GOOD_DATE, '    statement: x # the text after the hash is only a comment, however long it is made'),
    entry(GOOD_DATE, GOOD_STATEMENT, GOOD_DATE),
    entry(GOOD_DATE, GOOD_STATEMENT, GOOD_STATEMENT),
  ]) assert.throws(() => readIgnoreEntries(bad), Error, bad);
});
