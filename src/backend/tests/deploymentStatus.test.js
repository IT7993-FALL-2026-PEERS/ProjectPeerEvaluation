const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { probeHealth, describe, buildStatus, formatMarkdown, main } = require('../../../scripts/deployment-status');

// The deployment status section (CICD-29) of every CD run: what was deployed, where, and whether
// the app answered afterwards.
const reply = (status, body) => async () => ({ ok: status >= 200 && status < 300, status, text: async () => body });
const fast = { attempts: 3, delayMs: 0, sleep: async () => {} };

test('TC-29-40: a healthy answer with the database connected is healthy', async () => {
  const result = await probeHealth('https://x/api/health', { ...fast, fetchImpl: reply(200, '{"status":"OK"}') });
  assert.equal(result.healthy, true);
});

test('TC-29-41: a 503 is retried and then reported as unhealthy', async () => {
  let calls = 0;
  const fetchImpl = async () => { calls += 1; return reply(503, '{"status":"DOWN"}')(); };
  const result = await probeHealth('https://x/api/health', { ...fast, fetchImpl });
  assert.equal(result.healthy, false);
  assert.equal(calls, 3);
  assert.match(result.detail, /HTTP 503 after 3 attempts/);
});

test('TC-29-42: a 200 whose body does not say OK is not healthy', async () => {
  const result = await probeHealth('https://x/api/health', { ...fast, fetchImpl: reply(200, '<html>Render is waking up</html>') });
  assert.equal(result.healthy, false);
  assert.match(result.detail, /did not report status OK/);
});

test('TC-29-43: a server that is not answering is unhealthy, and it recovers if a later attempt works', async () => {
  const down = async () => { throw new Error('ECONNREFUSED'); };
  assert.match((await probeHealth('u', { ...fast, fetchImpl: down })).detail, /ECONNREFUSED/);
  let n = 0;
  const flaky = async () => { n += 1; if (n < 2) throw new Error('cold start'); return reply(200, '{"status":"OK"}')(); };
  assert.equal((await probeHealth('u', { ...fast, fetchImpl: flaky })).healthy, true);
});

test('TC-29-44: the status words follow the deploy result and the health check', () => {
  assert.equal(describe('success', { healthy: true }), 'Deployed and healthy');
  assert.equal(describe('success', { healthy: false }), 'Deployed, health check failed');
  assert.equal(describe('success', null), 'Deployed (health not checked)');
  assert.equal(describe('failure', null), 'Failed');
  assert.equal(describe('skipped', null), 'Skipped');
  assert.equal(describe('cancelled', null), 'Cancelled');
});

test('TC-29-45: the section lists environment, status, commit and image tag, and leaves out what was not given', () => {
  const status = buildStatus({ ENVIRONMENT: 'staging', RESULT: 'success', COMMIT: 'abc123', IMAGE_TAG: 'abc123' }, { healthy: true, detail: 'HTTP 200' }, new Date('2026-10-03T12:00:00Z'));
  const md = formatMarkdown(status);
  assert.match(md, /\| Environment \| staging \|/);
  assert.match(md, /\| Status \| \*\*Deployed and healthy\*\* \|/);
  assert.match(md, /\| Image tag \| `abc123` \|/);
  assert.match(md, /2026-10-03T12:00:00.000Z/);
  assert.doesNotMatch(md, /\| URL \|/);
});

test('TC-29-46: main writes the summary and JSON file, and exits 1 only when a deploy that succeeded is unhealthy', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'deploy-status-'));
  try {
    const out = path.join(dir, 'nested', 'status.json');
    const summary = path.join(dir, 'summary.md');
    const env = { ENVIRONMENT: 'staging', RESULT: 'success', HEALTH_URL: 'https://x/api/health', GITHUB_STEP_SUMMARY: summary };
    assert.equal(await main(env, out, { ...fast, fetchImpl: reply(200, '{"status":"OK"}') }), 0);
    assert.equal(JSON.parse(fs.readFileSync(out, 'utf8')).status, 'Deployed and healthy');
    assert.match(fs.readFileSync(summary, 'utf8'), /### Deployment status/);
    assert.equal(await main(env, out, { ...fast, fetchImpl: reply(503, '') }), 1);
    // A failed deploy is reported, but the deploy job is what fails the run.
    assert.equal(await main({ ...env, RESULT: 'failure' }, out, fast), 0);
    assert.equal(JSON.parse(fs.readFileSync(out, 'utf8')).health, null);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// GitHub reports `abandoned` when no runner picked up the deploy job (seen on 5 Oct 2026). Before this
// was accepted, the report itself failed with "set ENVIRONMENT and RESULT" and hid what happened.
test('TC-29-48: a deploy job no runner picked up is reported as failed, not as bad settings', async (t) => {
  t.mock.method(console, 'log', () => {});
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'deployment-status-'));
  const file = path.join(dir, 'status.json');
  assert.equal(describe('abandoned', null), 'Failed');
  assert.equal(await main({ ENVIRONMENT: 'staging', RESULT: 'abandoned', HEALTH_URL: 'https://x/api/health' }, file, fast), 0);
  assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).status, 'Failed');
});

test('TC-29-47: missing or unknown settings exit 2', async () => {
  assert.equal(await main({ RESULT: 'success' }, 'x.json', fast), 2);
  assert.equal(await main({ ENVIRONMENT: 'staging', RESULT: 'maybe' }, 'x.json', fast), 2);
});
