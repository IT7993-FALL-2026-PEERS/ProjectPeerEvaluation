# Automated Testing Strategy

**Owner:** Laeticia Neno Aloyem (M3) — Requirements, QA, security & documentation
**Milestone:** 1 — Assessment & Planning (14 Sep – 30 Sep 2026), review 28 Sep
**Gantt task:** CI/CD & Testing Strategy Design — *"Draft automated testing strategy (unit / integration / regression / e2e / smoke)"*
**Status:** Final for Milestone 1 — the four decisions in §7 were confirmed on 27 Sep 2026 by the team leader (M4), following this document's recommendations; the team can revisit any of them at the Milestone 2 kickoff on 5 Oct.
**Last updated:** 27 September 2026

## Purpose and scope

The specification requires "a comprehensive automated testing strategy for the inherited
application," with testing that "shall become an integral part of the software delivery
process and be executed automatically by the CI/CD pipeline."

This document is the team-wide strategy across all five test levels. It says what each
level is for, who owns it, what it runs against, and what has to be true before a change
reaches `main`. It sits above two level-specific documents that go into more detail:

- `docs/testing-strategy/frontend-testing-strategy.md` — M4's frontend plan
- Backend testing detail — M5, pending

Where those documents disagree with this one, raise it rather than picking a side; the
point of this document is that the levels do not overlap or leave gaps.

## 1. Where we actually are

Measured against `main` on 27 September, not against the Milestone 1 baseline.

| Level | State | Where |
|---|---|---|
| Unit — backend | 15 test files using Node's built-in `node --test` | `src/backend/tests/` |
| Unit — frontend | 8 test files using Jest + React Testing Library | `src/frontend/**/__tests__/` |
| Integration | None yet as a distinct level | — |
| Regression | None | — |
| End-to-end | Playwright installed; one spec that verifies the install, not the app | `e2e/setup.spec.js` |
| Smoke | None as a post-deploy step | — |

Running automatically on every pull request, via `.github/workflows/ci.yml`: frontend lint,
frontend unit tests, frontend build, backend syntax check, backend unit tests, the Playwright
job, and a workflow lint. All are required checks on `main`.

**The single biggest gap is not a missing level — it is that nothing measures coverage.**
No `coverageThreshold` is configured in either package, and no CI step collects or reports
coverage. So the suite can grow while the proportion of the application it actually exercises
falls, and nobody would see it. Closing that is an M3 task in Milestone 2.

**Two test runners are in use.** The backend uses `node --test`; the frontend uses Jest via
Create React App. That is workable — they test different codebases — but it means two
different coverage mechanisms and two report formats to merge. See [Decision 1, confirmed in §7].

## 2. Test levels

### 2.1 Unit tests

**Purpose.** Prove one function or one component behaves correctly in isolation, including
at its edges. Fast enough that nobody minds running them constantly.

**Owners.** M4 Khoa (frontend), M5 Kylee (backend).

**Runs against.** No database, no network, no browser. Dependencies stubbed.

**Priority targets** — driven by the requirements that are defective or unverified in
`docs/requirements/requirements.md`, because those are where behaviour is least certain:
rating-range validation (FR-13, D-19), feedback length validation (FR-14, D-22), evaluation
token generation (FR-09), CSV row parsing and duplicate filtering (FR-06, FR-07), score
averaging and standard deviation (FR-18, FR-20), and session expiry (FR-04, D-18).

**Convention.** Colocated in `__tests__` next to the file under test on the frontend;
`src/backend/tests/` on the backend, following what each side already does.

### 2.2 Integration tests

**Purpose.** Prove that components work together across a real boundary — frontend to
backend, backend to database, backend to email. Most of the defects found in Milestone 1
live at boundaries, not inside single functions, so this level earns its keep.

**Owners.** M5 Kylee (backend ↔ database ↔ email), M4 Khoa (frontend ↔ mocked HTTP boundary).

**Runs against.** An ephemeral test database, seeded per run and torn down after. Email is
stubbed at the transport, not at the application layer, so the message-building code is
actually exercised.

**How it runs (CICD-21, ADR 0001).** `cd src/backend && npm run test:integration` starts a one-member
MongoDB replica set with `mongodb-memory-server`, pinned to the staging Atlas version (8.0.x), so transactions work as on Atlas.
The tests live in `src/backend/integration/` and end in `.integration.js`, so `npm test` stays fast and database-free.
The shared seed is `integration/helpers/seed.js` (two professors, two courses, five students, two teams). Each test file
starts its own database and clears and re-seeds it before every test. CI runs them in the job `Integration (real MongoDB)`.

**Note on the two meanings of "integration."** M4's document uses the term for frontend
page flows with the network mocked by MSW; this document's sense is real service-to-service
interaction. Both are worth having. To keep them distinct in reporting, M4's are named
*frontend integration* and M5's *service integration*.

**Priority targets.** Roster CSV upload end to end (FR-06, FR-07); team assignment, which
writes membership in two places that can drift (FR-08, D-10); evaluation submission
including the duplicate guard under concurrent requests (FR-16); invitation email content
and link correctness (FR-10); and report generation from stored evaluations (FR-17, FR-18).

### 2.3 Functional regression tests

**Purpose.** Prove that the workflows the sponsor depends on still work after every change.
This is the level the specification ties directly to critical workflows: "for each critical
workflow, students shall implement automated regression tests that verify the expected
behavior of the application after every code change."

**Owner.** M5 Kylee.

**Runs against.** The same environment as integration tests.

**Scope.** One regression test per critical workflow in
`docs/requirements/critical-workflows.md` (CW-01 to CW-12). Those workflows carry proposed
priorities that the sponsor has not yet confirmed, so the set is provisional: once priorities
are agreed, every workflow marked Critical must have a regression test before Milestone 3
closes, and lower-priority ones are covered if time allows.

**Distinction from integration tests.** An integration test asks "do these two parts talk
correctly?" A regression test asks "does this whole business workflow still do what the
sponsor expects?" The second is written from the acceptance criteria in `requirements.md`,
not from the code.

### 2.4 End-to-end tests

**Purpose.** Drive the real application through a browser as a real user would, catching
the failures that only appear when everything is wired together.

**Owners.** M4 Khoa (student workflow), M5 Kylee (instructor workflow).

**Tool.** Playwright — already installed, already running in CI, and Playwright's device
emulation is the practical way to check the mobile-responsive criterion in user story US-S1.
M4's document raised Cypress versus Playwright as an open question; it is effectively settled
by the installation, and this document records Playwright as the decision unless someone
objects before 5 Oct.

**Scenarios.** Student: open the emailed link, complete the rubric, submit, confirm, then
re-open the link and confirm it shows as already completed. Instructor: log in, create a
course, upload a roster, create teams, launch evaluations, watch completion, view the report.

**How it runs (CICD-26).** `npm run build`, then `E2E_START_SERVER=1 npm run test:e2e`. Playwright
starts two servers from `e2e/server/`: the real backend on a seeded in-memory MongoDB (the same
fixture as the integration tests, with email captured, never sent) and the frontend build as
static files. A small control server resets the data before each test and returns the captured
email, so the student tests take the link from the invitation email. Specs: `e2e/instructor.spec.js`
(E2E-01 to 09: login, session, roster upload and its error message, teams, invitations, reports,
CSV download) and `e2e/student.spec.js` (E2E-10 to 14: opening the link without a login, rating and
submitting, the professor's count, no second submission, a bad link, missing feedback). The run
refuses to start if another server already holds port 5000 or the build points at a hosted
backend, so it can never reach a real database or mail account. Without
`E2E_START_SERVER` only `e2e/setup.spec.js` (the Playwright install check) runs. In CI this is the
required job `E2E smoke (Playwright)`.

### 2.5 Smoke tests

**Purpose.** After a deploy, answer one question quickly: is the thing that just went out
actually alive? Not comprehensive — fast and decisive, so a bad deploy is caught in seconds
rather than by a user.

**Owner.** M5 Kylee, wired into the CD pipeline by M1/M2.

**Checks.** `GET /api/health` returns 200 with its JSON status; the frontend root serves the
application shell; one unauthenticated read-only endpoint responds. Three checks, under thirty
seconds total.

**Current state.** `/api/health` exists in `src/backend/index.js` and **Render already polls
it** — `render.yaml` sets `healthCheckPath: /api/health`, so the platform will not route
traffic to an instance that fails its health check. M2's deployment review predates that
configuration.

What is still missing is a **dedicated post-deploy smoke job in the pipeline**: Render's
health check tells the platform the process is up, but it does not assert that the frontend
serves, that a read-only endpoint responds, or that the deploy is fit to be tagged a release
candidate. That job is the remaining gap, and it is smaller than "no health check exists"
would have implied.

## 3. What the pipeline enforces

Current required checks on `main`: frontend lint, frontend unit tests, frontend build,
backend syntax check, backend unit tests, Playwright, workflow lint.

Proposed additions, in the order they should land:

Schedule follows the sponsor's own placement of integration, regression and end-to-end
implementation in Milestone 2. Nothing here proposes moving that.

| Addition | Gate | When | Owner |
|---|---|---|---|
| Coverage collection and reporting on every PR | Report only at first | Milestone 2, early | M4 implements, M3 sets policy |
| Coverage threshold enforced | Fails the PR below the agreed floor | Milestone 2, once a baseline is measured | M3 owns the threshold |
| Integration tests | Required check | Milestone 2 | M1 wires, M4/M5 write |
| Regression tests | Required check | Milestone 2 | M1 wires, M5 writes |
| E2E against a running app | Required check | Milestone 2 | M1 wires, M4/M5 write |
| Post-deploy smoke job | Blocks release-candidate tagging | Milestone 3, with the CD pipeline | M2/M5 |
| OWASP Dependency-Check with `--failOnCVSS 7` | Required check | Milestone 2, after triage | M3 |

**On the reporting / policy split.** The README assigns automated test reporting to M4, and
that stands: M4 builds the reporting mechanics — the JUnit and coverage reporters, the CI
step that collects them, and where the artifacts are published. M3 owns the QA policy those
reports feed: what the threshold is, when it is raised, and whether a run below it blocks a
merge. One person builds the instrument, the other decides what reading is acceptable. If
the team would rather one person do both, say so and this document follows.

The last one needs saying plainly: `security.yml` already runs OWASP Dependency-Check and
Dependabot is configured, but the scan is report-only because the first run surfaced existing
high and critical findings — 113 alerts are open. Turning it into a gate means triaging those
first and writing a suppressions file for accepted risks. That is M3 work in Milestone 2, and
it is larger than it looks.

## 4. Coverage

**70% of lines and branches is the target, not the opening threshold.** [Decision 2, confirmed in §7] The
two are separate numbers and conflating them is how coverage gates get disabled in week one.

The sequence:

1. **Measure.** Add coverage collection to CI, reporting only, and record the baseline for
   frontend and backend separately.
2. **Set the opening floor just below that baseline** — low enough that it passes on the day
   it is switched on, high enough that coverage cannot silently fall.
3. **Ratchet upward** as tests land, never downward, until the 70% target is reached.

So the enforced minimum on day one is whatever step 1 measures, minus a small margin. 70%
is where we are heading, and neither number is meaningful until the baseline exists.

**Where it stands (2 Oct 2026, backlog CICD-20).** Every pull request now measures coverage
in the Frontend and Backend CI jobs, writes a table to the job summary, keeps the report as
an artifact (30 days), and fails if a number drops below its floor. The baseline and the
opening floors:

| | Lines | Branches | Functions |
|---|---|---|---|
| Backend baseline | 64.32% | 78.79% | 68.60% |
| Backend floor | 63% | 77% | 67% |
| Frontend baseline | 8.38% | 7.06% | 8.81% |
| Frontend floor | 7% | 6% | 7% |

- **What is measured:** the backend's `controllers`, `middleware`, `models`, `routes`, `utils`
  and `config` folders plus `index.js`; the frontend's `src/frontend` source, excluding tests and
  `index.js`. Tests, seed scripts and migrations are not counted. Source files that no test loads
  still count, as 0%: the backend uses `c8 --all` for this (Node's built-in coverage only sees
  files a test imports, so an untested new controller would not have lowered it; checked with a
  probe file), and Jest's `collectCoverageFrom` does the same for the frontend. A new folder of
  backend source has to be added to the `--include` list in `src/backend/package.json`.
- **Floors live in `coverage-floors.json`** and are checked by `scripts/coverage-gate.js`
  (a missing or unreadable report fails the gate, so a broken run cannot pass).
- **Ratchet rule:** floors only go up. When the job summary says a metric is 5 or more points
  above its floor, raise the floor in the same pull request. Never lower a floor to make a
  build pass; add tests instead.
- **Run it locally:** `npm test -- --watchAll=false --coverage && node scripts/coverage-gate.js frontend`,
  and `cd src/backend && npm run test:coverage && node ../../scripts/coverage-gate.js backend`.
- **The gap is on the frontend** (about 8%): `CourseManagement.js` alone is 2,687 lines and has to
  be split before it can be tested meaningfully (see §8). The backend is already near the target.

Coverage is a floor, not a goal. A suite at 90% that never asserts the acceptance criteria in
`requirements.md` is worth less than one at 60% that does. The RTM, not the coverage number,
is the measure of whether requirements are actually proven.

## 5. Traceability

Every test links back to a requirement through `docs/requirements/rtm.md`. When a test is
written, its ID goes in that requirement's row.

**Test case ID convention: `TC-<FR number>-<sequence>`** — so the second test covering FR-06
is `TC-06-02`, and the ID appears in the test's name. A failing test then points straight at
the requirement it broke, without anyone having to go and look it up. [Decision 3, confirmed in §7]

Seven of the twenty-three requirements cannot be given a passing test today: FR-03, FR-04,
FR-12, FR-13 and FR-14 because the implementation contradicts the requirement, and FR-19,
FR-21 and FR-23 because the feature is absent or partial. Those need sponsor decisions, not
more test effort. They are listed with their evidence in `requirements.md` and `rtm.md`.

## 6. Test data

No fixture system exists. `src/backend/scripts/` holds eleven ad-hoc scripts for seeding and
inspecting data, and there is no migration framework — recorded as D-14 in the technical
assessment.

Proposed: a single seed module that builds a known professor, course, team, roster and
evaluation round, used by integration, regression and end-to-end tests alike, so every level
starts from the same known state. [Decision 4, confirmed in §7] Owner: M5, since it sits
with the backend and database work.

## 7. Decisions (confirmed 27 September 2026)

1. **Test runners — keep both.** `node --test` for the backend and Jest for the frontend.
   CI publishes both coverage reports; switching runners mid-project costs more than it saves.
2. **Coverage — 70% is the target, not the opening threshold.** CI first measures the
   baseline (reporting only), the enforced floor starts just below it, and it only ratchets
   upward (see §4).
3. **Test naming — `TC-<FR>-<sequence>`.** New tests use it from Milestone 2; existing tests
   are renamed when they are next edited, and the RTM switches to these IDs as they appear.
4. **Test data — one shared seed module, owned by M5.** It builds a known professor, course,
   team, roster and evaluation round for integration, regression and end-to-end tests (see
   §6). M4 covers the frontend and end-to-end fixtures.
5. **End-to-end tool — Playwright**, superseding M4's open question 3.

## 8. Open items carried from M4's frontend strategy

One of M4's open questions affects more than the frontend and belongs to the team:

- `CourseManagement.js` is 2,687 lines. Testing it meaningfully means splitting it first.
  That is refactoring work nobody currently owns, and it will otherwise become the reason
  the coverage threshold cannot be met.

**Resolved since M4's document was written.** `ProtectedRoute` is no longer a passthrough —
it reads the stored token and redirects to the login page when there is none
(`src/frontend/components/ProtectedRoute.js`), and it has three tests. Route protection is
implemented and covered; it is not an open gap.

## Related documents

- `docs/requirements/requirements.md` — acceptance criteria the tests assert against
- `docs/requirements/rtm.md` — the matrix linking requirements to test cases
- `docs/requirements/critical-workflows.md` — the workflows regression and E2E tests cover
- `docs/technical-assessment/technical-assessment-report.md` — defects referenced above
- `docs/testing-strategy/frontend-testing-strategy.md` — M4's frontend detail
- `.github/workflows/ci.yml`, `.github/workflows/security.yml` — what runs today
