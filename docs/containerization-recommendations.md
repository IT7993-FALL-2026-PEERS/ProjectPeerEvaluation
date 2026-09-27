# Containerization Recommendations (M2)

**Task:** 3.2 — Finalize containerization assessment & recommendations
**Owner:** Aaron Simpson (M2) — Environment, containerization & delivery
**Objective:** turn the containerization findings into a concrete action list Milestone 2 can execute against.
**Source of findings:** `docs/technical-assessment/containerization-and-test-coverage-review.md` (M4 Khoa) and §8 of `docs/technical-assessment/technical-assessment-report.md` — referred to below as "the assessment."
**Last updated:** 26 September 2026

## Starting point

The assessment's conclusion is blunt and worth restating here: **containerization is at zero, not partially done.** `docker-compose.yml` exists but references `build: ./src/backend` and `build: ./src/frontend`, and no `Dockerfile` exists anywhere in the repository (confirmed again in this pass — `find . -iname "Dockerfile*"` returns nothing), so `docker-compose up` fails immediately. The compose file also provisions a **PostgreSQL** service, while the application connects to **MongoDB** via Mongoose everywhere (`src/backend/index.js`, every model in `src/backend/models/*.js`, the `mongoose` dependency in `src/backend/package.json`). This means `docker-compose.yml` isn't a baseline to patch — it's a stale artifact from an earlier, different data-layer design and should be rewritten from scratch, exactly as both M2's and M4's reviews already concluded.

## Action items

- [ ] **Write a backend `Dockerfile`.** Node 24 base image (match `.nvmrc`/`package.json engines`), install with `npm ci` against `src/backend/package-lock.json`, expose port 5000, `CMD node index.js`. No multi-stage build needed — it's a plain Node process, not a compiled artifact.
- [ ] **Write a frontend `Dockerfile` (multi-stage build).** Build stage: Node 24, `npm ci`, `npm run build` to produce the CRA static bundle. Serve stage: a lightweight static server (e.g. `nginx` or `serve`) copying only `build/` from the build stage, so the final image doesn't ship `node_modules` or source.
- [ ] **Add a `.dockerignore` at the repo root and/or per-service.** None exists today (per the assessment); without one, `node_modules`, `.env`, and the already-committed `build/` directory would all get copied into build contexts unnecessarily.
- [ ] **Rewrite `docker-compose.yml`'s data layer: replace the `postgres` service with `mongo`.** Use an official `mongo` image, drop `DATABASE_URL`/`POSTGRES_*` entirely, and set the backend's connection string (`MONGODB_URI`, standardized per the dev-environment review) to point at the `mongo` service's hostname, e.g. `mongodb://mongo:27017/peer-eval`.
- [ ] **Add healthcheck entries to `docker-compose.yml` for all three services**, wired to what the app already exposes rather than invented from scratch:
  - `backend`: HTTP check against `GET /api/health` (already implemented in `src/backend/config/health.js` — returns `200`/`OK` when Mongo is connected, `503`/`DEGRADED` otherwise, so it's a genuine dependency check, not just "is the process alive")
  - `mongo`: the standard `mongosh --eval "db.adminCommand('ping')"` (or `mongo` shell equivalent for the chosen image tag) check
  - `frontend`: HTTP check against `/` on port 3000 (or whatever port the static server serves on)
  - Set `backend`'s `depends_on.mongo` to use `condition: service_healthy`, and `frontend`'s `depends_on.backend` the same way, so compose actually waits on real readiness instead of just container start order
- [ ] **Document required environment variables for container startup.** The backend needs `MONGODB_URI`, `JWT_SECRET`, and the `SMTP_*` variables (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`) — the full set is already listed in `src/backend/.env.example`, so this is a matter of carrying that list into the Docker docs (and into `docker-compose.yml`'s `environment:`/`env_file:` block) rather than rediscovering it. The frontend needs `REACT_APP_API_URL` pointed at the backend service.
- [ ] **Write/refresh startup documentation as `docs/docker-setup.md`.** Should cover: prerequisites (Docker + Compose version), `docker compose up --build`, where to put the env file(s) compose reads from, how to confirm all three services report healthy, and how this relates to (not replaces) the existing local `npm run dev` path documented in the README.
- [ ] **Decide, and state explicitly in `docs/docker-setup.md`, whether Docker is a local-dev convenience or a deployment path.** The README currently states deployment is Render.com only, and `DEPLOYMENT_GUIDE.md`'s "Option 4: Docker + Cloud Provider" is explicitly a documented-but-unused alternative. Scoping Docker to local dev (matching the spec's "containerize the application... and finalize a repeatable local dev setup" wording) avoids the recommendations here being read as a deployment migration.

## Traceability back to the assessment

| Gap | Assessment reference |
|---|---|
| No Dockerfile anywhere (frontend or backend) | D-05, High |
| Compose provisions Postgres; app runs on MongoDB | D-06, High |
| No `.dockerignore` | §1 of `containerization-and-test-coverage-review.md` |
| No health checks / no readiness gating between services | §1 ("Nothing currently polls it" re: `/api/health`) and §1 of `technical-assessment-report.md` |
| No environment variable documentation for container startup | Env vars only documented today for the Render path (`render-env-variables.txt`, `.env.example`), not for Docker |
| No startup documentation for Docker | `DEPLOYMENT_GUIDE.md`'s Docker section is a snippet, never a working guide |

Every action item above closes exactly one open gap from the assessment; none are speculative additions beyond what's needed to reach the specification's containerization deliverable.

## Done checklist

- [x] This file committed to `docs/containerization-recommendations.md` (PR #56)
- [x] Every gap identified in the assessment (D-05, D-06, missing `.dockerignore`, missing health checks, missing env documentation, missing startup docs) has a corresponding action item above
