const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { main } = require('../../../scripts/create-release');

// The rc-* release survives a brief GitHub API error (#279): on 12 Nov 2026 two CD runs lost their
// release to a transient 403, although deploy and smoke had passed.
const TAG = 'rc-20261112-0249-3a8bec4';
const SHA = '3a8bec4b8ecdc098b65d7aae4ca8afaebeafa530';
const env = { TAG, SHA, GITHUB_REPOSITORY: 'o/r' };
const quiet = (t) => { t.mock.method(console, 'log', () => {}); t.mock.method(console, 'error', () => {}); };

// A scripted gh: `create`, `view` and `compare` are lists of answers, one per call (the last one repeats).
// `compare` is what the main-moved-on check prints: '' (not overtaken) or the newer main commit.
function fakeGh({ create = [0], view = [{ status: 1 }], upload = 0, compare = [''] }) {
  const ran = [];
  const next = (list, i) => list[Math.min(i, list.length - 1)];
  let creates = 0;
  let views = 0;
  let compares = 0;
  const run = (argv) => {
    ran.push(argv);
    if (argv[1] === 'api') return { status: 0, stdout: `${next(compare, compares++)}\n` };
    const verb = argv[2];
    if (verb === 'create') return { status: next(create, creates++), stdout: '' };
    if (verb === 'view') return { stdout: '', ...next(view, views++) };
    if (verb === 'upload') return { status: upload, stdout: '' };
    throw new Error(`unexpected gh call: ${argv.join(' ')}`);
  };
  return { run, ran };
}
const noWait = { sleep: async () => {}, delayMs: 0 };

test('TC-29-93: the release is created once, as a pre-release of the commit with the record attached', async (t) => {
  quiet(t);
  const gh = fakeGh({});
  assert.equal(await main(env, { ...gh, ...noWait }), 0);
  assert.equal(gh.ran.length, 2);
  assert.deepEqual(gh.ran[0].slice(0, 3), ['gh', 'api', `repos/o/r/compare/${SHA}...main`]);
  assert.deepEqual(gh.ran[1], ['gh', 'release', 'create', TAG, '--repo', 'o/r', '--target', SHA, '--prerelease',
    '--title', TAG, '--notes-file', 'release/release-record.md', 'release/release-record.json']);
});

test('TC-29-94: a failed attempt is tried again after a pause, and gives up with exit 1 after four', async (t) => {
  quiet(t);
  const waits = [];
  const recovers = fakeGh({ create: [1, 1, 0] });
  assert.equal(await main(env, { run: recovers.run, sleep: async (ms) => waits.push(ms), delayMs: 45000 }), 0);
  assert.deepEqual(waits, [45000, 45000]);

  const never = fakeGh({ create: [1] });
  assert.equal(await main(env, { ...never, ...noWait }), 1);
  assert.equal(never.ran.filter((argv) => argv[2] === 'create').length, 4);
});

test('TC-29-95: a release made despite the error is kept; one without its record gets the record, never a second release', async (t) => {
  quiet(t);
  const complete = fakeGh({ create: [1], view: [{ status: 0, stdout: 'true\n' }] });
  assert.equal(await main(env, { ...complete, ...noWait }), 0);
  assert.equal(complete.ran.filter((argv) => argv[2] === 'create').length, 1);

  const noRecord = fakeGh({ create: [1], view: [{ status: 0, stdout: 'false\n' }] });
  assert.equal(await main(env, { ...noRecord, ...noWait }), 0);
  assert.deepEqual(noRecord.ran.at(-1), ['gh', 'release', 'upload', TAG, 'release/release-record.json', '--repo', 'o/r', '--clobber']);
  assert.equal(noRecord.ran.filter((argv) => argv[2] === 'create').length, 1);
});

test('TC-29-96: bad settings exit 2 without calling gh, and cd.yml publishes the release through this script', async (t) => {
  quiet(t);
  for (const bad of [{ TAG: 'v1.0' }, { SHA: '3a8bec4' }, { GITHUB_REPOSITORY: '' }]) {
    const gh = fakeGh({});
    assert.equal(await main({ ...env, ...bad }, { ...gh, ...noWait }), 2);
    assert.equal(gh.ran.length, 0);
  }
  const cd = fs.readFileSync(path.join(__dirname, '../../../.github/workflows/cd.yml'), 'utf8');
  assert.match(cd, /- name: Create the rc tag and release\n {8}run: node scripts\/create-release\.js\n/);
  assert.doesNotMatch(cd, /gh release create/);
});

// #286: the 403 is GitHub refusing the Actions token a tag on a commit whose workflows differ from main's.
const NEWER = '670e05a1aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

test('TC-29-97: when main moved on with a workflow change, the step stands down green without trying to tag', async (t) => {
  const logged = [];
  t.mock.method(console, 'log', (line) => logged.push(line));
  const gh = fakeGh({ compare: [NEWER] });
  assert.equal(await main(env, { ...gh, ...noWait }), 0);
  assert.equal(gh.ran.filter((argv) => argv[2] === 'create').length, 0);
  assert.match(logged.join('\n'), /::warning::No rc-20261112-0249-3a8bec4: main has moved on to 670e05a, which changes workflow files/);
});

test('TC-29-98: if main moves on with a workflow change while the step runs, a failed attempt stands down instead of retrying', async (t) => {
  quiet(t);
  const gh = fakeGh({ create: [1], compare: ['', NEWER] });
  assert.equal(await main(env, { ...gh, ...noWait }), 0);
  assert.equal(gh.ran.filter((argv) => argv[2] === 'create').length, 1);
  // Overtaken without a workflow change ('' from the comparison), a failure is still retried and then fails.
  const plain = fakeGh({ create: [1], compare: [''] });
  assert.equal(await main(env, { ...plain, ...noWait }), 1);
});
