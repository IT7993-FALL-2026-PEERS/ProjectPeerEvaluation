# Deployment Review: Current State & Gap to Automated Staging Deployment

Milestone 2, task 1.2 — Review repository organization & deployment procedures
Owner: Aaron Simpson (M2) — Environment, containerization & delivery

## Objective

Understand how the app is currently deployed today, so the gap to an automated
staging deployment (Milestone 3) is clear before that work starts.

## 1. Sources reviewed

- `DEPLOYMENT_GUIDE.md`
- `render-build-info.txt`
- `render-env-variables.txt`
- `.github/workflows/` — **does not exist**, no CI/CD workflows are defined anywhere
  in the repo yet
- `docker-compose.yml`
- `src/backend/index.js`, `src/backend/package.json`
- `docs/technical-assessment/containerization-and-test-coverage-review.md` (M4's
  Milestone 1 review, which independently confirms several findings below)

## 2. Current deployment flow, step by step

The repo has no CI/CD automation today. "Deployment" currently means a person
manually configuring two services on Render.com by hand, following
`DEPLOYMENT_GUIDE.md`. There is no `.github/workflows` directory, so nothing runs
automatically on push or PR — no build check, no test run, no deploy.

### 2.1 Backend service (Render "Web Service")

| Step | Detail |
|---|---|
| Trigger | Manual: a person creates the service in the Render dashboard and connects the GitHub repo |
| Build command | `cd src/backend && npm install` |
| Start command | `cd src/backend && node index.js` |
| Runtime | Node/Express, connects to MongoDB via Mongoose (`mongoose.connect(...)` in `src/backend/index.js`) |
| Environment variables (set by hand in Render dashboard) | `MONGODB_URI`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`, `FRONTEND_URL`, plus optional `NODE_ENV` and `PORT` (per `render-env-variables.txt`) |
| Health check | An `/api/health` route already exists in `index.js` and returns `{status: 'OK', ...}` — Render isn't configured to poll it today, but it's a ready-made hook for a future automated check |

### 2.2 Frontend service (Render "Static Site")

| Step | Detail |
|---|---|
| Trigger | Manual: a separate Render "Static Site" connected to the same repo |
| Build command | `cd src/frontend && npm install && npm run build` |
| Publish directory | `src/frontend/build` |
| Routing | `public/_redirects` (`/* /index.html 200`) handles SPA client-side routing on Render's static host |
| Environment | Frontend needs to know the backend's URL; backend's `FRONTEND_URL` env var has to be set *after* the frontend gets its Render URL, and CORS in `index.js` is hard-coded to allow `https://peer-evaluation-frontend.onrender.com` plus any `*.onrender.com` subdomain |

### 2.3 Ordering / sequencing problem

Because `FRONTEND_URL` (backend env) depends on the frontend's Render URL, and the
frontend's API base URL depends on the backend's Render URL, the guide requires
deploying backend first, then frontend, then circling back to update the backend's
`FRONTEND_URL`. This is a manual, order-dependent, two-person-workflow problem with
no automation guarding it.

### 2.4 Alternative paths documented but not actually used

`DEPLOYMENT_GUIDE.md` also lists three other options (Vercel+Railway, local Gmail
SMTP testing, and Docker+Cloud Provider), but only the Render.com path has matching
config files (`render-build-info.txt`, `render-env-variables.txt`) committed to the
repo, so Render is the flow actually in use. The Docker option is a documentation
snippet only — see 3.2 below.

## 3. Known problems with the current setup

- **No CI/CD at all.** Every step above is a human clicking through the Render
  dashboard and pasting values in by hand. There's no repeatable, versioned
  definition of the deployment process — `DEPLOYMENT_GUIDE.md` is prose, not
  config-as-code.
- **`docker-compose.yml` is stale and doesn't work.** It defines `postgres`,
  `backend`, and `frontend` services, but:
  - **No `Dockerfile` exists anywhere in the repo**, even though `backend` and
    `frontend` both use `build: ./src/backend` / `build: ./src/frontend`.
    `docker-compose up` fails immediately.
  - It provisions **PostgreSQL**, but the app runs on **MongoDB** via Mongoose
    (confirmed in `index.js`, every model in `src/backend/models/*.js`, and the
    `mongoose` dependency in `src/backend/package.json`). The `postgres` service
    and its `DATABASE_URL` env var are dead weight the backend never reads.
  - This matches the M4 containerization review's conclusion: containerization is
    "effectively at zero," and `docker-compose.yml` should be treated as a
    reference to rewrite from scratch, not a baseline to patch.
- **The Dockerfile in `DEPLOYMENT_GUIDE.md` ("Option 4") was never committed as a
  real file.** It's a snippet in the markdown only, and it only covers the
  backend — there's no equivalent snippet for the frontend.
- **No automated tests run before deploy.** Nothing gates a deploy on tests
  passing, since nothing runs the tests automatically at all.
- **Secrets are documented, not managed.** `render-env-variables.txt` lists env
  var names with placeholder values, which is fine as a checklist, but there's no
  secrets manager or environment-specific config — someone has to remember to set
  these by hand for every environment they stand up.
- **No environment separation.** There's one Render backend service and one
  frontend service. There's no distinct staging environment separate from
  whatever is treated as "production" — a bad deploy has nowhere to land except
  live.

## 4. Gap against the target CD pipeline

Target pipeline (per the project specification):
**build artifacts → build Docker images → deploy to staging → smoke tests →
health check → release candidate.**

| Target stage | Current state | Gap |
|---|---|---|
| Build artifacts | `npm install` run by hand in the Render dashboard for both services | No CI workflow builds anything automatically on push/PR. Needs a `.github/workflows` job that runs `npm run setup` (or equivalent) and `npm run build` for the frontend as a first automated step. |
| Build Docker images | No Dockerfiles exist at all; `docker-compose.yml` is broken and targets the wrong database | Needs Dockerfiles written from scratch for both `src/backend` and `src/frontend` (not adapted from the existing compose file), plus `docker-compose.yml` corrected to use MongoDB instead of Postgres, plus a `.dockerignore`. This is the direct dependency for M2's "Complete/validate Dockerfiles for frontend & backend" task — it's net-new work, not validation. |
| Deploy to staging | No staging environment exists; deploys go straight to the single Render backend/frontend pair by hand | Needs a defined staging target (a second Render environment, or a container-based staging host) and a workflow step that deploys the built image/artifact there automatically, in place of the manual dashboard clicks. |
| Smoke tests | None exist | Needs a minimal smoke-test job (e.g., hit `/api/health` and the frontend's root route after deploy) wired into the workflow. `e2e/setup.spec.js` currently only verifies the Playwright install itself, not the running app — it's scaffolding for this, not a working smoke test yet. |
| Health check | `/api/health` endpoint already exists in `src/backend/index.js` and returns a JSON status | The endpoint is ready; nothing currently polls it as part of a deploy gate. This is the smallest gap in the whole pipeline — it just needs to be called from CI after deploy. |
| Release candidate | No concept of a release candidate — "deployed" and "latest manual push" are the same thing | Needs versioning/tagging conventions and a gate (all previous stages passing) before something is marked a release candidate. |

## 5. Summary for planning

- Every stage of the target CD pipeline is currently either manual, missing, or
  (in the case of Docker) actively broken.
- The one piece already in decent shape is the `/api/health` endpoint — it just
  isn't wired into anything yet.
- The `docker-compose.yml` file cannot be incrementally fixed; it needs to be
  rewritten against MongoDB once real Dockerfiles exist, per the M4
  containerization review.
- Recommend Milestone 3 scope: write Dockerfiles → fix `docker-compose.yml` →
  add a `.github/workflows` CI job (install/build/test) → define a staging
  target → add a deploy step → add a smoke test hitting `/api/health` and the
  frontend root → gate "release candidate" status on all of the above passing.

## Done checklist

- [x] Current deployment flow documented step by step
- [x] Gap list against the target CD pipeline captured
- [ ] `docs/deployment-review.md` committed — commit and push this file to close
      out task 1.2
