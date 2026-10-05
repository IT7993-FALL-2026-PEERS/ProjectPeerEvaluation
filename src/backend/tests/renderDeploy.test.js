const test = require('node:test');
const assert = require('node:assert/strict');
const { SERVICES, globToRegExp, matchesService, liveCommit, plan, deploy, main } = require('../../../scripts/render-deploy');

// The staging deploy step of cd.yml (CICD-12): which merges deploy which service, and when a deploy
// counts as live.
const A = 'a'.repeat(40);
const B = 'b'.repeat(40);
const reply = (status, body) => ({ ok: status >= 200 && status < 300, status, text: async () => body });
const gitDiff = (files) => (cmd) => {
  if (cmd === 'merge-base') throw new Error('not an ancestor');
  return files.join('\n') + '\n';
};

test('globs match the way the old render.yaml buildFilter did', () => {
  assert.ok(globToRegExp('src/backend/**').test('src/backend/controllers/x.js'));
  assert.ok(globToRegExp('**/*.md').test('README.md'));
  assert.ok(globToRegExp('**/*.md').test('src/backend/docs/notes.md'));
  assert.ok(!globToRegExp('src/index.js').test('src/indexXjs'));
  assert.ok(globToRegExp('src/frontend/**/__tests__/**').test('src/frontend/pages/__tests__/Login.test.js'));
});

test('backend code deploys the backend; its tests and docs do not', () => {
  assert.ok(matchesService('src/backend/index.js', SERVICES.backend));
  assert.ok(!matchesService('src/backend/tests/health.test.js', SERVICES.backend));
  assert.ok(!matchesService('src/backend/integration/login.integration.js', SERVICES.backend));
  assert.ok(!matchesService('src/backend/README.md', SERVICES.backend));
  assert.ok(!matchesService('src/frontend/pages/Login.js', SERVICES.backend));
});

test('frontend code and its package files deploy the frontend; tests do not', () => {
  assert.ok(matchesService('src/frontend/pages/Login.js', SERVICES.frontend));
  assert.ok(matchesService('package-lock.json', SERVICES.frontend));
  assert.ok(!matchesService('src/frontend/pages/__tests__/Login.test.js', SERVICES.frontend));
  assert.ok(!matchesService('src/backend/index.js', SERVICES.frontend));
  assert.ok(!matchesService('.github/workflows/ci.yml', SERVICES.frontend));
});

test('the live commit is read from the health JSON or from version.txt', async () => {
  assert.equal(await liveCommit('https://x/api/health', async () => reply(200, `{"status":"OK","commit":"${A}"}`)), A);
  assert.equal(await liveCommit('https://x/version.txt', async () => reply(200, `${A}\n`)), A);
});

test('an unreadable live commit is null, so the service gets deployed', async () => {
  assert.equal(await liveCommit('https://x', async () => reply(404, 'Not Found')), null);
  assert.equal(await liveCommit('https://x', async () => reply(200, '<!doctype html>')), null);
  assert.equal(await liveCommit('https://x', async () => reply(200, '{"commit":null}')), null);
  assert.equal(await liveCommit('https://x', async () => { throw new Error('ECONNRESET'); }), null);
});

test('plan: the same commit already live is skipped, even when forced', () => {
  assert.equal(plan({ sha: A, live: A, service: SERVICES.backend, force: true }).deploy, false);
});

test('plan: unknown live commit or FORCE deploys', () => {
  assert.equal(plan({ sha: A, live: null, service: SERVICES.backend }).deploy, true);
  assert.equal(plan({ sha: A, live: B, service: SERVICES.backend, force: true, gitImpl: gitDiff([]) }).deploy, true);
});

test('plan: deploys only when a file the service uses changed', () => {
  const docsOnly = plan({ sha: A, live: B, service: SERVICES.backend, gitImpl: gitDiff(['docs/cd-pipeline.md', 'src/backend/tests/x.test.js']) });
  assert.equal(docsOnly.deploy, false);
  assert.match(docsOnly.reason, /no file this service uses changed/);
  const code = plan({ sha: A, live: B, service: SERVICES.backend, gitImpl: gitDiff(['src/backend/index.js']) });
  assert.equal(code.deploy, true);
  assert.match(code.reason, /src\/backend\/index\.js/);
});

test('plan: a late run never rolls back a newer live commit', () => {
  const result = plan({ sha: A, live: B, service: SERVICES.backend, gitImpl: () => '' });
  assert.equal(result.deploy, false);
  assert.match(result.reason, /newer/);
});

// Khoa's review of #146: FORCE redeploys, but only ROLLBACK may go back to an older commit.
test('plan: FORCE never deploys an older commit than the live one', () => {
  const result = plan({ sha: A, live: B, service: SERVICES.backend, force: true, gitImpl: () => '' });
  assert.equal(result.deploy, false);
  assert.match(result.reason, /FORCE never goes back; use rollback_to/);
});

test('plan: ROLLBACK deploys an older commit, but not one that is already live', () => {
  const back = plan({ sha: A, live: B, service: SERVICES.backend, rollback: true, gitImpl: () => '' });
  assert.equal(back.deploy, true);
  assert.match(back.reason, /rolling back from bbbbbbb/);
  assert.equal(plan({ sha: A, live: A, service: SERVICES.backend, rollback: true }).deploy, false);
  assert.equal(plan({ sha: A, live: null, service: SERVICES.backend, rollback: true }).deploy, true);
});

test('plan: a live commit missing from history deploys', () => {
  const gitImpl = () => { throw new Error('bad object'); };
  assert.equal(plan({ sha: A, live: B, service: SERVICES.backend, gitImpl }).deploy, true);
});

test('deploy asks Render for the exact commit and waits until it is live', async () => {
  const calls = [];
  let polls = 0;
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url: String(url), method: options.method || 'GET' });
    if (options.method === 'POST') return reply(200, '{"deploy":{"id":"dep-1"}}');
    polls += 1;
    return reply(200, polls < 3 ? `{"commit":"${B}"}` : `{"commit":"${A}"}`);
  };
  const result = await deploy({ hookUrl: 'https://api.render.com/deploy/srv-1?key=secret', sha: A, versionUrl: 'https://x/api/health', fetchImpl, intervalMs: 0, sleep: async () => {} });
  assert.equal(result.live, true);
  const hook = new URL(calls[0].url);
  assert.equal(calls[0].method, 'POST');
  assert.equal(hook.searchParams.get('key'), 'secret');
  assert.equal(hook.searchParams.get('ref'), A);
  assert.equal(polls, 3);
});

test('deploy fails without printing the hook when Render refuses it', async () => {
  const result = await deploy({ hookUrl: 'https://api.render.com/deploy/srv-1?key=secret', sha: A, versionUrl: 'https://x', fetchImpl: async () => reply(401, 'bad key'), sleep: async () => {} });
  assert.equal(result.live, false);
  assert.match(result.detail, /HTTP 401/);
  assert.doesNotMatch(result.detail, /secret|srv-1/);
});

test('deploy gives up when the commit never goes live', async () => {
  let clock = 0;
  const fetchImpl = async (_url, options = {}) => (options.method === 'POST' ? reply(200, '') : reply(200, `{"commit":"${B}"}`));
  const result = await deploy({ hookUrl: 'https://h/?key=k', sha: A, versionUrl: 'https://x', fetchImpl, timeoutMs: 60000, intervalMs: 20000, sleep: async (ms) => { clock += ms; }, now: () => clock });
  assert.equal(result.live, false);
  assert.match(result.detail, /not live after 1 minutes \(live: bbbbbbb\)/);
});

test('main refuses to run without its settings', async (t) => {
  const quiet = t.mock.method(console, 'error', () => {});
  assert.equal(await main({ SERVICE: 'database', SHA: A, HOOK_URL: 'https://h' }), 2);
  assert.equal(await main({ SERVICE: 'backend', SHA: 'main', HOOK_URL: 'https://h' }), 2);
  assert.equal(await main({ SERVICE: 'backend', SHA: A }), 2);
  quiet.mock.restore();
});

test('main skips a service whose files did not change', async (t) => {
  const log = t.mock.method(console, 'log', () => {});
  const fetchImpl = async (_url, options = {}) => {
    if (options.method === 'POST') throw new Error('must not deploy');
    return reply(200, `{"commit":"${B}"}`);
  };
  assert.equal(await main({ SERVICE: 'backend', SHA: A, HOOK_URL: 'https://h/?key=k' }, { fetchImpl, gitImpl: gitDiff(['README.md']) }), 0);
  assert.match(log.mock.calls[0].arguments[0], /backend: skipping/);
  log.mock.restore();
});
