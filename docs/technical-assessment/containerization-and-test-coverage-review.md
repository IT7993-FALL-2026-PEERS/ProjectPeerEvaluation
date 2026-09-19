# Containerization Status & Existing Test Coverage Review (M4)

Status: contribution to the compiled Technical Assessment Report (M3 owns compilation).
Owner: Khoa Ho (M4) — Milestone 1 (Assessment & Planning, review 28 Sep) per the approved Gantt chart,
Technical Assessment row: *"Review containerization status & existing test coverage."*

## 1. Containerization status: not functional

- `docker-compose.yml` exists at the repo root and defines `postgres`, `backend`, and `frontend`
  services. The `backend` and `frontend` services both use `build: ./src/backend` /
  `build: ./src/frontend` — but **no `Dockerfile` exists anywhere in the repository** (verified
  via a full-tree search). `docker-compose up` would fail immediately trying to build either
  service.
- The compose file's database service is **PostgreSQL 14**, but the application actually runs on
  **MongoDB** via Mongoose — confirmed in `src/backend/index.js` (`mongoose.connect(...)`),
  every model in `src/backend/models/*.js` (`mongoose.Schema`), the backend's `package.json`
  dependency (`mongoose: ^8.18.1`), and `DEPLOYMENT_GUIDE.md`'s own "MongoDB Hosting" section.
  The `postgres` service in `docker-compose.yml` is unused and wired to environment variables
  (`DATABASE_URL`) the backend doesn't read.
- No `.dockerignore` exists.
- `DEPLOYMENT_GUIDE.md` includes a Dockerfile *snippet* under "Option 4: Docker + Cloud
  Provider," but it was never committed as an actual file, and Docker isn't the guide's
  recommended path anyway — "Option 1: Render.com" is, which matches what M1/M2's CI/CD pipeline
  is already building toward.
- An earlier commit on `main` independently reached the same conclusion in passing (commit
  message: *"there is docker-compose.yml but it is not used, so no Docker usage in the
  project"*), which corroborates this review rather than duplicating it.

**Net assessment:** containerization is effectively at zero, not partially done. `docker-compose.yml`
is a stale artifact from the inherited codebase (likely written against an earlier, different
data-layer design) and should be treated as a reference to rewrite, not a baseline to patch. This
directly feeds M2 (Aaron)'s Milestone 2 task, "Complete/validate Dockerfiles for frontend &
backend" — it isn't a validation job, it's a from-scratch build, and the Postgres/Mongo mismatch
in `docker-compose.yml` should be corrected as part of that work.

## 2. Existing automated test coverage: zero, prior to this capstone cycle

As of the point this review started, `main` had:

- **No test files anywhere** — no `*.test.js`, `*.spec.js`, or `__tests__` directories in the
  entire repository.
- **No test framework installed in the backend at all** — `src/backend/package.json` had no
  `jest`, `mocha`, `supertest`, or any test runner, and no `test` script.
- **Frontend test tooling present but unused** — Create React App ships Jest +
  `@testing-library/react` + `@testing-library/user-event` (already in the root `package.json`),
  but zero test files existed against it, and the project was even missing the standard
  `src/setupTests.js` (so `jest-dom`'s custom matchers weren't wired up).

**Current state (this report):** [PR #1](../../pull/1) adds a first batch of frontend unit tests
(`AuthContext`, the `login` service, `ProtectedRoute` — 7 tests) as early groundwork for my
Milestone 2 deliverable. It is not yet merged to `main`; this review describes the baseline it
was measured against.

## 3. Implication for planning

- M2 (Aaron)'s containerization work in Milestone 2 starts from scratch, not from a working
  compose setup — worth flagging at the 28 Sep review so effort estimates account for it.
- M5 (Kylee) and I (M4) are both starting backend/frontend unit testing from a zero baseline —
  no legacy tests to preserve or migrate, which simplifies the Milestone 2 unit-testing tasks but
  means full coverage is genuinely new work, not incremental.
