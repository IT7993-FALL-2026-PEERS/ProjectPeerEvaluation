# Milestone 1 Progress Report — Assessment & Planning

**Project:** CI/CD pipeline for the PEERS Peer Evaluation System (KSU CCSE capstone)
**Milestone:** 1 — Assessment & Planning, 14 Sep – 4 Oct 2026
**Review meeting:** Monday 28 September 2026
**Prepared by:** Khoa Ho (M4, team leader) for the team · 27 September 2026
**Sponsor / advisor:** Dr. Geetika Vyas / Ying Xie
**Repository:** [IT7993-FALL-2026-PEERS/ProjectPeerEvaluation](https://github.com/IT7993-FALL-2026-PEERS/ProjectPeerEvaluation), `main` at `cccaf4f`

---

## 1. Summary

- **Assessment:** the inherited application is now documented end to end: architecture,
  technology stack, API, database, deployment, containerization and test coverage, with a
  log of 21 defects and 12 critical business workflows.
- **CI/CD design approved:** the sponsor approved the pipeline design in the README on
  25 September.
- **Ahead of schedule:** several Milestone 2 and 3 items are already running:
  - **CI** on every pull request, with 4 required checks that block merging;
  - **140 backend and 30 frontend unit tests;**
  - **dependency and security scanning,** report-only for now;
  - **a live staging environment** on Render.com that deploys `main` once CI passes.
- **The application is safer than we found it.** The most important fixes:
  - one professor could open, edit or delete another professor's courses;
  - spreadsheet exports could run formulas;
  - email certificate checking was switched off;
  - the backend had 8 vulnerable dependencies.
  All are fixed and verified.
- **Still open this week (due by 4 Oct):**
  - M2's development-environment review and containerization recommendations: drafted
    26 Sep, to be merged, and the environment review needs one live run on a clean machine;
  - the automated testing strategy and the final technical assessment report (M3);
  - sponsor confirmation of the critical-workflow priorities.
- **Needed from the sponsor:** answers to 8 questions in [section 7](#7-questions-for-the-sponsor),
  most importantly about grade integrity: three problems in how student evaluations are
  submitted and stored.

---

## 2. Milestone 1 deliverables

The deliverables listed in the sponsor's project description, with where each one lives.

| # | Deliverable | Status | Evidence | Owner |
|---|---|---|---|---|
| 1 | Application architecture review | ✅ Done | [system-architecture.md](../architecture/system-architecture.md), [api-documentation.md](../architecture/api-documentation.md), [tech-stack-analysis.md](../research-report/tech-stack-analysis.md) (PR #52) | M1 (written by M4, M1 reviewing) |
| 2 | Technical assessment report | 🟡 Draft | [technical-assessment-report.md](../technical-assessment/technical-assessment-report.md) (PR #17), with contributing reviews from M2, M4 and M5 | M3 |
| 3 | Requirements validation | 🟡 Draft | [requirements.md](../requirements/requirements.md): 23 functional requirements with acceptance criteria (PR #18) | M3 |
| 4 | Critical workflow identification | 🟡 Awaiting sponsor | [critical-workflows.md](../requirements/critical-workflows.md): CW-01 to CW-12, each traced to code and requirements, with proposed priorities (PR #26) | M1 |
| 5 | Requirements Traceability Matrix | 🟡 Skeleton | [rtm.md](../requirements/rtm.md): every requirement mapped to its workflow; the test-case column is filled in as tests land (PR #26) | M3 |
| 6 | Development environment validation | 🟡 Drafted 26 Sep | `docs/dev-environment-review.md` (PR #54, closed before merging; to be resubmitted): setup traced end to end, 7 manual steps and 6 quick fixes listed. One live run on a clean machine still to do | M2 |
| 7 | Containerization assessment | 🟡 Assessment done, recommendations drafted 26 Sep | [containerization-and-test-coverage-review.md](../technical-assessment/containerization-and-test-coverage-review.md) (PR #3), [deployment-review.md](../deployment-review.md), and `docs/containerization-recommendations.md` (PR #54, to be resubmitted): Dockerfiles, a MongoDB-based Compose file, health checks, environment and startup docs | M4, M2 |
| 8 | CI/CD architecture design | ✅ Done, sponsor-approved 25 Sep | README [CI/CD Pipeline](../../README.md#cicd-pipeline) section, with overview and detailed (WF01–WF12) diagrams (PRs #10, #24, #51) | M1 |
| 9 | Automated testing strategy | 🟡 Frontend part done; full strategy due 4 Oct | [frontend-testing-strategy.md](../testing-strategy/frontend-testing-strategy.md) (PR #2) | M3 (M4 frontend input) |

**Also delivered:**
- **Database review:** [database-schema.md](../architecture/database-schema.md) (M5, PR #12).
- **Team guide:** [team-guide.md](../team-guide.md) (PR #19).
- **Pull request template** (PR #14).

**Gantt timing:** the architecture review (#1) finished on 26 Sep, a week after its planned
week of 14 Sep. Every other open item is scheduled for the week of 28 Sep, so it's on time
if finished by 4 Oct. M2's two drafts (#6, #7) were written on 26 Sep and only need to be
merged.

---

## 3. What the assessment found

**Architecture.** PEERS is a three-tier web app: a React 19 single-page app, an Express 4
REST API with 47 endpoints, MongoDB with 6 collections, and SMTP email. Professors log in
with a password and a 1-hour token. Students never log in: a personal link in an
invitation email is their only credential.

**Baseline when we started (14 Sep):**
- no automated tests anywhere;
- no CI or CD;
- manual deployment through the Render dashboard;
- a `docker-compose.yml` for PostgreSQL, although the app uses MongoDB, and no Dockerfiles;
- a real `.env` file committed to the repository;
- five documentation files that were empty placeholders.

**Defects.** The technical assessment report logs 21 defects (D-01 to D-21). This review
added the API and architecture findings in
[api-documentation.md §13](../architecture/api-documentation.md#13-known-api-issues) and
[system-architecture.md §8](../architecture/system-architecture.md#8-architecture-findings).
The most important open ones:

| ID | Finding | Why it matters |
|---|---|---|
| API-2 | A student's submission isn't checked against their team: they can rate themselves, rate a non-teammate, or rate one teammate twice | Changes grades |
| API-1 | Student evaluation links use a non-cryptographic random generator and never expire | The link is the student's only credential |
| API-3 | Uploading a roster deletes every evaluation already submitted in the course | Silent loss of student work |
| D-17 | Multi-factor authentication appears in the data model but can't be completed | A professor who enables it is locked out |
| CW-11 | Anyone can register a professor account | Needs a sponsor decision |

**Technology stack.** Node, React and MongoDB match the sponsor's suggested stack; Docker
is the gap. The frontend build tool, Create React App, is no longer maintained and
accounts for all 29 remaining frontend dependency warnings. We recommend keeping it for
this project (replacing the stack is out of scope) and recording those findings as
accepted build-time risks.

---

## 4. Ahead of schedule

Work from Milestones 2 and 3 that is already running on `main`:

| Planned for | Item | Where it stands |
|---|---|---|
| M2, week of 19 Oct | CI workflow: install, build, static analysis | **Live** (`.github/workflows/ci.yml`): lint, unit tests, build, end-to-end smoke test, workflow lint |
| M2, week of 26 Oct | Quality gates that block merging | **Live**: branch ruleset on `main` requires a pull request and 4 passing checks |
| M2, weeks of 5–12 Oct | Unit tests | **Started**: 140 backend tests (`node:test`) and 30 frontend tests (Jest + React Testing Library), all in CI |
| M2, week of 19 Oct | Dependabot + OWASP Dependency-Check | **Live, report-only**: weekly Dependabot updates; the OWASP scan runs on every pull request |
| M3, week of 9 Nov | Automated deployment to staging | **Partly live**: Render deploys `main` after CI passes (`render.yaml`); the CI-driven deploy of the tested commit comes in Milestone 3 |
| M3, week of 16 Nov | Deployment health check | **Partly live**: `/api/health` checks the database and reports the deployed commit; Render uses it before switching traffic |

**Staging environment:** Render.com (team-proposed, sponsor-approved), MongoDB Atlas, and
a Mailtrap test inbox, so no real student ever receives an email from staging. Verified
end to end on 25 Sep:
- register a professor, receive the reset email, reset the password and log in;
- create a course, add 3 students and send invitations;
- a student submits their evaluation;
- reminders go to the other two.

---

## 5. Defects fixed during Milestone 1

Found while testing the application and the new staging environment. Each fix has an
automated test and was checked on staging.

| Area | What was wrong | Fixed in |
|---|---|---|
| Security | Any logged-in professor could read, edit or delete another professor's course, roster and reports, and email its students | PR #50 |
| Security | Editing a course could change its owner | PR #50 |
| Security | Report CSV export: names with commas broke the columns, and names starting with `=` ran as spreadsheet formulas | PR #45 |
| Security | SMTP certificate checking was switched off; backend dependencies had 8 known vulnerabilities (now 0) | PRs #43, #49 |
| Security | Frontend dependencies had 64 warnings, 2 critical (now 29, 0 critical) | PR #53 |
| Security | Logged-out visitors could see the professor dashboard; logout didn't clear the session token | PR #37 |
| Security | The server started in production without a login-token secret | PR #16 |
| Evaluations | A failed check partway through a submission saved some evaluations and then locked the student out (FR-16) | PR #27 |
| Evaluations | Emailed evaluation and password-reset links opened the login page | PR #32 |
| Email | Batch invitations failed after the first email, but the page reported success | PRs #33, #34 |
| Reports | Team averages were always empty | PR #46 |
| Reports | Flagging ignored the professor's own list of concerning words (FR-22) | PR #47 |
| Reliability | `/api/health` said OK even with the database down | PR #22 |
| Maintenance | Hard-coded backend URL, duplicate routes, dead files | PRs #30, #48 |

Resolved defects from the log:
- **D-07:** the Node version is 24 everywhere.
- **D-15:** backend unit tests now exist.
- **D-08:** 3 of 6 placeholder documents are written.
- **D-20 should be corrected:** CSV export does exist.

---

## 6. Risks

| Risk | Impact | Mitigation |
|---|---|---|
| No Dockerfiles yet | The planned CD design builds Docker images once and deploys them; Milestone 3 depends on it | M2's recommendations (drafted 26 Sep) give the plan; the Dockerfile and Compose tasks start 5 Oct |
| Integration tests need a real MongoDB in CI | Blocks the integration and regression tests (weeks of 12–19 Oct) | Decide by 5 Oct between a MongoDB container in CI and an in-memory MongoDB |
| Testing workload | M5 owns 6 testing tasks in Milestone 2, and the student and team code has the least test coverage (5–8%) | Rebalance at the Milestone 2 kickoff; the frontend and CI owners can take some |
| Email limits on staging | Mailtrap's free plan allows 50 emails a month, one every 10 seconds, so a send covers about 16 students before the page times out | End-to-end tests will not send real email; background sending is a Milestone 3 improvement |
| Unmaintained build tool (Create React App) | 29 remaining dependency warnings | Accept as build-time risk during the OWASP triage (week of 19 Oct); recommend a migration as future work |
| Work concentrated in few members so far | Delivery depends on a small number of people | Milestone 2 tasks are assigned across all five members in the Gantt chart and tracked weekly |

---

## 7. Questions for the sponsor

1. **Critical workflows:** do you agree with the proposed priorities for CW-01 to CW-12,
   and should AI-assisted feedback (CW-10) and rubric management (CW-12) be in scope?
2. **Grade integrity:** may we fix API-2 (submissions not limited to real teammates) and
   API-1 (weak, non-expiring student links) as defects in Milestone 2?
3. **Roster re-upload:** should uploading a corrected roster keep the evaluations already
   submitted (API-3)? Today it deletes them.
4. **Professor registration (CW-11):** should anyone be able to create a professor
   account, or should accounts be invited or approved?
5. **Requirement mismatches:** for each, should the code or the requirement change?
   - participation is rated 1–4, not 1–5 (D-19);
   - feedback needs 10 characters, not 50–500 (FR-14);
   - sessions last 1 hour, not 30 minutes (D-18).
6. **Multi-factor authentication (D-17):** implement it, or remove the partial feature?
7. **Profile editing:** professors can't change their name, email or password while
   logged in. It isn't in any requirement. Leave it out, as a new feature?
8. **Hosting:** is the Render staging environment, paid by the team leader, acceptable
   for the rest of the project, with production staying out of scope behind the manual
   approval gate?

---

## 8. Plan for Milestone 2 — Quality Automation (5 Oct – 1 Nov, review 26 Oct)

From the approved Gantt chart:

| Week of | Planned | Owner |
|---|---|---|
| 5 Oct | One-command local environment; Dockerfiles for frontend and backend; unit tests for frontend components and backend auth rules | M2, M4, M5 |
| 12 Oct | Docker Compose with health checks; startup documentation; unit tests for tokens, CSV and scoring; integration tests frontend – backend – database | M2, M3, M5, M4 |
| 19 Oct | Integration tests for authentication and email; functional regression tests; CI workflow; security scanning (triage and gate) | M5, M1, M3 |
| 26 Oct | End-to-end instructor and student workflows; wire all tests into CI; enforce quality gates | M5, M4, M1 |

Parts of the 19 and 26 October work are already live (section 4), so the team will
use that time to finish the security gate, add coverage reporting and fix the
grade-integrity defects the sponsor approves.

**Decisions needed by 5 Oct:**
- **The MongoDB approach for integration tests.**
- **What Docker is for.** M2's draft recommends scoping Docker to local development. The
  sponsor's CD requirement (§7) asks the pipeline to build Docker images, and the approved
  design deploys those images to Render, which means recreating the Render services.
  The team needs to settle this before the Dockerfiles are written.
- **The testing workload split.**

---

## 9. Metrics (27 September)

| Measure | Value |
|---|---|
| Pull requests merged | 51 (since 19 Sep), each through CI and the branch ruleset |
| Required CI checks on `main` | 4 (frontend, backend, end-to-end, workflow lint), plus a report-only OWASP scan |
| Automated tests | 140 backend + 30 frontend + 1 end-to-end smoke test, all passing |
| Backend test coverage by module | reports 93%, authentication 90%, courses 68%, evaluations 32%, teams 8%, students 5% |
| Dependency vulnerabilities | backend 0; frontend 29 (0 critical), all through Create React App |
| Staging | live; backend on Render Starter, frontend static site, MongoDB Atlas, Mailtrap |
| Defects logged / fixed | 21 in the assessment log, plus 8 API issues and 8 architecture findings (partly overlapping); 14 fixes merged (section 5) |
