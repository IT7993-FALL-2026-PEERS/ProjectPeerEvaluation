#!/usr/bin/env node
// Deploys one staging service on Render from cd.yml (backlog CICD-12) and waits until it is live.
//
//   SERVICE=backend|frontend SHA=<commit> HOOK_URL=<deploy hook> [FORCE=true] node scripts/render-deploy.js
//
//   HOOK_URL  the service's Render deploy hook (a secret: never printed)
//   FORCE     deploy even when no file the service uses changed
//
// Render's autoDeployTrigger is off in render.yaml, so Render's own buildFilter no longer applies.
// This script does that job instead, because build minutes are limited (500/month): it asks the
// service which commit is live and deploys only when a file the service uses changed since then.
// The live commit comes from /api/health (backend) and /version.txt (frontend, written at build).
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
    paths: ['src/index.js', 'src/frontend/**', 'public/**', 'package.json', 'package-lock.json'],
    ignoredPaths: ['src/frontend/**/__tests__/**', '**/*.test.js', '**/*.md'],
  },
};

const SHA_RE = /^[0-9a-f]{40}$/;

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
function plan({ sha, live, service, force, gitImpl = git }) {
  if (live === sha) return { deploy: false, reason: `${sha.slice(0, 7)} is already live` };
  if (force) return { deploy: true, reason: 'forced' };
  if (!live) return { deploy: true, reason: 'the live commit is unknown' };
  try {
    // A newer commit already live means this run is late (runs can finish out of order): don't go back.
    gitImpl('merge-base', '--is-ancestor', sha, live);
    return { deploy: false, reason: `the live commit ${live.slice(0, 7)} is newer than ${sha.slice(0, 7)}` };
  } catch { /* sha is not an ancestor of live: carry on */ }
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
async function deploy({ hookUrl, sha, versionUrl, fetchImpl = fetch, timeoutMs = 20 * 60000, intervalMs = 20000, sleep = (ms) => new Promise((r) => setTimeout(r, ms)), now = Date.now }) {
  const url = new URL(hookUrl);
  url.searchParams.set('ref', sha);
  const response = await fetchImpl(url, { method: 'POST', signal: AbortSignal.timeout(30000) });
  // Never echo the hook URL or response body: the URL is the secret.
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

async function main(env, deps = {}) {
  const service = SERVICES[env.SERVICE];
  if (!service || !SHA_RE.test(env.SHA || '') || !env.HOOK_URL) {
    console.error('Render deploy: set SERVICE (backend or frontend), SHA (full commit) and HOOK_URL.');
    return 2;
  }
  const live = await liveCommit(service.versionUrl, deps.fetchImpl);
  const decision = plan({ sha: env.SHA, live, service, force: env.FORCE === 'true', gitImpl: deps.gitImpl });
  console.log(`${env.SERVICE}: ${decision.deploy ? 'deploying' : 'skipping'}, ${decision.reason}.`);
  if (!decision.deploy) return 0;
  const result = await deploy({ hookUrl: env.HOOK_URL, sha: env.SHA, versionUrl: service.versionUrl, ...deps });
  console.log(`${env.SERVICE}: ${result.detail}.`);
  return result.live ? 0 : 1;
}

module.exports = { SERVICES, globToRegExp, matchesService, liveCommit, plan, deploy, main };

if (require.main === module) {
  main(process.env).then((code) => { process.exitCode = code; });
}
