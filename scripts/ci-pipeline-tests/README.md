# CI/CD pipeline scenario scripts

Manual verification scripts for `.github/workflows/ci-cd.yml` (unit-tests ->
deploy -> integration-tests, deploying `peer-evaluation-backend-rd6z` on
Render). Run these when you need to confirm the pipeline actually behaves
as designed -- they are not part of any automated suite and are not meant
to run unattended.

Each script must be run from a clean working tree with the target branch
checked out (defaults to `with-test-coverage` -- edit the `BRANCH` variable
at the top of a script if you're validating a different branch). Scripts
that push a deliberately broken commit prompt for confirmation before
doing anything.

**Run in order:**

1. `01-happy-path.sh` -- pushes an empty commit. Expect all three jobs green.
2. `02-build-fails.sh` -- breaks `/api/health`'s status so `unit-tests`
   fails. Expect `deploy` and `integration-tests` to show as **Skipped**.
   Clean up with `revert-last-scenario.sh`.
3. `03-integration-fails.sh` -- breaks the root route's `message` field, which
   only tests/integration/render-api.test.js checks (unlike the root route's
   `status`/`endpoints` fields, which a unit test pins -- an earlier version
   of this script targeted `status` and only ever reproduced scenario 2,
   since it never actually got past `unit-tests`). **This actually deploys
   the broken commit to production.** Expect `unit-tests` and `deploy`
   green, `integration-tests` red.
4. Roll back from step 3 with `revert-last-scenario.sh` -- fix-forward:
   reverts the commit and pushes, re-running the full pipeline (including
   a fresh Docker build and deploy) against the reverted code. There's no
   Render-API-based fast rollback here on purpose: it would restore
   production in seconds without a rebuild, but it needs `RENDER_API_KEY`
   credentials that shouldn't be scripted into a repo, and it doesn't fix
   or re-verify anything in git -- the bad commit would still sit on the
   branch. For a real incident where seconds matter, roll back manually
   from the Render dashboard's Deploys tab instead.

`revert-last-scenario.sh` always reverts whatever commit is currently at
`HEAD`, so run it right after the scenario script it's cleaning up --
don't let other commits land on the branch in between.
