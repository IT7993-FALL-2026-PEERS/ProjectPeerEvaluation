# Requirements Traceability Matrix

**Status:** Milestone 1 baseline, complete — every functional requirement (FR-01..FR-23) and
every critical workflow (CW-01..CW-12) is traced to its existing automated tests, or to the
test level and Gantt week that will cover it. Statuses match `docs/requirements/requirements.md`.
The critical workflows were approved by the sponsor (25 Sep 2026).
**Last updated:** 27 September 2026, against `main` at `e25d3b6`.

**How to read the test column.** Test cases are named by file and test title until the
`TC-<FR>-<n>` naming convention in `docs/testing-strategy/testing-strategy.md` is adopted;
the rows will then switch to those IDs. `BE` = `src/backend/tests/`, `FE` =
`src/frontend/**/__tests__/`. Counts are executed test cases (140 backend, 30 frontend, 1
end-to-end smoke test on 27 Sep). All of them run in CI on every pull request.

**Planned** rows name the test level and the Milestone 2 week from the approved Gantt chart
(Milestone 2 runs 5 Oct – 1 Nov). A planned test that exposes a defect stays failing, or is
marked `todo`, until the defect is fixed, so the matrix never reports a defect as covered.

| Business requirement ID | Functional requirement ID | Workflow | Test cases (existing) | Test type | Planned coverage | Status |
|---|---|---|---|---|---|---|
| FR1.1 | FR-01 Professor login | CW-01 | BE `authController.test.js`: login ×4, register ×6 · BE `authMiddleware.test.js` ×5 · BE `authRoutes.test.js` ×1 · FE `login.test.js` ×2, `LoginPage.test.js` ×3, `AuthContext.test.js` ×5, `ProtectedRoute.test.js` ×3, `App.routing.test.js` ×4 | Unit | Integration: auth against MongoDB (19 Oct); E2E instructor login (26 Oct) | Needs verification — sponsor to confirm local password login is intended |
| FR1.2 | FR-02 Student access without login | CW-07 | BE `submitEvaluation.test.js` ×3 (token-based submission) | Unit | Integration: `/evaluate/:token` routes (12 Oct); E2E student workflow (26 Oct) | Validated |
| FR1.3 | FR-03 Multi-factor authentication | CW-01 | BE `authController.test.js`: "login: MFA enabled requires verification", "verifyMfa: returns 501" | Unit | Replace the 501 test when D-17 is decided | Defective (D-17) — tests document the gap |
| FR1.4 | FR-04 Session expiry | CW-01 | BE `authController.test.js`: login token expiry (asserts 1 h) · BE `authMiddleware.test.js`: expired token returns 401 | Unit | Update expiry assertion when D-18 is decided | Defective (D-18) — 1 h, requirement says 30 min |
| FR2.1 | FR-05 Create and manage courses | CW-03 | BE `courseController.test.js` ×19 · BE `courseOwnership.test.js` ×32 (every course route rejects other professors) | Unit + route-level | Integration: course CRUD against MongoDB (12 Oct); E2E create course (26 Oct) | Validated |
| FR2.2 | FR-06 Bulk roster upload | CW-04 | — | — | Unit: CSV parsing (12 Oct, M5); Integration: upload creates students and teams (12 Oct) | Validated (manually, staging 25 Sep) |
| FR2.3 | FR-07 Roster validation and duplicates | CW-04 | — | — | Unit: CSV/row validation and duplicate handling (12 Oct, M5) | Validated (manually) |
| FR2.4 | FR-08 Assign students to teams | CW-05 | BE `reportController.test.js`: team averages include populated team members | Unit | Integration: team assignment keeps `Team.students` and `Student.team_id` in step (D-10) (12 Oct) | Validated |
| FR3.1 | FR-09 Per-student evaluation forms | CW-06 | — | — | Unit: evaluation token generation (12 Oct, M5); Integration: `GET /evaluate/:token` (12 Oct) | Validated |
| FR3.2 | FR-10 Email invitations with secure links | CW-06 | BE `sendEvaluations.test.js` ×1 · BE `emailPacer.test.js` ×3 · BE `emailUtils.test.js` ×2 · FE `emailResult.test.js` ×4 | Unit | Integration: email service with a test SMTP transport (19 Oct, M5) | Needs verification — depends on SMTP and `FRONTEND_URL` at deploy time (verified on staging 25 Sep) |
| FR3.3 | FR-11 Track completion status | CW-08 | — | — | Integration: `GET /evaluations/status` (19 Oct); E2E monitor completion (26 Oct) | Validated |
| FR3.4 | FR-12 Reminders | CW-08 | — | — | Integration: `POST /evaluations/remind` (19 Oct) | Defective — on-demand only, no scheduler |
| FR4.1 | FR-13 Ratings on a 1–5 scale | CW-07 | BE `submitEvaluation.test.js`: "fails schema validation" (participation 5 rejected) · BE `reportController.test.js`: participation scaled by 5/4 | Unit | Update when D-19 is decided | Defective (D-19) — participation is 1–4 |
| FR4.2 | FR-14 Feedback length limits | CW-07 | BE `submitEvaluation.test.js`: "fails the feedback check" (10-character minimum) | Unit | Update when D-22 is decided | Defective (D-22) — 10-character minimum, no maximum; requirement says 50–500 |
| FR4.3 | FR-15 Timestamp all submissions | CW-07 | — | — | Unit: `submitted_at` set on save (12 Oct) | Validated |
| FR4.4 | FR-16 Prevent duplicate submissions | CW-07 | BE `submitEvaluation.test.js` ×3 (all-or-nothing save, PR #27) | Unit | BE `integration/submission.integration.js` (TC-16-20..27), `atomicSubmission.*.integration.js` (TC-16-30..34), `duplicateEvaluations.integration.js` (TC-16-36, 37) | Validated |
| FR5.1 | FR-17 Aggregated team reports | CW-09 | BE `reportController.test.js`: course report, team report, team averages | Unit | Integration: report from seeded data (19 Oct); E2E review results (26 Oct) | Validated |
| FR5.2 | FR-18 Average score per criterion | CW-09 | BE `reportController.test.js`: scoring, letter grades, curved grading | Unit | Regression: report totals for a fixed fixture (19 Oct) | Validated |
| FR5.3 | FR-19 Downloadable reports | CW-09 | BE `reportController.test.js`: CSV download ×3 · BE `csv.test.js` ×10 (quoting, formula protection) | Unit | PDF export has no test until it is built | Partial — CSV works, PDF missing |
| FR5.4 | FR-20 Highlight outliers | CW-09 | — | — | Unit: outlier statistic (19 Oct) once its display is confirmed | Needs verification |
| FR6.1 | FR-21 Summarise textual feedback | CW-10 | — | — | None — AI features are out of scope | Unsupported |
| FR6.2 | FR-22 Flag concerning language | CW-09 | BE `reportController.test.js`: AI flags ×2, professor word list ×8 (PR #47) | Unit | Regression: flagged feedback in a fixed fixture (19 Oct) | Validated |
| FR6.3 | FR-23 Sentiment trends | CW-10 | — | — | None — AI features are out of scope | Unsupported |
| *(implementation only)* | — | CW-02 Password reset | BE `authController.test.js`: resetPassword ×3, updatePassword ×5 · BE `emailUtils.test.js`: reset email link · FE `ResetPassword.test.js` ×3 · FE `App.routing.test.js`: reset link opens the reset page | Unit | Integration: reset against MongoDB (19 Oct) | Validated |
| *(implementation only)* | — | CW-11 Professor self-registration | BE `authController.test.js`: register ×6 | Unit | Integration: register + login (19 Oct) | Needs verification — sponsor to confirm public sign-up is intended |
| *(sponsor spec only)* | — | CW-12 Rubric management | — | — | Unit: rubric validation (12 Oct, M5) once the scope is decided | Planned (D-09) — rubric is hardcoded |

## Tests that cover non-functional requirements

These tests have no FR row because they check how the system runs, not what it does. They
trace to the sponsor's non-functional requirements (reliability, repeatable deployments,
security) and to fixed defects.

| Concern | Test cases | Traces to |
|---|---|---|
| Authorization: a professor can use only their own courses | BE `courseOwnership.test.js` ×32, `courseController.test.js`: "only saves the editable fields" | Security fix, PR #50 |
| Deployment health check | BE `health.test.js` ×7 | `/api/health` used by Render and the planned CD pipeline |
| Configuration safety | BE `env.test.js` ×4 (production refuses a missing or short `JWT_SECRET`) | D-03, PR #16 |
| Server behind Render's load balancer | BE `serverTimeouts.test.js` ×2 | PR #30 |
| Frontend API address | FE `apiUrl.test.js` ×5 | PR #30 |
| CI can launch a browser | E2E `e2e/setup.spec.js` ×1 | Pipeline smoke; real E2E workflows planned 26 Oct |

## Coverage summary (27 Sep)

| | Requirements |
|---|---|
| Covered by existing automated tests | 16 of 26 rows (FR-01..05, FR-08, FR-10, FR-13, FR-14, FR-16..19, FR-22, CW-02, CW-11) |
| Planned for Milestone 2, with a test level and week | 8 rows (FR-06, FR-07, FR-09, FR-11, FR-12, FR-15, FR-20, CW-12), plus integration and E2E tests for most covered rows |
| Out of scope | 2 rows (FR-21, FR-23: AI features) |

Every **Validated** requirement without an existing automated test (FR-06, FR-07, FR-09,
FR-11, FR-15) has a planned test in Milestone 2, which meets the sponsor's §9 requirement
that each validated business requirement is verified by one or more automated tests once
Milestone 2 closes.

**FR-16.** Fixed in CICD-33. A submission is saved in one transaction (or, on a database
without transactions, saved one by one and rolled back on failure), and a unique index on
`Evaluation` (evaluator, student, course) makes two simultaneous submissions save once.
`integration/atomicSubmission.*.integration.js` (TC-16-30 to TC-16-34, run on a replica set and
on a standalone `mongod`) covers concurrent submits, a failure after the ratings are written, the
index, and resubmitting after a reset; `duplicateEvaluations.integration.js` covers the
pre-deploy check. The earlier partial-save lockout (PR #27) is covered by `submitEvaluation.test.js`.

## Maintaining this matrix

- Add the test file and title to the row when a test lands, and move the row out of
  "Planned coverage" once the planned test exists.
- Switch to `TC-<FR>-<n>` IDs once the testing strategy's naming decision is adopted.
- Keep the Status column in step with `requirements.md`; correct both in the same PR.
