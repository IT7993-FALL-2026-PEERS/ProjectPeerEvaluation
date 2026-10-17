#!/usr/bin/env node
// Deploys one staging service on Render from cd.yml (backlog CICD-12) and waits until it is live.
//
//   SERVICE=backend|frontend SHA=<commit> HOOK_URL=<deploy hook> DEPLOY_MODE=source|image
//     [IMAGE_REF=<image>@sha256:<digest>] [FORCE=true | ROLLBACK=true] node scripts/render-deploy.js
//
//   HOOK_URL     the service's Render deploy hook (a secret: never printed)
//   DEPLOY_MODE  source: Render builds the commit (the hook gets ref=<sha>). image: Render runs the
//                Docker image CI built and pushed (the hook gets imgURL=<image>@sha256:<digest>, CICD-73).
//                Required and exact: anything else, or a missing value, fails before any request, so a
//                typo can never fall back to a different kind of deploy. Only the backend has an image
//   IMAGE_REF    image mode only: ghcr.io/<path>@sha256:<64 hex digit digest>. The artifact is the digest,
//                not a tag; the health check still waits for SHA, which the image reports (it carries it)
//   FORCE     deploy even when no file the service uses changed. Never deploys an older commit
//             than the live one
//   ROLLBACK  deploy SHA even when it is older than the live commit: going back is the point. Only
//             cd.yml's rollback job sets it
//
// Render's autoDeployTrigger is off in render.yaml, so Render's own buildFilter no longer applies.
// This script does that job instead, because build minutes are limited (500/month): it asks the
// service which commit is live and deploys only when a file the service uses changed since then.
// The live commit comes from /api/health (backend) and /version.txt (frontend, written at build).
//
// In image mode every run deploys the artifact it just built, so the changed-files filter does not apply:
// the deploy is skipped only when the live commit is already SHA or is newer. (The health check reports
// the same commit for a source build and an image build, so FORCE cannot move a service from one to the
// other; switching the service over is done in the Render dashboard.)
//
// Exit codes: 0 deployed or nothing to deploy, 1 the deploy failed or did not go live in time,
// 2 missing settings.
const { execFileSync } = require('node:child_process');

// What each service is built from. These replace the buildFilter blocks that render.yaml had.
const SERVICES = {
  backend: {
    versionUrl: 'https://peers-backend-staging.onrender.com/api/health',
    paths: ['src/backend/**'],
    ignoredPaths: ['src/backend/tests/**', 'src/backend/integration/**', 'src/backend/.env.example', '**/*.md'],
  },
  frontend: {
    versionUrl: 'https://peers-frontend-staging.onrender.com/version.txt',
    paths: ['index.html', 'vite.config.mjs', 'src/index.jsx', 'src/frontend/**', 'public/**', 'package.json', 'package-lock.json'],
    ignoredPaths: ['src/frontend/**/__tests__/**', '**/*.test.js', '**/*.test.jsx', '**/*.md'],
  },
};

const SHA_RE = /^[0-9a-f]{40}$/;
// A registry path in lower case, no tag, then the digest: what `imgURL` is allowed to carry.
const IMAGE_REF_RE = /^ghcr\.io\/[a-z0-9][a-z0-9._-]*(?:\/[a-z0-9][a-z0-9._-]*)+@sha256:[0-9a-f]{64}$/;
const MODES = ['source', 'image'];

// Glob to RegExp for the patterns above: `**/` any directories, `**` anything, `*` one path segment.
function globToRegExp(glob) {
  let source = '';
  for (let i = 0; i < glob.length; i += 1) {
    if (glob.startsWith('**/', i)) { source += '(?:.*/)?'; i += 2; }
    else if (glob.startsWith('**', i)) { source += '.*'; i += 1; }
    else if (glob[i] === '*') source += '[^/]*';
    else source += glob[i].replace(/[.+?^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${source}$`);
}

function matchesService(file, service) {
  const any = (globs) => globs.some((glob) => globToRegExp(glob).test(file));
  return any(service.paths) && !any(service.ignoredPaths);
}

// Reads the live commit from the service's version URL. Null when it can't be read (first deploy,
// service asleep or down): the caller then deploys, which is the safe choice.
async function liveCommit(url, fetchImpl = fetch) {
  try {
    const response = await fetchImpl(`${url}?t=${Date.now()}`, { signal: AbortSignal.timeout(15000), cache: 'no-store' });
    if (!response.ok) return null;
    const body = (await response.text()).trim();
    let commit = body;
    if (body.startsWith('{')) commit = JSON.parse(body).commit || '';
    return SHA_RE.test(commit) ? commit : null;
  } catch {
    return null;
  }
}

const git = (...args) => execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });

// Decides whether to deploy `sha`, given the live commit. Returns { deploy, reason }.
function plan({ sha, live, service, force, rollback, image, gitImpl = git }) {
  if (live === sha) return { deploy: false, reason: `${sha.slice(0, 7)} is already live` };
  if (rollback) return { deploy: true, reason: `rolling back from ${live ? live.slice(0, 7) : 'an unknown commit'}` };
  if (!live) return { deploy: true, reason: 'the live commit is unknown' };
  try {
    // A newer commit already live means this run is late (runs can finish out of order): don't go
    // back. FORCE doesn't override this; going back is ROLLBACK's job.
    gitImpl('merge-base', '--is-ancestor', sha, live);
    return { deploy: false, reason: `the live commit ${live.slice(0, 7)} is newer than ${sha.slice(0, 7)}${force ? ' (FORCE never goes back; use rollback_to)' : ''}` };
  } catch { /* sha is not an ancestor of live: carry on */ }
  if (force) return { deploy: true, reason: 'forced' };
  if (image) return { deploy: true, reason: "image mode: this run's artifact" };
  let files;
  try {
    files = gitImpl('diff', '--name-only', live, sha).split('\n').filter(Boolean);
  } catch {
    return { deploy: true, reason: `the live commit ${live.slice(0, 7)} is not in this repository's history` };
  }
  const changed = files.filter((file) => matchesService(file, service));
  if (changed.length === 0) return { deploy: false, reason: `no file this service uses changed since ${live.slice(0, 7)}` };
  return { deploy: true, reason: `${changed.length} changed file(s), e.g. ${changed.slice(0, 3).join(', ')}` };
}

// Triggers the hook for this exact commit, then polls until the service reports it.
async function deploy({ hookUrl, sha, versionUrl, image, fetchImpl = fetch, timeoutMs = 20 * 60000, intervalMs = 20000, sleep = (ms) => new Promise((r) => setTimeout(r, ms)), now = Date.now }) {
  const url = new URL(hookUrl);
  // One or the other, never both: an image deploy has no git ref, a source deploy has no image.
  if (image) url.searchParams.set('imgURL', image);
  else url.searchParams.set('ref', sha);
  // Never echo the hook URL, the response body or a network error's details: the URL is the secret.
  let response;
  try {
    response = await fetchImpl(url, { method: 'POST', signal: AbortSignal.timeout(30000) });
  } catch (error) {
    return { live: false, detail: `could not reach Render's deploy hook (${error?.name || 'error'})` };
  }
  if (!response.ok) return { live: false, detail: `Render refused the deploy hook (HTTP ${response.status})` };
  const deadline = now() + timeoutMs;
  let last = null;
  while (now() < deadline) {
    await sleep(intervalMs);
    last = await liveCommit(versionUrl, fetchImpl);
    if (last === sha) return { live: true, detail: `${sha.slice(0, 7)} is live` };
  }
  return { live: false, detail: `${sha.slice(0, 7)} was not live after ${Math.round(timeoutMs / 60000)} minutes (live: ${last ? last.slice(0, 7) : 'unknown'})` };
}

function isHttpsUrl(value) {
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

// The command line's last line of defence: an unexpected error can carry the hook URL (a bad URL's error
// holds its input), so only its type is printed.
function failureMessage(error) {
  return `Render deploy: failed with an unexpected ${error?.name || 'error'}. Details are left out because they can contain the deploy hook URL.`;
}

async function main(env, deps = {}) {
  const service = SERVICES[env.SERVICE];
  if (!service || !SHA_RE.test(env.SHA || '') || !env.HOOK_URL) {
    console.error('Render deploy: set SERVICE (backend or frontend), SHA (full commit) and HOOK_URL.');
    return 2;
  }
  if (!isHttpsUrl(env.HOOK_URL)) {
    console.error('Render deploy: HOOK_URL is not a valid https URL. Check the deploy hook secret in the staging environment.');
    return 2;
  }
  // Fail closed, before anything is read or sent: a missing or misspelled mode must not pick a deploy kind.
  const mode = env.DEPLOY_MODE;
  if (!MODES.includes(mode)) {
    console.error('Render deploy: set DEPLOY_MODE to exactly "source" or "image".');
    return 2;
  }
  if (mode === 'image' && env.SERVICE !== 'backend') {
    console.error('Render deploy: only the backend runs as an image; the frontend is a static site.');
    return 2;
  }
  if (mode === 'image' ? !IMAGE_REF_RE.test(env.IMAGE_REF || '') : Boolean(env.IMAGE_REF)) {
    console.error(mode === 'image'
      ? 'Render deploy: IMAGE_REF must be ghcr.io/<lower-case path>@sha256:<64 hex digits> in image mode.'
      : 'Render deploy: IMAGE_REF is only for image mode.');
    return 2;
  }
  const image = mode === 'image' ? env.IMAGE_REF : undefined;
  const live = await liveCommit(service.versionUrl, deps.fetchImpl);
  const decision = plan({ sha: env.SHA, live, service, force: env.FORCE === 'true', rollback: env.ROLLBACK === 'true', image, gitImpl: deps.gitImpl });
  console.log(`${env.SERVICE}: ${decision.deploy ? 'deploying' : 'skipping'}, ${decision.reason}.`);
  if (!decision.deploy) return 0;
  const result = await deploy({ hookUrl: env.HOOK_URL, sha: env.SHA, versionUrl: service.versionUrl, image, ...deps });
  console.log(`${env.SERVICE}: ${result.detail}.`);
  return result.live ? 0 : 1;
}

module.exports = { SERVICES, IMAGE_REF_RE, globToRegExp, matchesService, liveCommit, plan, deploy, failureMessage, main };

if (require.main === module) {
  main(process.env).then(
    (code) => { process.exitCode = code; },
    (error) => { console.error(failureMessage(error)); process.exitCode = 1; },
  );
}
