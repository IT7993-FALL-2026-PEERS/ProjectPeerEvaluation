#!/usr/bin/env node
// Creates the rc-* GitHub release for cd.yml's release job, and survives a brief GitHub API error (#279).
//
//   TAG=rc-<yyyymmdd>-<hhmm>-<sha7> SHA=<full commit> GITHUB_REPOSITORY=<owner>/<repo> GH_TOKEN=... \
//     node scripts/create-release.js
//
// Reads release/release-record.md (the notes) and release/release-record.json (the asset `prepare` reads
// to find a rollback target), both written by scripts/release-record.js.
//
// On 12 Nov 2026 two CD runs lost their release to a transient "HTTP 403: Resource not accessible by
// integration". So a failed attempt is tried again after a pause, up to ATTEMPTS times. A failed call can
// still have created the release, so before trying again it looks: a release with its record is done; a
// release without one gets the record uploaded, because a release with no record cannot be rolled back to.
//
// Exit codes: 0 the release exists with its record, 1 it could not be made, 2 missing or unusable settings.
const { spawnSync } = require('node:child_process');

const NOTES = 'release/release-record.md';
const RECORD = 'release/release-record.json';
const TAG_RE = /^rc-\d{8}-\d{4}-[0-9a-f]{7}$/;

const gh = (argv) => spawnSync(argv[0], argv.slice(1), { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });

// null when there is no such release (or it can't be read), otherwise whether its record is attached.
function existing(run, repo, tag) {
  const view = run(['gh', 'release', 'view', tag, '--repo', repo, '--json', 'assets', '--jq', '[.assets[].name] | index("release-record.json") != null']);
  if (view.status !== 0) return null;
  return { hasRecord: view.stdout.trim() === 'true' };
}

async function main(env, { run = gh, sleep = (ms) => new Promise((r) => setTimeout(r, ms)), attempts = 4, delayMs = 45000 } = {}) {
  const { TAG: tag, SHA: sha, GITHUB_REPOSITORY: repo } = env;
  if (!TAG_RE.test(tag || '') || !/^[0-9a-f]{40}$/.test(sha || '') || !/^[\w.-]+\/[\w.-]+$/.test(repo || '')) {
    console.error('Create release: set TAG (rc-<yyyymmdd>-<hhmm>-<sha7>), SHA (full commit) and GITHUB_REPOSITORY.');
    return 2;
  }
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const created = run(['gh', 'release', 'create', tag, '--repo', repo, '--target', sha, '--prerelease',
      '--title', tag, '--notes-file', NOTES, RECORD]);
    if (created.status === 0) {
      console.log(`Create release: ${tag} published.`);
      return 0;
    }
    const there = existing(run, repo, tag);
    if (there && there.hasRecord) {
      console.log(`::notice::${tag} exists with its record although gh reported an error, so it is done.`);
      return 0;
    }
    if (there) {
      const uploaded = run(['gh', 'release', 'upload', tag, RECORD, '--repo', repo, '--clobber']);
      if (uploaded.status === 0) {
        console.log(`::notice::${tag} was created without its record; the record is now attached.`);
        return 0;
      }
    }
    if (attempt < attempts) {
      console.log(`::warning::Could not publish ${tag} (attempt ${attempt} of ${attempts}). Trying again in ${Math.round(delayMs / 1000)} s.`);
      await sleep(delayMs);
    }
  }
  console.log(`::error::Could not publish ${tag} after ${attempts} attempts. Staging runs this commit, but it has no rc-* release. See "Tag release candidate" in docs/operations/rollback-and-recovery.md (R2).`);
  return 1;
}

module.exports = { main, existing, TAG_RE };

if (require.main === module) {
  main(process.env).then((code) => { process.exitCode = code; });
}
