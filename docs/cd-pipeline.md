# Delivery pipeline: images, reporting, staging regression (M2)

Aaron's M2 work (CICD-28 image slice, CICD-29, CICD-43). Donald owns `cd.yml`; these are the pieces it calls.

## Staging deploy (`cd.yml`, CICD-12)

Runs when CI finishes on a push to `main`, and deploys only if CI passed. Render's `autoDeployTrigger` is `off` for both
services in `render.yaml`, so `cd.yml` is the only thing that deploys staging. Render's old "deploy only if checks pass"
setting waited for every check on the commit, Dependabot's included, and failed Dependabot checks kept staging from
deploying after 27 September.

For each service, `scripts/render-deploy.js`:

1. reads the live commit: `commit` from the backend's `/api/health`, or the frontend's `/version.txt`, which the frontend
   build writes from `RENDER_GIT_COMMIT`;
2. skips the service when that commit is already live, when a newer commit is live (runs can finish out of order), or
   when no file the service uses changed since the live commit. These paths used to be `buildFilter` in `render.yaml`
   and save build minutes (500 a month). When the live commit can't be read, it deploys;
3. calls the service's deploy hook with `ref=<commit>`, so Render builds exactly the commit CI tested;
4. waits up to 20 minutes for the service to report that commit, and fails the job if it doesn't.

Then `deployment-status.yml` checks `/api/health` answers OK and writes the deployment status to the run summary.

**Run by hand:** Actions > CD > Run workflow, on `main`. Tick "force" to deploy both services even when nothing they use
changed (for example after changing an environment variable in Render).

## Release pipeline (`cd.yml`, CICD-28): design for review

The deploy above is the middle of a longer pipeline. The other stages are built but **switched off**: they run only when
the repository variable `CD_RELEASE` is `on` (Settings > Secrets and variables > Actions > Variables). While it is off,
each CD run deploys as above. The `Prepare` job also writes a dry-run plan to the run summary showing what the other
stages would have done, and those jobs show as skipped.

```
prepare ──► images ──► deploy (backend, frontend) ──► smoke ──► release (rc-* tag)
                              │                         │
                              ├──► report               └──► rollback, if deploy or smoke failed
```

| Job | What it does | Runs when |
|---|---|---|
| `prepare` | Works out the commit, the mode, and the previous good release from the newest `rc-*` release's record. If `main` has moved on since CI started, the run stands down, and the run for the newer commit deploys instead. Writes the plan | always |
| `images` | Calls `image-build.yml` (Aaron): builds both images, starts them, checks health, and pushes `ghcr.io/.../backend\|frontend:<sha>`. Never `latest` | `CD_RELEASE` on |
| `deploy` | Deploys each service whose files changed, then waits until it reports the commit (backend `/api/health`, frontend `/version.txt`). The two services can be on different commits | always (CICD-12) |
| `smoke` | Calls `staging-regression.yml`: health, the frontend, and Playwright tests tagged `@staging` (Kylee's smoke tests, read-only, no email) | `CD_RELEASE` on, deploy passed |
| `release` | Writes the release record (`scripts/release-record.js`), creates the `rc-<yyyymmdd>-<hhmm>-<sha7>` tag and a GitHub pre-release with the record attached | `CD_RELEASE` on, images, deploy and smoke all passed |
| `rollback` | Force-redeploys both services to the previous release's commits. The run stays failed | `CD_RELEASE` on, deploy or smoke failed, and an earlier release exists |
| `report` | `deployment-status.yml`: deployment status in the summary | deploy ran |

**Release record.** It holds the release commit, the commit each component is actually running (read from staging, not
assumed), both image references, the smoke result, the previous release, the run link, and how to recover. It is the
release notes and the `release-record.json` asset of the GitHub release, which keeps it permanently. A copy is also kept
as a 90-day run artifact, as is `deployment-status`. The 7-day retention only applies to CI's E2E report. If staging
can't say which commit a component runs, there is no release.

**Failure means no tag.** `release` needs every stage before it to have passed. A failed deploy or smoke run fails the
workflow, and `rollback` puts back the previous release.

**Manual rollback:** Actions > CD > Run workflow on `main`, with `rollback_to` set to an `rc-*` tag. It redeploys that
release's commits and nothing else. This works whether `CD_RELEASE` is on or off.

**Permissions.** The workflow reads by default. Only `images` gets `packages: write`, and only `release` gets
`contents: write`. The deploy hooks are `staging` environment secrets, which only `main` can use. Every job runs the
code from `main`; none checks out another ref.

**Turning it on** (after Khoa has reviewed this design):

1. Tag at least one `@staging` Playwright test (Kylee). Until then, `smoke` runs only the health and frontend checks.
2. Set the `CD_RELEASE` variable to `on`.
3. Merge something and check the run: an `rc-*` release whose record matches `/api/health` and `/version.txt`.
4. Prove the failure path: a deliberately broken deploy should end in a failed run, no new `rc-*` tag, and a rollback.

**Secrets** (environment `staging`, which only `main` can deploy to):

| Secret | Where to get it |
|---|---|
| `RENDER_BACKEND_DEPLOY_HOOK_URL` | Render > `peers-backend-staging` > Settings > Deploy Hook |
| `RENDER_FRONTEND_DEPLOY_HOOK_URL` | Render > `peers-frontend-staging` > Settings > Deploy Hook |

While staging is switched off, a CD run fails at the wait step, which is expected. Turn staging on and run CD by hand.

## Image build and push (`image-build.yml`)

Reusable (`workflow_call`) and runnable on its own (`workflow_dispatch`). It builds the backend and frontend images
through `docker-compose.yml`, starts them, checks `/api/health` reports the database connected, and only then pushes
both to `ghcr.io/<owner>/<repo>/backend|frontend:<commit sha>`. No `latest` tag. Only this job has `packages: write`;
the token is `GITHUB_TOKEN`. The run summary lists image names, tag and digests for the release record.

| Output | Meaning |
|---|---|
| `tag` | the commit SHA both images carry |
| `backend_image`, `frontend_image` | full image references with the tag |

Input `frontend_api_url` is compiled into the frontend image (public, never a secret). Render still builds from the same
commit (Docker ADR, option C), so the pushed frontend image is for testing and the release record, not for Render.
A caller must also grant `packages: write` to the job that calls this workflow.

## Reporting (CICD-29)

| Figure | Where |
|---|---|
| Tests run, passed, failed, skipped, duration | each test job's summary (`scripts/test-summary.js`) |
| Coverage | Frontend and Backend job summaries (`scripts/coverage-gate.js`) |
| Result and duration of every job, build history of the last 10 runs | `Run report` job in `ci.yml` (`scripts/run-report.js`) |
| Deployment status | `deployment-status.yml`, called from `cd.yml` after the deploy job (`scripts/deployment-status.js`) |
| Kept as artifacts | coverage and test results 30 days, `run-report`, `deployment-status-<env>` 30 days |

## Staging regression (`staging-regression.yml`)

Manual only (Actions tab > Run workflow) while staging is switched off and the variables below are not set. The weekly schedule (Tuesday 06:00 UTC) is kept as a comment in the workflow and comes back once staging is running. Read-only health and frontend checks, then Playwright tests tagged `@staging`.
Tests with that tag must not send email (Mailtrap allows 50 a month) and must not need the local E2E control server.
Set the `STAGING_URL` and `STAGING_API_URL` repository variables; a manual run can override both.

## Environments and secrets (CICD-38)

Production hosting is out of scope, so staging is the only deploy target. The `staging` environment holds the deploy
hooks for `cd.yml`. `main - peers-backend-staging` and `main - peers-frontend-staging` are created by Render when it
deploys `main`.

On 5 October 2026 we removed the leftovers from the unmerged `with-test-coverage` branch (audit A-05, A-06):
the `production-backend`, `production-frontend` and `with-test-coverage - peer-evaluation-backend` environments, the
`deploy-{backend,frontend}-production-*` tags, and all four `RENDER_*_DEPLOY_HOOK_URL` repo secrets, which no workflow on
`main` used. We deleted their 8 deployment records from 22 September as well, so the environments can't come back,
and suspended the unused Render services.

The deploy hooks are secrets of the `staging` environment, never repository secrets. A hook URL works like a password:
anyone who has it can deploy. If one leaks, regenerate it in Render and update the secret.
