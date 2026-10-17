const test = require('node:test');
const assert = require('node:assert/strict');
const { pointerCommand } = require('../../../scripts/staging-pointer');

// The `staging` pointer tag (CICD-73): Render's configured image is `backend:staging`, and CD moves
// that one tag to the digest that passed the smoke tests. It is the only tag CD ever moves.
const REF = `ghcr.io/o/r/backend@sha256:${'d'.repeat(64)}`;

test('TC-29-61: the pointer moves only to a digest that passed smoke, with a fixed tag name', () => {
  assert.deepEqual(pointerCommand({ ref: REF, smokePassed: true }), ['docker', 'buildx', 'imagetools', 'create', '-t', 'ghcr.io/o/r/backend:staging', REF]);
});

test('TC-29-62: it refuses to move before smoke passed, for a tag reference, and for a path outside ghcr.io', () => {
  assert.throws(() => pointerCommand({ ref: REF, smokePassed: false }), /smoke/);
  assert.throws(() => pointerCommand({ ref: 'ghcr.io/o/r/backend:latest', smokePassed: true }), /digest/);
  assert.throws(() => pointerCommand({ ref: `docker.io/o/r@sha256:${'d'.repeat(64)}`, smokePassed: true }), /ghcr\.io/);
});

test('TC-29-63: the only tag it can ever write is staging', () => {
  const command = pointerCommand({ ref: REF, smokePassed: true });
  assert.equal(command[command.indexOf('-t') + 1].endsWith(':staging'), true);
  assert.equal(command.some((part) => /:latest/.test(part)), false);
});

test('TC-29-72: it refuses a path that is not the backend image, so the pointer cannot be aimed at the frontend', () => {
  assert.throws(() => pointerCommand({ ref: `ghcr.io/o/r/frontend@sha256:${'d'.repeat(64)}`, smokePassed: true }), /backend/);
});

const { main } = require('../../../scripts/staging-pointer');

const SHA = 'e'.repeat(40);
const reply = (status, body) => ({ ok: status >= 200 && status < 300, status, text: async () => body });
const env = { IMAGE_REF: REF, SMOKE_PASSED: 'true', SHA, HEALTH_URL: 'https://x/api/health' };

test('TC-29-64: the pointer moves only when staging reports the image\'s own commit', async (t) => {
  t.mock.method(console, 'log', () => {});
  const ran = [];
  const run = (argv) => { ran.push(argv); return { status: 0 }; };
  assert.equal(await main(env, { run, fetchImpl: async () => reply(200, `{"commit":"${SHA}"}`) }), 0);
  assert.equal(ran.length, 1);
  assert.equal(await main(env, { run, fetchImpl: async () => reply(200, `{"commit":"${'f'.repeat(40)}"}`) }), 0, 'a newer commit is live: leave the pointer alone');
  assert.equal(ran.length, 1);
});

test('TC-29-73: staging that cannot say which commit it runs is a failure, not a quiet skip (release waits for the pointer)', async (t) => {
  t.mock.method(console, 'log', () => {});
  const err = t.mock.method(console, 'error', () => {});
  let ran = 0;
  const run = () => { ran += 1; return { status: 0 }; };
  assert.equal(await main(env, { run, fetchImpl: async () => reply(503, '') }), 1);
  assert.equal(await main(env, { run, fetchImpl: async () => { throw new Error('ECONNRESET'); } }), 1);
  assert.equal(ran, 0);
  assert.match(err.mock.calls[0].arguments[0], /could not read/i);
});

test('TC-29-65: a failed move fails the run and says the configured image is behind; bad settings are refused without running anything', async (t) => {
  t.mock.method(console, 'log', () => {});
  const err = t.mock.method(console, 'error', () => {});
  const fetchImpl = async () => reply(200, `{"commit":"${SHA}"}`);
  assert.equal(await main(env, { run: () => ({ status: 1 }), fetchImpl }), 1);
  assert.match(err.mock.calls[0].arguments[0], /behind/);
  let ran = 0;
  const run = () => { ran += 1; return { status: 0 }; };
  assert.equal(await main({ ...env, SMOKE_PASSED: 'false' }, { run, fetchImpl }), 2);
  assert.equal(await main({ ...env, SHA: 'main' }, { run, fetchImpl }), 2);
  assert.equal(await main({ ...env, HEALTH_URL: '' }, { run, fetchImpl }), 2);
  assert.equal(ran, 0);
});

const fs = require('node:fs');
const path = require('node:path');

test('TC-29-74: cd.yml publishes no release unless the pointer job succeeded (or was skipped on purpose in source mode)', () => {
  const workflow = fs.readFileSync(path.join(__dirname, '..', '..', '..', '.github', 'workflows', 'cd.yml'), 'utf8').replace(/\r\n/g, '\n');
  const release = workflow.slice(workflow.indexOf('\n  release:\n'), workflow.indexOf('\n  rollback:\n'));
  assert.match(release, /needs: \[[^\]]*\bpointer\b[^\]]*\]/);
  assert.match(release, /needs\.pointer\.result == 'success'/);
  assert.match(release, /backend_mode != 'image' && needs\.pointer\.result == 'skipped'/);
});
