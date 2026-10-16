const test = require('node:test');
const assert = require('node:assert/strict');
const { getHealth } = require('../config/health');

test('connected database (readyState 1) reports OK', () => {
  const h = getHealth({ readyState: 1 });
  assert.equal(h.status, 'OK');
  assert.equal(h.database, 'connected');
});

test('disconnected database (readyState 0) reports DEGRADED', () => {
  const h = getHealth({ readyState: 0 });
  assert.equal(h.status, 'DEGRADED');
  assert.equal(h.database, 'disconnected');
});

test('connecting database (readyState 2) is not treated as healthy', () => {
  const h = getHealth({ readyState: 2 });
  assert.equal(h.status, 'DEGRADED');
});

test('disconnecting database (readyState 3) is not treated as healthy', () => {
  const h = getHealth({ readyState: 3 });
  assert.equal(h.status, 'DEGRADED');
});

test('response includes a timestamp', () => {
  const h = getHealth({ readyState: 1 });
  assert.ok(h.timestamp);
  assert.doesNotThrow(() => new Date(h.timestamp).toISOString());
});

// Render sets RENDER_GIT_COMMIT to the deployed commit. Reporting it lets anyone
// (and later the CD pipeline) confirm exactly which version is live.
test('response includes the deployed commit from RENDER_GIT_COMMIT', () => {
  const h = getHealth({ readyState: 1 }, { RENDER_GIT_COMMIT: '2ddc590abc' });
  assert.equal(h.commit, '2ddc590abc');
});

test('commit is null when not running on Render', () => {
  const h = getHealth({ readyState: 1 }, {});
  assert.equal(h.commit, null);
});

// CICD-73: the Docker image carries the commit it was built from, because Render sets RENDER_GIT_COMMIT
// only for git builds. CD waits for /api/health to report the commit it deployed.
const SHA = 'a'.repeat(40);
const OTHER = 'b'.repeat(40);

test('TC-29-50: an image reports the commit it was built from (GIT_COMMIT)', () => {
  assert.equal(getHealth({ readyState: 1 }, { GIT_COMMIT: SHA }).commit, SHA);
});

test('TC-29-51: the commit baked into an image wins over a Render variable, so a stale setting cannot misreport the artifact', () => {
  assert.equal(getHealth({ readyState: 1 }, { RENDER_GIT_COMMIT: OTHER, GIT_COMMIT: SHA }).commit, SHA);
  assert.equal(getHealth({ readyState: 1 }, { RENDER_GIT_COMMIT: OTHER }).commit, OTHER);
});

test('TC-29-52: with neither variable the commit is null, and an empty GIT_COMMIT (a local build) counts as none', () => {
  assert.equal(getHealth({ readyState: 1 }, {}).commit, null);
  assert.equal(getHealth({ readyState: 1 }, { GIT_COMMIT: '' }).commit, null);
});
