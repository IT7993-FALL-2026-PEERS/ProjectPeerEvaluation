const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { tagName, buildRecord, formatMarkdown, previousGood, record, main } = require('../../../scripts/release-record');

// Release candidates in cd.yml (CICD-28): the rc-* tag, the release record, and the previous good
// release that a failed deploy rolls back to.
const A = 'a'.repeat(40);
const B = 'b'.repeat(40);
const C = 'c'.repeat(40);
const WHEN = new Date('2026-11-05T14:32:09Z');
const reply = (status, body) => ({ ok: status >= 200 && status < 300, status, text: async () => body });
const staging = ({ backend = B, frontend = C } = {}) => async (url) => (String(url).includes('/api/health')
  ? reply(200, JSON.stringify({ status: 'OK', commit: backend }))
  : reply(frontend ? 200 : 404, frontend ? `${frontend}\n` : 'Not Found'));
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'release-record-'));

test('the tag is rc-<date>-<time>-<short sha>, in UTC', () => {
  assert.equal(tagName(A, WHEN), 'rc-20261105-1432-aaaaaaa');
  assert.match(tagName(A, WHEN), /^rc-[0-9]{8}-[0-9]{4}-[0-9a-f]{7}$/);
});

test('the record lists both components, the images, the smoke result and the previous release', () => {
  const rec = buildRecord({
    env: { SHA: A, BACKEND_IMAGE: 'ghcr.io/x/backend:a', SMOKE_RESULT: 'passed', PREVIOUS_TAG: 'rc-20261101-0900-bbbbbbb', RUN_URL: 'https://run' },
    backend: B,
    frontend: C,
    date: WHEN,
  });
  assert.equal(rec.tag, 'rc-20261105-1432-aaaaaaa');
  assert.equal(rec.commit, A);
  assert.deepEqual(rec.components.backend, { commit: B, image: 'ghcr.io/x/backend:a' });
  assert.deepEqual(rec.components.frontend, { commit: C, image: null });
  assert.equal(rec.smokeTests, 'passed');
  assert.equal(rec.previousRelease, 'rc-20261101-0900-bbbbbbb');
});

test('the release notes say how to recover, pointing at the previous release', () => {
  const md = formatMarkdown(buildRecord({ env: { SHA: A, PREVIOUS_TAG: 'rc-20261101-0900-bbbbbbb' }, backend: B, frontend: C, date: WHEN }));
  assert.match(md, /## Release candidate rc-20261105-1432-aaaaaaa/);
  assert.match(md, /\| Backend \| `bbbbbbb` \|/);
  assert.match(md, /\| Frontend \| `ccccccc` \|/);
  assert.match(md, /### How to recover/);
  assert.match(md, /rollback_to.*\n?.*rc-20261101-0900-bbbbbbb/);
});

test('the first release says there is nothing older to roll back to', () => {
  const md = formatMarkdown(buildRecord({ env: { SHA: A }, backend: B, frontend: C, date: WHEN }));
  assert.match(md, /first release candidate/);
  assert.match(md, /\*\*Previous release:\*\* none/);
});

test('previousGood reads the commits back from a release record', () => {
  const dir = tmp();
  const file = path.join(dir, 'release-record.json');
  fs.writeFileSync(file, JSON.stringify(buildRecord({ env: { SHA: A }, backend: B, frontend: C, date: WHEN })));
  assert.deepEqual(previousGood(file), { tag: 'rc-20261105-1432-aaaaaaa', backend: B, frontend: C });
});

test('previousGood treats a missing or broken record as no previous release', () => {
  const dir = tmp();
  assert.equal(previousGood(path.join(dir, 'missing.json')), null);
  fs.writeFileSync(path.join(dir, 'bad.json'), '{not json');
  assert.equal(previousGood(path.join(dir, 'bad.json')), null);
  fs.writeFileSync(path.join(dir, 'short.json'), JSON.stringify({ tag: 'rc-x', components: { backend: { commit: 'abc' }, frontend: { commit: C } } }));
  assert.equal(previousGood(path.join(dir, 'short.json')), null);
});

test('record writes the JSON and the notes and prints the tag', async (t) => {
  const log = t.mock.method(console, 'log', () => {});
  const dir = tmp();
  assert.equal(await record({ SHA: A }, dir, { fetchImpl: staging(), date: WHEN }), 0);
  assert.equal(log.mock.calls[0].arguments[0], 'rc-20261105-1432-aaaaaaa');
  const rec = JSON.parse(fs.readFileSync(path.join(dir, 'release-record.json'), 'utf8'));
  assert.equal(rec.components.backend.commit, B);
  assert.equal(rec.components.frontend.commit, C);
  assert.ok(fs.readFileSync(path.join(dir, 'release-record.md'), 'utf8').includes('How to recover'));
});

test('no release when staging cannot say which commit it runs', async (t) => {
  t.mock.method(console, 'error', () => {});
  const dir = tmp();
  assert.equal(await record({ SHA: A }, dir, { fetchImpl: staging({ frontend: null }), date: WHEN }), 1);
  assert.equal(fs.existsSync(path.join(dir, 'release-record.json')), false);
});

test('record refuses a missing commit', async (t) => {
  t.mock.method(console, 'error', () => {});
  assert.equal(await record({ SHA: 'main' }, tmp(), { fetchImpl: staging() }), 2);
});

test('main previous prints empty outputs when there is no earlier release', async (t) => {
  const log = t.mock.method(console, 'log', () => {});
  assert.equal(await main(['previous', ''], {}), 0);
  assert.equal(log.mock.calls[0].arguments[0], 'tag=\nbackend=\nfrontend=');
});

test('main rejects an unknown command', async (t) => {
  t.mock.method(console, 'error', () => {});
  assert.equal(await main(['publish'], {}), 2);
});
