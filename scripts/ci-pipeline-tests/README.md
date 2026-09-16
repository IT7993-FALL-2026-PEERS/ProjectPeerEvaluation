# CI/CD pipeline scenario scripts

Manual verification scripts for `.github/workflows/ci-cd.yml` (unit-tests ->
deploy -> integration-tests, deploying `peer-evaluation-backend-rd6z` on
Render). Run these when you need to confirm the pipeline actually behaves
as designed -- they are not part of any automated suite and are not meant
to run unattended.

Each script must be run from a clean working tree with the target branch
checked out (defaults to `with-test-coverage` -- edit the `BRANCH` variable
at the top of a script if you're validating a different branch). Scripts
that push a deliberately broken commit or hit the Render API prompt for
confirmation before doing anything.

**Run in order:**

1. `01-happy-path.sh` -- pushes an empty commit. Expect all three jobs green.
2. `02-build-fails.sh` -- breaks `/api/health`'s status so `unit-tests`
   fails. Expect `deploy` and `integration-tests` to show as **Skipped**.
   Clean up with `revert-last-scenario.sh`.
3. `03-integration-fails.sh` -- breaks the root route's status in a way
   only the live integration suite catches, not unit tests. **This
   actually deploys the broken commit to production.** Expect
   `unit-tests` and `deploy` green, `integration-tests` red.
4. Roll back from step 3, either:
   - `04-rollback-render-api.sh` -- fast, via the Render API. Needs
     `RENDER_API_KEY` and `RENDER_SERVICE_ID` env vars (see the script's
     header comment) and `jq`.
   - `revert-last-scenario.sh` -- fix-forward: reverts the commit and
     pushes, re-running the full pipeline against the reverted code.

`revert-last-scenario.sh` always reverts whatever commit is currently at
`HEAD`, so run it right after the scenario script it's cleaning up --
don't let other commits land on the branch in between.
