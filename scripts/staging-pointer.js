#!/usr/bin/env node
// Moves the `staging` pointer tag of the backend image (backlog CICD-73).
//
//   IMAGE_REF=ghcr.io/<path>/backend@sha256:<digest> SMOKE_PASSED=true SHA=<commit> HEALTH_URL=<url> node scripts/staging-pointer.js
//
// Render's configured image for the backend is `<image path>:staging`. A restart, a scale-out or a
// "Deploy latest reference" pulls whatever that tag points at, so CD moves it, and only it, to the digest
// that was deployed and passed the smoke tests (or, after a rollback, to the digest rolled back to). It is
// the one tag in the registry that ever moves; the per-commit tags are never overwritten and `latest` is
// never used. The command is built here, from a validated reference, so the workflow never assembles it
// from loose strings.
//
// It moves the pointer only when the backend on staging reports SHA, the commit of that image: a run
// that was late (a newer commit is already live) or that deployed nothing leaves the pointer where it is.
// Staging that cannot say which commit it runs is a failure, not a skip: cd.yml's release waits for this
// job, so a published release always means the pointer is where it should be.
//
// Exit codes: 0 moved or deliberately left alone, 1 the move failed or staging could not be read, 2 refused.
const { spawnSync } = require('node:child_process');
const { IMAGE_REF_RE, liveCommit } = require('./render-deploy');

const POINTER_TAG = 'staging';

// Returns the argv that re-points `<path>:staging` to `ref`. Throws, with a plain reason, for anything
// it will not do.
function pointerCommand({ ref, smokePassed }) {
  if (smokePassed !== true) throw new Error('the staging pointer moves only after the smoke tests passed');
  if (typeof ref !== 'string' || !ref.includes('@')) throw new Error('the pointer takes an image digest reference (path@sha256:...), not a tag');
  if (!ref.startsWith('ghcr.io/')) throw new Error('the pointer can only point at an image in ghcr.io');
  if (!IMAGE_REF_RE.test(ref)) throw new Error('the image reference must be ghcr.io/<lower-case path>@sha256:<64 hex digits>');
  const path = ref.slice(0, ref.indexOf('@'));
  if (!path.endsWith('/backend')) throw new Error('the pointer is only for the backend image');
  return ['docker', 'buildx', 'imagetools', 'create', '-t', `${path}:${POINTER_TAG}`, ref];
}

async function main(env, { run = (argv) => spawnSync(argv[0], argv.slice(1), { stdio: 'inherit' }), fetchImpl } = {}) {
  let command;
  try {
    command = pointerCommand({ ref: env.IMAGE_REF, smokePassed: env.SMOKE_PASSED === 'true' });
  } catch (error) {
    console.error(`Staging pointer: ${error.message}.`);
    return 2;
  }
  if (!/^[0-9a-f]{40}$/.test(env.SHA || '') || !env.HEALTH_URL) {
    console.error('Staging pointer: set SHA (the commit of the image) and HEALTH_URL.');
    return 2;
  }
  const live = await liveCommit(env.HEALTH_URL, fetchImpl);
  if (!live) {
    console.error('Staging pointer: could not read the commit staging runs, so the pointer was not moved. Run CD again or move it by hand.');
    return 1;
  }
  if (live !== env.SHA) {
    console.log(`Staging pointer: staging reports ${live.slice(0, 7)}, not ${env.SHA.slice(0, 7)}, so the pointer stays where it is.`);
    return 0;
  }
  const result = run(command);
  if (result.status !== 0) {
    console.error('Staging pointer: could not move the pointer. Render\'s configured image is now behind the version that is running.');
    return 1;
  }
  console.log(`Staging pointer: ${command[5]} now points at ${env.IMAGE_REF}.`);
  return 0;
}

module.exports = { POINTER_TAG, pointerCommand, main };

if (require.main === module) {
  main(process.env).then(
    (code) => { process.exitCode = code; },
    (error) => { console.error(`Staging pointer: failed with an unexpected ${error?.name || 'error'}.`); process.exitCode = 1; },
  );
}
