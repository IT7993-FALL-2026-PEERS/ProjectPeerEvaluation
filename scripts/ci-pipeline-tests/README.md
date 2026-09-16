# CI/CD pipeline scenario scripts

Manual verification scripts for `.github/workflows/ci-cd.yml`: unit-tests ->
integration-tests -> deploy, deploying `peer-evaluation-backend-rd6z` on
Render. Deploy is gated on **both** test stages passing -- integration-tests
runs against a real local MongoDB service container in CI (see
`tests/integration/local-api.test.js`), before Render is ever touched, so a
broken commit never reaches production. Run these when you need to confirm
the pipeline actually behaves as designed -- they are not part of any
automated suite and are not meant to run unattended.

Each script must be run from a clean working tree with the target branch
checked out (defaults to `with-test-coverage` -- edit the `BRANCH` variable
at the top of a script if you're validating a different branch). Scripts
that push a deliberately broken commit prompt for confirmation before
doing anything.

**Run in order:**

1. `01-happy-path.sh` -- pushes an empty commit. Expect all three jobs green.
2. `02-unit-fails.sh` -- breaks `/api/health`'s status so `unit-tests` fails.
   Expect `integration-tests` and `deploy` to show as **Skipped**. Clean up
   with `revert-last-scenario.sh`.
3. `03-integration-fails.sh` -- breaks the root route's `message` field,
   which only `tests/integration/local-api.test.js` checks (unlike the root
   route's `status`/`endpoints` fields, which a unit test pins). Expect
   `unit-tests` green, `integration-tests` red, `deploy` **Skipped**.
   Nothing reaches production. Clean up with `revert-last-scenario.sh`.

There's no rollback script: since deploy only ever runs after both
unit-tests and integration-tests pass, there's no scenario here where
broken code reaches Render in the first place. `revert-last-scenario.sh`
just cleans up the deliberately broken demo commit from steps 2 and 3 --
run it right after the scenario script it's cleaning up, since it always
reverts whatever is currently at `HEAD`.

## Running the integration suite locally

`npm run test:integration` (in `src/backend`) needs a real MongoDB
reachable at `MONGODB_URI` (defaults to
`mongodb://127.0.0.1:27017/peer-evaluation-integration-test`). Start one
with `docker compose up -d mongo` from the repo root, or
`docker run -d --rm -p 27017:27017 mongo:7`.

## Two ways to verify the same gates

These scripts drive the pipeline through GitHub Actions. `scripts/run-local.sh`
at the repo root verifies the same unit-tests-then-integration-tests gate
entirely locally -- starts MongoDB, runs both suites, and only if they pass,
runs the app itself so you can interact with it directly.
