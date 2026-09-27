# Technical Assessment Report

**Owner:** Laeticia Neno Aloyem (M3) — Requirements, QA, security & documentation
**Milestone:** 1 — Assessment & Planning (14 Sep – 4 Oct 2026), review 28 Sep
**Gantt task:** Technical Assessment — *"Log known defects/limitations; compile technical assessment report"*
**Status:** Final for Milestone 1 — every section is complete; findings are reviewed with the sponsor at the 28 Sep milestone review
**Last updated:** 27 September 2026

## Purpose

This report compiles the Milestone 1 assessment findings from all five team members into
one document, so the sponsor and the team share a single, evidenced picture of the
inherited PEERS application before any implementation work begins.

Each section below summarises a teammate's committed review, with a link to the full
document. Section 11 is the consolidated defects and limitations log, owned by M3.

### Contributing reviews

| Section | Source document | Owner | State |
|---|---|---|---|
| Software architecture | `docs/architecture/system-architecture.md`, `docs/architecture/api-documentation.md` | M1 (written by M4, PR #52) | Committed |
| Technology stack | `docs/research-report/tech-stack-analysis.md` (raw output: `docs/stack-review-output.txt`) | M1 (written by M4, PR #52) | Committed |
| Repository organization & deployment | `docs/deployment-review.md` | M2 Aaron | Committed |
| Configuration management | `docs/deployment-review.md`, `docs/architecture/database-schema.md` | M2 / M5 | Committed |
| External dependencies | `docs/architecture/database-schema.md` | M5 Kylee | Committed |
| Database architecture | `docs/architecture/database-schema.md` | M5 Kylee | Committed |
| Containerization status | `docs/technical-assessment/containerization-and-test-coverage-review.md` | M4 Khoa | Committed |
| Existing testing | `docs/technical-assessment/containerization-and-test-coverage-review.md` | M4 Khoa | Committed |
| Critical business workflows | `docs/requirements/critical-workflows.md` | M1 | Committed; approved by the sponsor 27 Sep |
| Repository, dependency and workflow audit | `docs/technical-assessment/repo-cicd-audit.md` | M1 Donald | Committed (PR #58) |
| Development environment | `docs/dev-environment-review.md` | M2 Aaron | Committed (PR #56) |
| Containerization recommendations | `docs/containerization-recommendations.md` | M2 Aaron | Committed (PR #56) |
| Defects & limitations | This document, section 11 | M3 Laeticia | Committed |

---

## 1. Software architecture

Full detail in `docs/architecture/system-architecture.md` and
`docs/architecture/api-documentation.md` (PR #52), which describe the frontend, backend,
database and hosting, how they communicate, all 47 API endpoints, the security model and
eight architecture findings. Summary:

- **Frontend** — React 19.1.1 on Create React App, source under `src/frontend/`, with a
  pre-built `build/` directory also committed to the repository (see D-04).
- **Backend** — Node/Express 4.18.2, source under `src/backend/`, entry point
  `src/backend/index.js`, organised into `routes/`, `controllers/`, `models/`,
  `config/`, `utils/`, `migrations/` and `scripts/`.
- **Database** — MongoDB, accessed through Mongoose 8.18.1.
- **Hosting** — Render.com, as two separate services (a backend Web Service and a
  frontend Static Site).
- **Client/server contract** — the frontend calls the backend over HTTP; CORS in
  `src/backend/index.js` is hard-coded to a specific `onrender.com` origin (see D-13).
- **Health endpoint** — `/api/health` checks the database and reports the deployed commit.
  Render polls it before switching traffic to a new staging deploy.

## 2. Technology stack

Recorded by M1 in `docs/stack-review-output.txt` on 16 September. Current versions, audit results and
recommendations are in `docs/research-report/tech-stack-analysis.md` (PR #52); since the review,
Express is 4.22.3, Mongoose 8.24.4 and Nodemailer 10.0.10, and ten unused frontend packages,
including Chart.js, Recharts, Formik and Yup, were removed (PR #53).

| Layer | Technology | Version |
|---|---|---|
| Runtime | Node.js | 20.12.2 recorded in the stack review; `.nvmrc` now pins **24** (see D-07) |
| Package manager | npm | 10.5.0 |
| Frontend framework | React | 19.1.1 |
| Frontend tooling | Create React App (`react-scripts`) | 5.0.1 |
| UI library | MUI (`@mui/material`, `@mui/x-data-grid`) | 7.3.2 / 8.11.2 |
| Charting | Chart.js, Recharts | 4.3.0 / 3.2.0 |
| Forms & validation | Formik, Yup | 2.4.2 / 1.2.0 |
| Backend framework | Express | 4.18.2 |
| ODM | Mongoose | 8.18.1 |
| Authentication | jsonwebtoken, bcryptjs | 9.0.2 / 2.4.3 |
| Email | Nodemailer | 7.0.9 |
| File upload / parsing | multer, csv-parser | 2.0.2 / 3.2.0 |
| Test tooling (frontend) | Jest + React Testing Library | via CRA; `@testing-library/react` 16.3.0 |
| E2E tooling | Playwright | added during this capstone cycle |
| Hosting | Render.com | — |

**Comparison against the specification's suggested stack** (Node.js, React, MongoDB,
Docker): Node, React and MongoDB all match. Docker does not — see section 8.

**Note:** `multer` and `csv-parser` appear in the *root* (frontend) `package.json` as well
as the backend's, although they are server-side packages. See D-12.

## 3. Repository organization

Full detail in `docs/deployment-review.md` (M2 Aaron).

The repository root holds the React frontend's `package.json`, with application source
split between `src/frontend/` and `src/backend/`. Documentation lives under `docs/`,
organised into `architecture/`, `requirements/`, `technical-assessment/`,
`testing-strategy/`, `user-manual/`, `meeting-notes/`, `research-report/` and `gantt/`.
CI configuration lives in `.github/workflows/`.

Two directories are committed that ordinarily would not be: `build/` (compiled frontend
output) and a real `src/backend/.env`. Neither appears in `.gitignore`. See D-01 and D-04.

Five documentation files inherited from the previous team remain two-line placeholder
stubs. See D-08.

## 4. Deployment procedures

Full detail in `docs/deployment-review.md` (M2 Aaron). Summary:

Deployment today is entirely manual. A person configures two services by hand in the
Render.com dashboard following `DEPLOYMENT_GUIDE.md`. The backend builds with
`cd src/backend && npm install` and starts with `node index.js`; the frontend builds with
`npm run build` and publishes `src/frontend/build`. All environment variables are pasted
into the Render dashboard by hand.

The two services have a circular configuration dependency: the backend's `FRONTEND_URL`
needs the frontend's Render URL, and the frontend needs the backend's, so the documented
procedure is deploy backend, then frontend, then return to update the backend. Nothing
automates or guards this ordering.

`DEPLOYMENT_GUIDE.md` documents three alternative deployment paths (Vercel + Railway,
local SMTP testing, Docker + cloud provider), but only the Render path has matching
committed configuration, so Render is the flow actually in use.

**Since Aaron's review was written**, a CI workflow has been added (see section 9), so the
statement that "no `.github/workflows` directory exists" is now out of date for CI. It
remains accurate for CD: nothing deploys automatically.

## 5. Configuration management

- Environment variables are documented as a checklist in `render-env-variables.txt` and
  `src/backend/.env.example`. There is no secrets manager and no environment-specific
  configuration; values are set by hand per environment.
- A real `.env` file is committed to the repository at `src/backend/.env` (D-01).
- The committed `.env` sets `MONGO_URI`, while `.env.example` and the application code use
  `MONGODB_URI` (D-02).
- `JWT_SECRET` is documented in `.env.example` as required in production, but is absent
  from the committed `.env` (D-03).
- There is no separation between staging and production configuration — a single Render
  backend and frontend pair serves as both.
- Node version is pinned by `.nvmrc` (24), which the CI workflow reads via
  `node-version-file`.

## 6. External dependencies

Full detail in `docs/architecture/database-schema.md` (M5 Kylee).

| Dependency | Purpose | Configured via |
|---|---|---|
| MongoDB (Atlas or local) | Primary data store | `MONGODB_URI` |
| Nodemailer / SMTP | Evaluation invitations, reminders, notifications | `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` |
| Render.com | Backend and frontend hosting | `render-build-info.txt` |
| jsonwebtoken + bcryptjs | Token issuing and password hashing | `JWT_SECRET` (see D-03) |
| multer + csv-parser | Roster CSV upload | — |

`FRONTEND_URL` is read from the environment and used to build the evaluation links sent
by email, which makes email delivery dependent on correct deployment-time configuration.

## 7. Database architecture

Full detail, including an entity-relationship diagram, in
`docs/architecture/database-schema.md` (M5 Kylee).

Six Mongoose collections: **Professor** (instructor account and settings), **Course**,
**Team**, **Student** (roster entry, carries the evaluation token), **Evaluation** (one
peer review submission), and **Report** (aggregated results per course).

Findings carried into the defects log: the evaluation rubric is hardcoded rather than
stored in the database (D-09); team membership is recorded in two places that can drift
apart (D-10); `Report` sub-documents are untyped (D-11); and there is no migration
framework, only a single one-off script plus eleven ad-hoc scripts (D-14).

## 8. Containerization status

Full detail in `docs/technical-assessment/containerization-and-test-coverage-review.md`
(M4 Khoa). Summary: **containerization is effectively at zero, not partially complete.**

`docker-compose.yml` exists at the repository root and defines `postgres`, `backend` and
`frontend` services, but no `Dockerfile` exists anywhere in the repository, so
`docker-compose up` fails immediately (D-05). The compose file provisions PostgreSQL 14
while the application runs on MongoDB (D-06). There is no `.dockerignore`. The Dockerfile
in `DEPLOYMENT_GUIDE.md` "Option 4" is a markdown snippet that was never committed as a
file, and covers only the backend.

Both M2's and M4's reviews independently conclude that `docker-compose.yml` should be
rewritten from scratch rather than patched, and that M2's Milestone 2 containerization
task is net-new work rather than validation.

## 9. Existing testing

Baseline at the start of this capstone cycle, per M4's review: **no test files anywhere**,
no backend test framework installed, and frontend test tooling present (Jest and React
Testing Library, via Create React App) but entirely unused, with `src/setupTests.js`
missing.

Current state as of 21 September, verified against `main`:

| Area | Files | Notes |
|---|---|---|
| Frontend unit tests | `src/frontend/contexts/__tests__/AuthContext.test.js`, `src/frontend/services/__tests__/login.test.js`, `src/frontend/components/__tests__/ProtectedRoute.test.js` | Added by M4 (PR #1, merged 19 Sep) — 7 tests |
| Backend tests | `src/backend/tests/env.test.js` | Configuration check only; no unit tests of application logic (D-15) |
| E2E | `e2e/setup.spec.js` | Verifies the Playwright installation, not the running application |

A CI workflow (`.github/workflows/ci.yml`) now runs on every pull request and push to
`main`, with four jobs: frontend test and build, backend install and syntax check, an
end-to-end Playwright smoke job, and a workflow lint. The backend job's "syntax check"
step is explicitly a placeholder until real backend tests exist. Branch protection
requires these checks to pass before merge.

**Update, 27 September.** 140 backend tests (`node --test`) and 30 frontend tests (Jest and
React Testing Library) now run in CI on every pull request (PRs #41 and #44–#50), so the
backend job is no longer a placeholder (D-15 resolved). The Requirements Traceability Matrix
maps each test to its requirement.

**Coverage baseline:** no coverage threshold is configured or enforced yet. The testing
strategy (`docs/testing-strategy/testing-strategy.md`) sets a 70% target, with the floor
measured first and ratcheted upward, in Milestone 2.

## 10. Critical business workflows

Twelve workflows, CW-01 to CW-12, are documented in `docs/requirements/critical-workflows.md`,
each traced to its requirements and code. The sponsor approved them on 27 September 2026.
The Requirements Traceability Matrix (`docs/requirements/rtm.md`) maps every requirement to
its workflow and its tests.

## 11. Known defects and limitations

Severity key: **Critical** — security or data risk; **High** — blocks a milestone
deliverable or breaks a documented feature; **Medium** — incorrect or inconsistent
behaviour with a workaround; **Low** — hygiene, documentation or maintainability.

| ID | Description | Where found | Severity | Evidence | Status |
|---|---|---|---|---|---|
| D-01 | A real `.env` file is committed to version control, and `.gitignore` contains no `.env` entry, so future secrets will also be committed by default | `src/backend/.env`, `.gitignore` | Critical | File is present in the repository tree; `grep -nE "\.env" .gitignore` returns nothing | Open |
| D-02 | The committed `.env` sets `MONGO_URI`, but `.env.example` and the application code both use `MONGODB_URI`, so the committed file would not configure a working database connection | `src/backend/.env` vs `src/backend/.env.example` | High | Key names differ between the two files; `mongoose.connect` reads `MONGODB_URI` | Open |
| D-03 | `JWT_SECRET` is documented in `.env.example` as required in production (minimum 32 characters), but is absent from the committed `.env`; M5's review also could not confirm where it is defined | `src/backend/.env.example`, `src/backend/controllers/authController.js` | High | `.env.example` documents it; the committed `.env` contains only one key | Open |
| D-04 | The compiled frontend `build/` directory is committed to version control and is not listed in `.gitignore` | `build/`, `.gitignore` | Medium | `build/404.html`, `build/asset-manifest.json` etc. are tracked files | Open |
| D-05 | No `Dockerfile` exists anywhere in the repository, although `docker-compose.yml` declares `build: ./src/backend` and `build: ./src/frontend`; `docker-compose up` fails immediately | `docker-compose.yml`, repository-wide search | High | Full-tree search for `Dockerfile*` returns no results | Open |
| D-06 | `docker-compose.yml` provisions PostgreSQL 14 and a `DATABASE_URL`, but the application runs on MongoDB via Mongoose and never reads that variable | `docker-compose.yml` vs `src/backend/index.js`, `src/backend/models/*.js` | High | Compose defines a `postgres` service; every model uses `mongoose.Schema`; `package.json` depends on `mongoose` | Open |
| D-07 | `.nvmrc` pins Node 24, but the Milestone 1 stack review recorded Node 20.12.2; the two records of the supported runtime disagree | `.nvmrc`, `docs/stack-review-output.txt` | Medium | `.nvmrc` contains `24`; stack review output line 2 reads `v20.12.2` | Resolved — `.nvmrc`, `engines`, CI and Render all use Node 24; 20.12.2 was the reviewer's machine |
| D-08 | Five inherited documentation files are two-line placeholder stubs, including the system architecture document a Milestone 1 deliverable depends on | `docs/architecture/system-architecture.md`, `docs/architecture/api-documentation.md`, `docs/requirements/non-functional-requirements.md`, `docs/research-report/tech-stack-analysis.md`, `docs/meeting-notes/weekly-meetings.md`, `docs/user-manual/professor-guide.md` | Medium | Each file is between 48 and 75 bytes and contains only a heading and a parenthetical placeholder line | Partly resolved — architecture, API and tech-stack documents written (PR #52); non-functional requirements, weekly meetings and professor guide remain stubs |
| D-09 | The evaluation rubric is hardcoded in a configuration file with no Rubric model and no per-course customisation, although rubric management is listed as a core workflow in the sponsor specification | `src/backend/config/rubric.js` | Medium | File comment reads "This is the hardcoded rubric provided by sponsors"; no Rubric model exists in `src/backend/models/` | Open |
| D-10 | Team membership is stored in two places — `Team.students[]` and `Student.team_id` — with no visible synchronisation, so the two can drift apart | `src/backend/models/Team.js`, `src/backend/models/Student.js` | Medium | Both fields exist; M5's schema review found no sync mechanism in the model files | Open |
| D-11 | `Report.team_reports`, `Report.student_reports` and `Report.ai_insights` are typed as generic `Object` / `[Object]` with no schema enforcement, which will complicate testing report generation | `src/backend/models/Report.js` | Low | Field types are untyped `Object` in the schema definition | Open |
| D-12 | `multer` and `csv-parser`, both server-side packages, are declared as dependencies in the root (frontend) `package.json` as well as the backend's | Root `package.json` | Low | Both appear in the root dependency list in `docs/stack-review-output.txt` | Resolved — removed from the root `package.json` (PR #53) |
| D-13 | CORS configuration is hard-coded to a specific `onrender.com` origin rather than read from configuration, so a change of deployment URL requires a code change | `src/backend/index.js` | Medium | Documented in `docs/deployment-review.md` §2.2 | Open |
| D-14 | There is no migration framework — one historical one-off script plus eleven unstructured ad-hoc scripts for seeding and inspecting data, with no test-fixture system | `src/backend/migrations/migrateCourses.js`, `src/backend/scripts/` | Low | Eleven scripts present, including `addRandomCourses.js`, `createTestData.js`, `viewDatabaseContent.js` | Open |
| D-15 | The backend has no unit tests of application logic; CI substitutes a syntax check as an explicit placeholder, so backend regressions are not caught | `src/backend/tests/`, `.github/workflows/ci.yml` | Medium | Only `env.test.js` (a configuration check) exists; the CI step comment reads "Placeholder until backend tests exist" | Resolved — 140 backend tests run in CI (PRs #41, #44–#50) |
| D-16 | No test coverage threshold is configured or enforced in CI, so coverage can silently regress | `.github/workflows/ci.yml`, `package.json` | Medium | No `coverageThreshold` in Jest configuration; no coverage step in the workflow | Open |
| D-17 | Multi-factor authentication is advertised by the data model and the login flow but is not implemented — the verification endpoint returns an error | `src/backend/controllers/authController.js`, `src/backend/routes/auth.js` | High | `Professor.mfa_enabled` exists and login returns `mfa_required: true`, but `verifyMfa` throws `'MFA verification not implemented.'`; a professor with MFA enabled cannot log in | Open |
| D-18 | Session lifetime does not match the documented requirement — tokens are issued with a one-hour expiry, but the inherited requirement specifies a 30-minute timeout | `src/backend/controllers/authController.js`, `docs/requirements/functional-requirements.md` | Low | `const JWT_EXPIRES_IN = '1h'`; FR1.4 specifies 30 minutes | Open |
| D-19 | The participation criterion uses a 1–4 rating scale while every other criterion uses 1–5, contradicting the inherited requirement that all ratings are 1–5 | `src/backend/models/Evaluation.js` | Medium | `participation: { min: 1, max: 4 }` with an inline comment noting the difference; all five other criteria are `min: 1, max: 5` | Open |
| D-20 | **PDF report export does not exist.** CSV export works, but FR5.3 specifies both formats, so half the requirement is unmet | `src/backend/controllers/reportController.js`, `package.json` | Medium | `downloadReport` (CSV) is implemented at `reportController.js:346`; no PDF generation library is installed and no PDF handler is defined | Open — *corrected 27 Sep, see revision note* |
| D-22 | Written-feedback length is not enforced as specified — the minimum is 10 characters rather than 50, and there is no maximum at all, so a one-word response is accepted and an unbounded one is stored | `src/backend/controllers/evaluationController.js`, `src/backend/models/Evaluation.js` | Medium | `evalData.overall_feedback.trim().length < 10` at `evaluationController.js:479`; no `minlength`/`maxlength` on `Evaluation.overall_feedback` at `models/Evaluation.js:15`; FR4.2 specifies 50–500 | Open |
| D-23 | The evaluation deadline is only shown in the invitation email; it is never stored or enforced, so late submissions are accepted. The sponsor specification lists deadline validation among expected unit tests | `src/backend/controllers/evaluationController.js` (`deadline` passed to the email only) | Medium | `deadline` is read from the request and sent in the email; no model field or check exists | Open |
| D-21 | The deployment review document's header labels it "Milestone 2, task 1.2", but it is a Milestone 1 deliverable | `docs/deployment-review.md` | Low | Line 3 of the document | Open — M2 to correct |

**Summary:** 23 defects logged — 1 critical, 4 high, 12 medium, 6 low; three resolved
(D-07, D-12, D-15) and one partly resolved (D-08) by 27 September. Further findings are in
`docs/architecture/api-documentation.md` §13 (API-1 to API-8),
`docs/architecture/system-architecture.md` §8 and `docs/technical-assessment/repo-cicd-audit.md`
§7 (A-01 to A-17). The critical and
high items cluster around two themes: secrets and configuration hygiene (D-01, D-02,
D-03), and features that are documented or partially scaffolded but not actually
implemented (D-05, D-17).

**Revision note, 27 September.** D-20 originally read "no report export capability exists."
That was wrong. It was based on a dependency and route search that missed `downloadReport`
in the report controller — CSV export is implemented and works; only PDF export is
missing. D-20 has been narrowed accordingly, and the corresponding requirement (FR-19 in
`docs/requirements/requirements.md`) has moved from *Unsupported* to *Partial*.

The error was surfaced by `docs/requirements/rtm.md`. The same re-reading added D-22 and
corrected three other requirement statuses. Carried forward as a working rule: absence of
a dependency is not evidence that a feature is absent — the controller has to be read.

## 12. Next steps

1. **Done:** architecture, API and tech-stack documents (PR #52), critical workflows
   (sponsor-approved 27 Sep), required functionality and acceptance criteria
   (`requirements.md`), and the Requirements Traceability Matrix (`rtm.md`).
2. **28 Sep review:** walk the sponsor through these findings, as the specification
   requires, and triage the defects: which are fixed in this capstone, and which are
   recorded and deferred.
3. **Milestone 2:** defects the sponsor places in scope are fixed with a regression test
   and marked Resolved here.
