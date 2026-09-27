# Automated Testing Strategy

**Owner:** Laeticia Neno Aloyem (M3) — Requirements, QA, security & documentation
**Milestone:** 1 — Assessment & Planning (14 Sep – 4 Oct 2026), review 28 Sep
**Gantt task:** CI/CD & Testing Strategy Design — *"Draft automated testing strategy (unit / integration / regression / e2e / smoke)"*
**Status:** Draft for team review — decisions marked **[DECISION]** need agreement before Milestone 2 starts on 5 Oct
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
different coverage mechanisms and two report formats to merge. See [DECISION 1].

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

**Constraint.** Both depend on a running application with a seeded database, so they are
gated on M2's containerization work. `e2e/setup.spec.js` currently only verifies the
Playwright installation — it is scaffolding, not a test of the app.

### 2.5 Smoke tests

**Purpose.** After a deploy, answer one question quickly: is the thing that just went out
actually alive? Not comprehensive — fast and decisive, so a bad deploy is caught in seconds
rather than by a user.

**Owner.** M5 Kylee, wired into the CD pipeline by M1/M2.

**Checks.** `GET /api/health` returns 200 with its JSON status; the frontend root serves the
application shell; one unauthenticated read-only endpoint responds. Three checks, under thirty
seconds total.

**Note.** `/api/health` already exists in `src/backend/index.js` and nothing currently calls
it. Per M2's deployment review this is the smallest gap in the whole pipeline — the endpoint
is ready, it just needs to be invoked after deploy.

## 3. What the pipeline enforces

Current required checks on `main`: frontend lint, frontend unit tests, frontend build,
backend syntax check, backend unit tests, Playwright, workflow lint.

Proposed additions, in the order they should land:

| Addition | Gate | When | Owner |
|---|---|---|---|
| Coverage collection and reporting on every PR | Report only at first | Milestone 2, early | M3 |
| Coverage threshold enforced | Fails the PR below the agreed floor | Milestone 2, once a baseline is measured | M3 |
| Integration tests | Required check | Milestone 2 | M1 wires, M4/M5 write |
| Regression tests | Required check | Milestone 2–3 | M1 wires, M5 writes |
| E2E against a running app | Required check | Milestone 3 | M1 wires, M4/M5 write |
| Post-deploy smoke tests | Blocks release-candidate tagging | Milestone 3 | M2/M5 |
| OWASP Dependency-Check with `--failOnCVSS 7` | Required check | Milestone 2, after triage | M3 |

The last one needs saying plainly: `security.yml` already runs OWASP Dependency-Check and
Dependabot is configured, but the scan is report-only because the first run surfaced existing
high and critical findings — 113 alerts are open. Turning it into a gate means triaging those
first and writing a suppressions file for accepted risks. That is M3 work in Milestone 2, and
it is larger than it looks.

## 4. Coverage

**Proposed floor: 70% of lines and branches on both frontend and backend, enforced per pull
request** — with the threshold ratcheted upward as coverage rises, never downward. [DECISION 2]

Why 70 rather than a higher number: the baseline has not been measured yet, and a threshold
set above where the code actually sits fails every pull request on day one, at which point
someone disables it. The honest sequence is measure first, set the floor just below the
measurement, then raise it.

Coverage is a floor, not a goal. A suite at 90% that never asserts the acceptance criteria in
`requirements.md` is worth less than one at 60% that does. The RTM, not the coverage number,
is the measure of whether requirements are actually proven.

## 5. Traceability

Every test links back to a requirement through `docs/requirements/rtm.md`. When a test is
written, its ID goes in that requirement's row.

**Test case ID convention: `TC-<FR number>-<sequence>`** — so the second test covering FR-06
is `TC-06-02`, and the ID appears in the test's name. A failing test then points straight at
the requirement it broke, without anyone having to go and look it up. [DECISION 3]

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
starts from the same known state. [DECISION 4] Owner to be assigned; naturally M5's, as it
sits with the backend and database work.

## 7. Decisions needed before 5 October

1. **[DECISION 1]** Keep two test runners (`node --test` for the backend, Jest for the
   frontend), or standardise on one? Two is workable but means merging two coverage formats.
   Recommendation: keep both, and have CI merge the reports — switching runners mid-project
   costs more than it saves.
2. **[DECISION 2]** Is 70% the agreed coverage floor, measured per package and ratcheted
   upward only?
3. **[DECISION 3]** Adopt `TC-<FR>-<sequence>` as the test naming convention, so test names
   trace to requirement IDs?
4. **[DECISION 4]** Who owns the shared test-data seed module, and is a single shared fixture
   the right approach?
5. Playwright is recorded as the E2E tool, superseding M4's open question 3. Objections before
   5 Oct.

## 8. Open items carried from M4's frontend strategy

Two of M4's open questions affect more than the frontend and belong to the team:

- `ProtectedRoute` is currently a passthrough with no real guard logic, so route protection
  is untested because it does not exist. This is an authorization gap, not only a testing
  one, and should be raised with the sponsor alongside the MFA question (D-17).
- `CourseManagement.js` is 2,687 lines. Testing it meaningfully means splitting it first.
  That is refactoring work nobody currently owns, and it will otherwise become the reason
  the coverage threshold cannot be met.

## Related documents

- `docs/requirements/requirements.md` — acceptance criteria the tests assert against
- `docs/requirements/rtm.md` — the matrix linking requirements to test cases
- `docs/requirements/critical-workflows.md` — the workflows regression and E2E tests cover
- `docs/technical-assessment/technical-assessment-report.md` — defects referenced above
- `docs/testing-strategy/frontend-testing-strategy.md` — M4's frontend detail
- `.github/workflows/ci.yml`, `.github/workflows/security.yml` — what runs today
