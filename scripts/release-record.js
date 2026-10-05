#!/usr/bin/env node
// Release candidates for cd.yml (backlog CICD-28): the rc-* tag name, the release record, and the
// previous good release that a failed deploy rolls back to.
//
//   node scripts/release-record.js record <output dir>
//     SHA, RUN_URL, SMOKE_RESULT, BACKEND_IMAGE, FRONTEND_IMAGE, PREVIOUS_TAG, [CREATED_AT]
//     Reads the commit each staging service reports, then writes release-record.json and
//     release-record.md and prints the tag name. Exits 1 if a service can't say which commit it runs.
//
//   node scripts/release-record.js previous <release-record.json>
//     Prints tag=, backend=, frontend= lines for $GITHUB_OUTPUT from a previous record; empty values
//     when there is none (first release, or the file is missing).
//
// The record is attached to the GitHub release as release-record.json, which is where `previous`
// reads it back from: the release is the one place that keeps it for good.
const fs = require('node:fs');
const path = require('node:path');
const { SERVICES, liveCommit } = require('./render-deploy');

const SHA_RE = /^[0-9a-f]{40}$/;

// rc-20261105-1432-1a2b3c4: sortable by time, and the short SHA says what was released.
function tagName(sha, date = new Date()) {
  const stamp = date.toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 13);
  return `rc-${stamp}-${sha.slice(0, 7)}`;
}

function buildRecord({ env, backend, frontend, date = new Date() }) {
  const tag = tagName(env.SHA, date);
  return {
    tag,
    commit: env.SHA,
    createdAt: date.toISOString(),
    components: {
      backend: { commit: backend, image: env.BACKEND_IMAGE || null },
      frontend: { commit: frontend, image: env.FRONTEND_IMAGE || null },
    },
    smokeTests: env.SMOKE_RESULT || 'not run',
    previousRelease: env.PREVIOUS_TAG || null,
    run: env.RUN_URL || null,
  };
}

const short = (sha) => (sha ? `\`${sha.slice(0, 7)}\`` : 'unknown');

function formatMarkdown(record) {
  const { backend, frontend } = record.components;
  const recovery = record.previousRelease
    ? [
      'CD rolls back by itself when a deploy or the smoke tests fail. To go back to a release by hand, run',
      `**Actions > CD > Run workflow** on \`main\` with **rollback_to** set to its tag (the one before this is`,
      `\`${record.previousRelease}\`), or redeploy its commits from the Render dashboard (each service > Manual Deploy >`,
      'Deploy a specific commit).',
    ]
    : [
      'This is the first release candidate, so there is nothing older to roll back to. To go back to this one later, run',
      `**Actions > CD > Run workflow** on \`main\` with **rollback_to** set to \`${record.tag}\`.`,
    ];
  return [
    `## Release candidate ${record.tag}`,
    '',
    `Commit ${short(record.commit)} passed CI, deployed to staging and passed the smoke tests.`,
    '',
    '| Component | Commit on staging | Image |',
    '|---|---|---|',
    `| Backend | ${short(backend.commit)} | ${backend.image ? `\`${backend.image}\`` : '—'} |`,
    `| Frontend | ${short(frontend.commit)} | ${frontend.image ? `\`${frontend.image}\`` : '—'} |`,
    '',
    'A component can be on an older commit than the release when nothing it uses changed since then.',
    '',
    `**Smoke tests:** ${record.smokeTests}`,
    '',
    `**Previous release:** ${record.previousRelease || 'none'}`,
    '',
    '### How to recover',
    '',
    ...recovery,
    '',
    record.run ? `[CD run](${record.run})` : '',
    '',
  ].join('\n');
}

// Reads a previous release-record.json. Anything unusable means "no previous good release".
function previousGood(file) {
  try {
    const record = JSON.parse(fs.readFileSync(file, 'utf8'));
    const backend = record.components?.backend?.commit;
    const frontend = record.components?.frontend?.commit;
    if (!record.tag || !SHA_RE.test(backend || '') || !SHA_RE.test(frontend || '')) return null;
    return { tag: record.tag, backend, frontend };
  } catch {
    return null;
  }
}

async function record(env, outDir, { fetchImpl = fetch, date = new Date() } = {}) {
  if (!SHA_RE.test(env.SHA || '')) {
    console.error('Release record: set SHA to the full commit.');
    return 2;
  }
  const backend = await liveCommit(SERVICES.backend.versionUrl, fetchImpl);
  const frontend = await liveCommit(SERVICES.frontend.versionUrl, fetchImpl);
  if (!backend || !frontend) {
    console.error(`Release record: staging did not report its commits (backend ${backend || 'unknown'}, frontend ${frontend || 'unknown'}). No release.`);
    return 1;
  }
  const rec = buildRecord({ env, backend, frontend, date });
  const markdown = formatMarkdown(rec);
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'release-record.json'), JSON.stringify(rec, null, 2) + '\n');
  fs.writeFileSync(path.join(outDir, 'release-record.md'), markdown);
  if (env.GITHUB_STEP_SUMMARY) fs.appendFileSync(env.GITHUB_STEP_SUMMARY, markdown + '\n');
  console.log(rec.tag);
  return 0;
}

async function main(argv, env, deps) {
  const [command, target] = argv;
  if (command === 'record' && target) return record(env, target, deps);
  if (command === 'previous') {
    const prev = target ? previousGood(target) : null;
    console.log(`tag=${prev?.tag || ''}\nbackend=${prev?.backend || ''}\nfrontend=${prev?.frontend || ''}`);
    return 0;
  }
  console.error('Usage: node scripts/release-record.js record <output dir> | previous <release-record.json>');
  return 2;
}

module.exports = { tagName, buildRecord, formatMarkdown, previousGood, record, main };

if (require.main === module) {
  main(process.argv.slice(2), process.env).then((code) => { process.exitCode = code; });
}
