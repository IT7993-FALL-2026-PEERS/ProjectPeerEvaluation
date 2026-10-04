# Delivery pipeline: images, reporting, staging regression (M2)

Aaron's M2 work (CICD-28 image slice, CICD-29, CICD-43). Donald owns `cd.yml`; these are the pieces it calls.

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

Weekly (Tuesday 06:00 UTC) and on demand. Read-only health and frontend checks, then Playwright tests tagged `@staging`.
Tests with that tag must not send email (Mailtrap allows 50 a month) and must not need the local E2E control server.
Set the `STAGING_URL` and `STAGING_API_URL` repository variables; a manual run can override both.
