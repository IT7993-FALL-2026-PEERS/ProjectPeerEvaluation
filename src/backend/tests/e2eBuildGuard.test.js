const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { hostedApiUrlsInBuild, LEGACY_API_URL } = require('../../../e2e/server/build-guard');

// The E2E frontend server refuses a build that would send its requests to a hosted backend.
// These tests build tiny fake bundles in a temp folder.
function fakeBuild(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'build-guard-'));
  for (const [name, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
    fs.writeFileSync(path.join(dir, name), text);
  }
  return dir;
}

test('a build that contains a hosted backend URL is reported', () => {
  const dir = fakeBuild({ 'assets/index-abc.js': 'const a="https://peers-backend-staging.onrender.com/api";' });
  assert.deepEqual(hostedApiUrlsInBuild(dir), ['https://peers-backend-staging.onrender.com/api']);
});

test('the legacy fallback URL is an inert literal in apiUrl.js and is not reported', () => {
  const dir = fakeBuild({ 'assets/index-abc.js': `const a="${LEGACY_API_URL}";` });
  assert.deepEqual(hostedApiUrlsInBuild(dir), []);
});

test('a build with no hosted URL passes', () => {
  const dir = fakeBuild({ 'assets/index-abc.js': 'const a="http://localhost:5000/api";' });
  assert.deepEqual(hostedApiUrlsInBuild(dir), []);
});

test('it fails closed: no bundle to scan is an error, not a pass', () => {
  assert.throws(() => hostedApiUrlsInBuild(fakeBuild({ 'index.html': '<html></html>' })), /no JavaScript/i);
  assert.throws(() => hostedApiUrlsInBuild(fakeBuild({ 'assets/index-abc.css': 'a{}' })), /no JavaScript/i);
});

test('it fails closed when the bundle moves: the old Create React App folder is not scanned silently', () => {
  const dir = fakeBuild({ 'static/js/main.abc.js': 'const a="https://peers-backend-staging.onrender.com/api";' });
  assert.throws(() => hostedApiUrlsInBuild(dir), /no JavaScript/i);
});
