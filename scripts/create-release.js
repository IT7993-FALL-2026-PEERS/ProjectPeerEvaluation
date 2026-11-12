#!/usr/bin/env node
// Creates the rc-* GitHub release for cd.yml's release job, and survives a brief GitHub API error (#279).
//
//   TAG=rc-<yyyymmdd>-<hhmm>-<sha7> SHA=<full commit> GITHUB_REPOSITORY=<owner>/<repo> GH_TOKEN=... \
//     node scripts/create-release.js
//
// Reads release/release-record.md (the notes) and release/release-record.json (the asset `prepare` reads
// to find a rollback target), both written by scripts/release-record.js.
//
// GitHub refuses ("HTTP 403: Resource not accessible by integration") to let the Actions token create a tag
// on a commit whose workflow files differ from main's: that counts as changing workflows, which needs the
// `workflows` permission GITHUB_TOKEN cannot have (#286). It happens when main moved on during the run with a
// change under .github/workflows/. The CD run for that newer commit is already queued and tags its own
// commit, so this one stands down, as `prepare` does for a stale run: no tag, exit 0, a warning.
//
// Any other failure is tried again after a pause, up to four attempts. A failed call can still have created
// the release, so before trying again it looks: a release with its record is done; a release without one
// gets the record uploaded, because a release with no record cannot be rolled back to.
//
// Exit codes: 0 the release exists with its record, or main overtook this commit with a workflow change;
// 1 it could not be made; 2 missing or unusable settings.
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

// The newer main commit, when main is ahead of `sha` and changed a workflow file since; otherwise null
// (also when the comparison can't be read: then the attempt is made and its error decides).
function overtakenBy(run, repo, sha) {
  const compared = run(['gh', 'api', `repos/${repo}/compare/${sha}...main`, '--jq',
    'if .status == "ahead" and ([.files[]?.filename | select(startswith(".github/workflows/"))] | length) > 0 then (.commits | last | .sha) else "" end']);
  const newer = compared.status === 0 ? compared.stdout.trim() : '';
  return /^[0-9a-f]{40}$/.test(newer) ? newer : null;
}

function standDown(tag, newer) {
  console.log(`::warning::No ${tag}: main has moved on to ${newer.slice(0, 7)}, which changes workflow files, and GitHub does not let the Actions token tag a commit whose workflows differ from main's. The CD run for ${newer.slice(0, 7)} tags its own commit.`);
  return 0;
}

async function main(env, { run = gh, sleep = (ms) => new Promise((r) => setTimeout(r, ms)), attempts = 4, delayMs = 45000 } = {}) {
  const { TAG: tag, SHA: sha, GITHUB_REPOSITORY: repo } = env;
  if (!TAG_RE.test(tag || '') || !/^[0-9a-f]{40}$/.test(sha || '') || !/^[\w.-]+\/[\w.-]+$/.test(repo || '')) {
    console.error('Create release: set TAG (rc-<yyyymmdd>-<hhmm>-<sha7>), SHA (full commit) and GITHUB_REPOSITORY.');
    return 2;
  }
  const ahead = overtakenBy(run, repo, sha);
  if (ahead) return standDown(tag, ahead);
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
    // main can move on while this step runs.
    const overtaken = overtakenBy(run, repo, sha);
    if (overtaken) return standDown(tag, overtaken);
    if (attempt < attempts) {
      console.log(`::warning::Could not publish ${tag} (attempt ${attempt} of ${attempts}). Trying again in ${Math.round(delayMs / 1000)} s.`);
      await sleep(delayMs);
    }
  }
  console.log(`::error::Could not publish ${tag} after ${attempts} attempts. Staging runs this commit, but it has no rc-* release. See "Tag release candidate" in docs/operations/rollback-and-recovery.md (R2).`);
  return 1;
}

module.exports = { main, existing, overtakenBy, TAG_RE };

if (require.main === module) {
  main(process.env).then((code) => { process.exitCode = code; });
}
