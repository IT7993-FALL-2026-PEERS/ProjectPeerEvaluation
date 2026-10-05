#!/usr/bin/env node
// Deployment status (backlog CICD-29). Writes a "Deployment status" section to the job summary and
// a deployment-status.json file for the run's artifacts. Called from cd.yml through
// .github/workflows/deployment-status.yml.
//
//   ENVIRONMENT=staging RESULT=success URL=https://... HEALTH_URL=https://.../api/health \
//   COMMIT=<sha> IMAGE_TAG=<sha> RUN_URL=<run url> node scripts/deployment-status.js [output file]
//
//   RESULT      the deploy job's result: success, failure, cancelled, skipped or abandoned
//   HEALTH_URL  optional; when set and RESULT is success, the app must answer 200 with status OK
//
// Exit codes: 0 reported (including a failed deploy: the deploy job is what fails), 1 the deploy
// succeeded but the health check did not, 2 missing or unusable settings.
const fs = require('node:fs');
const path = require('node:path');

// `abandoned`: GitHub's result for a job no runner ever picked up. It deployed nothing, so it reports as Failed.
const RESULTS = ['success', 'failure', 'cancelled', 'skipped', 'abandoned'];

// One probe of the health URL. fetchImpl and the clock are injectable for the tests.
async function probeHealth(url, { fetchImpl = fetch, attempts = 5, delayMs = 10000, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) } = {}) {
  let last = 'no attempt made';
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetchImpl(url, { signal: AbortSignal.timeout(10000) });
      const body = await response.text();
      if (response.ok && /"status"\s*:\s*"OK"/.test(body)) return { healthy: true, detail: `HTTP ${response.status}, database connected` };
      last = `HTTP ${response.status}${response.ok ? ', body did not report status OK' : ''}`;
    } catch (error) {
      last = `no answer (${error.message})`;
    }
    if (attempt < attempts) await sleep(delayMs);
  }
  return { healthy: false, detail: `${last} after ${attempts} attempts` };
}

function describe(result, health) {
  if (result === 'skipped') return 'Skipped';
  if (result === 'cancelled') return 'Cancelled';
  if (result !== 'success') return 'Failed';
  if (!health) return 'Deployed (health not checked)';
  return health.healthy ? 'Deployed and healthy' : 'Deployed, health check failed';
}

function buildStatus(env, health, now = new Date()) {
  return {
    environment: env.ENVIRONMENT,
    status: describe(env.RESULT, health),
    result: env.RESULT,
    url: env.URL || null,
    commit: env.COMMIT || null,
    imageTag: env.IMAGE_TAG || null,
    health: health ? health.detail : null,
    run: env.RUN_URL || null,
    checkedAt: now.toISOString(),
  };
}

function formatMarkdown(status) {
  const rows = [
    ['Environment', status.environment],
    ['Status', `**${status.status}**`],
    ['URL', status.url],
    ['Commit', status.commit && `\`${status.commit}\``],
    ['Image tag', status.imageTag && `\`${status.imageTag}\``],
    ['Health check', status.health],
    ['Checked at (UTC)', status.checkedAt],
  ].filter(([, value]) => value);
  return ['### Deployment status', '', '| | |', '|---|---|', ...rows.map(([k, v]) => `| ${k} | ${v} |`), ''].join('\n');
}

async function main(env, outputFile, deps = {}) {
  if (!env.ENVIRONMENT || !RESULTS.includes(env.RESULT)) {
    console.error(`Deployment status: set ENVIRONMENT and RESULT (one of ${RESULTS.join(', ')}).`);
    return 2;
  }
  const health = env.RESULT === 'success' && env.HEALTH_URL ? await probeHealth(env.HEALTH_URL, deps) : null;
  const status = buildStatus(env, health);
  const markdown = formatMarkdown(status);
  console.log(markdown);
  if (env.GITHUB_STEP_SUMMARY) fs.appendFileSync(env.GITHUB_STEP_SUMMARY, markdown + '\n');
  fs.mkdirSync(path.dirname(outputFile), { recursive: true });
  fs.writeFileSync(outputFile, JSON.stringify(status, null, 2) + '\n');
  return health && !health.healthy ? 1 : 0;
}

module.exports = { probeHealth, describe, buildStatus, formatMarkdown, main };

if (require.main === module) {
  main(process.env, process.argv[2] || 'reports/deployment-status.json').then((code) => { process.exitCode = code; });
}
