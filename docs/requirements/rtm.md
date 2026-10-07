# Requirements Traceability Matrix

**Status:** Milestone 1 baseline (27 Sep), brought up to date on 7 Oct 2026 (backlog CICD-23): every
functional requirement (FR-01..FR-23) and every critical workflow (CW-01..CW-12) is traced to named
automated tests, or says why there are none. Statuses match `docs/requirements/requirements.md`.
The critical workflows were approved by the sponsor (25 Sep 2026).
**Last updated:** 7 October 2026, against `main` at `0fb8f60`.

**How to read the test column.** Every test the matrix cites by ID is the start of a test title in the
code, and `npm test` fails if it is not (see *Keeping the IDs honest* below).

- `TC-<FR>-<n>` is a backend unit or integration test written for functional requirement FR-`<FR>`,
  for example `TC-16-23` is a test for FR-16. The tests for the CI and tooling work use the backlog
  number of the task instead (`TC-20-01..19` is the coverage gate, CICD-20; `TC-29-nn` is the
  reporting, CICD-29; `TC-50-nn` is the one-command setup, CICD-50), and `TC-SEC-nn` is the security
  policy. Those appear only in the non-functional table below, so a `TC-20` in a requirement row is
  always FR-20.
- `E2E-nn` is a Playwright workflow test in `e2e/`, run against the real app on a throwaway database
  with email captured, never sent. The four `@staging` smoke tests in `staging.spec.js` have no ID: they
  run against the deployed staging, not in the normal E2E run.
- Frontend tests (`FE`) are named by file only; they run in the Jest suite (`src/frontend/**/__tests__`
  and `src/__tests__`).
- A file name in backticks must exist, and a `*` in it stands for any run of characters. An ID range
  such as `TC-16-20..27` means every number in it exists.

Counts on 7 Oct 2026: 388 backend unit tests, 133 integration tests against a real MongoDB, 461
frontend tests, 41 end-to-end workflow tests plus 4 `@staging` smoke tests. All of them run in CI on
every pull request except the `@staging` tests, which run against staging after a deploy.

**Planned** rows name the work that is still open. A planned test that exposes a defect stays failing, or
is marked `todo`, until the defect is fixed, so the matrix never reports a defect as covered. A test
that only **documents** a defect or a missing feature (it passes because the system does the wrong
thing, or answers 501) is marked as such below and is not acceptance coverage.

| Business requirement ID | Functional requirement ID | Workflow | Test cases (existing) | Test type | Planned coverage | Status |
|---|---|---|---|---|---|---|
| FR1.1 | FR-01 Professor login | CW-01 | Integration `login.integration.js`: TC-01-20..25 · Unit `rateLimit.test.js`: TC-01-01..13 · Unit `injectionGuards.test.js`: TC-01-14..19 · Unit `authController.test.js`, `authMiddleware.test.js`, `authRoutes.test.js` · FE `login.test.js`, `LoginPage.test.js`, `AuthContext.test.js`, `ProtectedRoute.test.js`, `App.routing.test.js` · E2E-01, E2E-02 | Unit + integration + E2E | — | Needs verification — sponsor to confirm local password login is intended |
| FR1.2 | FR-02 Student access without login | CW-07 | Integration `submission.integration.js`: TC-16-20 (the link opens the form), TC-16-27 (unknown and expired links) · Unit `rateLimit.test.js`: TC-02-01 · Unit `submitEvaluation.test.js`, `evaluationLinks.test.js`, `evaluationToken.test.js` · E2E-10, E2E-13 | Unit + integration + E2E | — | Validated |
| FR1.3 | FR-03 Multi-factor authentication | CW-01 | Integration `login.integration.js`: TC-01-28 (MFA is required and cannot be completed: **documents the defect**) · Unit `authController.test.js`: "login: MFA enabled requires verification", "verifyMfa: returns 501" (**document the defect**) | Integration + unit | Replace TC-01-28 and the 501 test when D-17 is decided | Defective (D-17) — tests document the gap |
| FR1.4 | FR-04 Session expiry | CW-01 | Unit `authController.test.js`: TC-04-11 (the token lasts one hour: **documents the defect**) · Unit `authMiddleware.test.js`: TC-04-10 (an expired token is refused with 401) · Integration `login.integration.js`: TC-01-26 (logout keeps the token working: **documents the gap**) | Unit + integration | Update the expiry assertion when D-18 is decided | Defective (D-18) — 1 h, requirement says 30 min |
| FR2.1 | FR-05 Create and manage courses | CW-03 | Integration `courses.integration.js`: TC-05-30..37 · Integration `courseOwnership.integration.js`: TC-05-20..25 · Unit `injectionGuards.test.js`: TC-05-06..13 · Unit `courseController.test.js`, `courseOwnership.test.js` · FE `CourseDialogs.test.js`, `CourseListControls.test.js`, `useCourses.test.js`, `useCourseDialogs.test.js` · E2E-34, E2E-35, E2E-36, E2E-39, E2E-40 | Unit + integration + E2E | — | Validated |
| FR2.2 | FR-06 Bulk roster upload | CW-04 | Integration `roster.integration.js`: TC-06-20..27 (TC-06-25 **documents** that a successful re-upload clears the evaluation links and the submitted evaluations) · Integration `students.integration.js`: TC-06-30..44 (adding, editing and deleting students, one by one and in bulk) · Unit `rosterUpload.test.js`: TC-06-05, TC-06-06, TC-06-08 · Unit `studentUpdate.test.js`: TC-05-01..05 · FE `RosterDialogs.test.js`, `StudentDialogs.test.js`, `csvFile.test.js`, `useStudents.test.js` · E2E-03, E2E-04, E2E-16, E2E-17, E2E-18, E2E-19, E2E-20, E2E-37, E2E-38 | Unit + integration + E2E | — | Validated |
| FR2.3 | FR-07 Roster validation and duplicates | CW-04 | Unit `rosterUpload.test.js`: TC-07-01 (bad rows are reported, good rows are added) · Integration `roster.integration.js`: TC-06-22 (the same roster twice adds nobody twice), TC-06-24 (rows missing a required field) · Integration `students.integration.js`: TC-06-32 (the same student ID twice gets 409), TC-06-33 · Unit `injectionGuards.test.js`: TC-07-02, TC-07-03 · E2E-17 | Unit + integration + E2E | CICD-47 adds the email-format check and a test for it | Partial — duplicates and missing required fields are handled and tested; an invalid email address is not rejected (CICD-47) |
| FR2.4 | FR-08 Assign students to teams | CW-05 | Integration `teams.integration.js`: TC-08-20..34 (TC-08-32 **documents** that auto-assign answers 501) · Integration `students.integration.js`: TC-06-34..36 · Unit `teamPayload.test.js`: TC-08-01, TC-08-02, TC-08-03, TC-08-05, TC-08-06, TC-08-07 · Unit `reportController.test.js` (team averages) · FE `TeamDialogs.test.js`, `teamRequest.test.js`, `useTeams.test.js` · E2E-05, E2E-08, E2E-09, E2E-15, E2E-25, E2E-26, E2E-27, E2E-28, E2E-29, E2E-30 | Unit + integration + E2E | — | Validated |
| FR3.1 | FR-09 Per-student evaluation forms | CW-06 | Integration `submission.integration.js`: TC-16-20 (the link shows only the teammate and the rubric) · Integration `invitation.integration.js`: TC-10-20 (the link matches the stored token) · Unit `evaluationToken.test.js`, `evaluationLinks.test.js` · FE `StudentEvaluation.test.js` · E2E-10 | Unit + integration + E2E | — | Validated |
| FR3.2 | FR-10 Email invitations with secure links | CW-06 | Integration `invitation.integration.js`: TC-10-20..25 · Integration `emailBatch.integration.js`: TC-10-30..33, TC-10-37 · Unit `emailPacer.test.js`: TC-10-34..36 · Unit `sendEvaluations.test.js`, `emailUtils.test.js`, `emailGuard.test.js` · FE `emailResult.test.js`, `useEvaluations.test.js` · E2E-06, E2E-28 | Unit + integration + E2E | — | Needs verification — depends on SMTP and `FRONTEND_URL` at deploy time (verified on staging 25 Sep; staging mail is held in the Mailtrap sandbox) |
| FR3.3 | FR-11 Track completion status | CW-08 | Integration `status.integration.js`: TC-11-20, TC-11-21 · FE `EvaluationDialogs.test.js`, `evaluationStatus.test.js`, `useEvaluations.test.js` · E2E-21 | Integration + E2E | — | Validated |
| FR3.4 | FR-12 Reminders | CW-08 | Integration `status.integration.js`: TC-12-20..25 · Integration `emailBatch.integration.js`: TC-12-30 · Unit `remindEvaluations.test.js`: TC-12-01, TC-12-02 · E2E-22, E2E-23 | Unit + integration + E2E | A scheduler, if the sponsor wants one | Defective — on-demand only, no scheduler (the tests cover the on-demand reminder) |
| FR4.1 | FR-13 Ratings on a 1–5 scale | CW-07 | Unit `evaluationTargets.test.js`: TC-13-01..04 (who can be rated) · Integration `settings.integration.js`: TC-13-20 (the rubric: five criteria 1–5, participation 1–4: **documents the defect**) · Integration `submission.integration.js`: TC-16-25 (out-of-range ratings are refused) · Unit `submitEvaluation.test.js`, `reportController.test.js` (participation scaled by 5/4) | Unit + integration | Update when D-19 is decided | Defective (D-19) — participation is 1–4 |
| FR4.2 | FR-14 Feedback length limits | CW-07 | Integration `submission.integration.js`: TC-16-25 (feedback too short or not text is refused) · Unit `submitEvaluation.test.js`: TC-16-47 · E2E-14 | Unit + integration + E2E | Update when D-22 is decided | Defective (D-22) — 10-character minimum, no maximum; requirement says 50–500 |
| FR4.3 | FR-15 Timestamp all submissions | CW-07 | Integration `submission.integration.js`: TC-15-20 (the server sets the time when the evaluation is saved) | Integration | — | Validated |
| FR4.4 | FR-16 Prevent duplicate submissions | CW-07 | Integration `submission.integration.js`: TC-16-20..27 · Integration `atomicSubmission.*.integration.js`: TC-16-30..34 · Integration `duplicateEvaluations.integration.js`: TC-16-36, TC-16-37 · Integration `startup.integration.js`: TC-16-42, TC-16-43 · Unit `evaluationTargets.test.js`: TC-16-01 · Unit `submitEvaluation.test.js`: TC-16-46, TC-16-47 · Unit `saveEvaluations.test.js`: TC-16-38, TC-16-39, TC-16-45 · E2E-11, E2E-12 | Unit + integration + E2E | — | Validated |
| FR5.1 | FR-17 Aggregated team reports | CW-09 | Integration `reports.integration.js`: TC-17-20..27 · Unit `reportController.test.js`: TC-17-01 · FE `Reports.test.js` · E2E-07 | Unit + integration + E2E | — | Validated |
| FR5.2 | FR-18 Average score per criterion | CW-09 | Integration `reports.integration.js`: TC-17-24 (curved grading), TC-18-20 (a student report) · Unit `reportController.test.js` (scoring, letter grades) | Unit + integration | — | Validated |
| FR5.3 | FR-19 Downloadable reports | CW-09 | Integration `reports.integration.js`: TC-19-20, TC-19-21 (one row per student; formula and comma protection) · Unit `reportController.test.js` (CSV download) · Unit `csv.test.js` · E2E-07 (downloads the CSV) | Unit + integration + E2E | PDF export has no test until it is built | Partial — CSV works, PDF missing |
| FR5.4 | FR-20 Highlight outliers | CW-09 | Integration `reports.integration.js`: TC-20-30 (a rating of all fives is flagged as a possible outlier; ordinary ratings are not) | Integration | Confirm how the flag is shown to the professor | Needs verification |
| FR6.1 | FR-21 Summarise textual feedback | CW-10 | Integration `settings.integration.js`: TC-21-20 (summarize answers 501: **documents the missing feature**), TC-21-21 | Integration | None — AI features are out of scope | Unsupported |
| FR6.2 | FR-22 Flag concerning language | CW-09 | Integration `reports.integration.js`: TC-22-20, TC-22-21 · Integration `settings.integration.js`: TC-22-30..32 (the professor's word list) · Unit `reportController.test.js` | Unit + integration | — | Validated |
| FR6.3 | FR-23 Sentiment trends | CW-10 | Integration `settings.integration.js`: TC-21-20 (sentiment answers 501: **documents the missing feature**) | Integration | None — AI features are out of scope | Unsupported |
| *(implementation only)* | — | CW-02 Password reset | Integration `passwordReset.integration.js`: TC-01-30..35 · Unit `rateLimit.test.js`: TC-01-05, TC-01-11, TC-01-12 · Unit `injectionGuards.test.js`: TC-01-14..17 · Unit `authController.test.js`, `emailUtils.test.js` · FE `ResetPassword.test.js`, `App.routing.test.js` | Unit + integration | — | Validated |
| *(implementation only)* | — | CW-11 Professor self-registration | Integration `login.integration.js`: TC-01-23..25 · Unit `rateLimit.test.js`: TC-01-06 · Unit `injectionGuards.test.js`: TC-01-19 · Unit `authController.test.js` | Unit + integration | — | Needs verification — sponsor to confirm public sign-up is intended |
| *(sponsor spec only)* | — | CW-12 Rubric management | — (the rubric is fixed in code; TC-13-20 documents it under FR-13) | — | Unit: rubric validation once the scope is decided | Planned (D-09) — rubric is hardcoded |

## Tests that cover non-functional requirements

These tests have no FR row because they check how the system runs, not what it does. They
trace to the sponsor's non-functional requirements (reliability, repeatable deployments,
security) and to fixed defects. IDs here may use a backlog number or `SEC` instead of an FR number.

| Concern | Test cases | Traces to |
|---|---|---|
| Authorization: a professor can use only their own courses | `courseOwnership.test.js` · `courseOwnership.integration.js`: TC-05-20..25 · `courseController.test.js` | Security fix, PR #50 |
| Rate limiting on login, reset, sign-up, student links and the whole API | `rateLimit.test.js`: TC-01-01..13, TC-02-01, TC-04-01 | API-5, CICD-34 |
| Input validation against injection (operator objects, regex characters, non-text values) | `injectionGuards.test.js` · `inputGuards.test.js`: TC-SEC-10..12 | Account-takeover fix (#100), CICD-45 |
| Browser origins allowed to call the API | `corsConfig.test.js` · E2E `staging.spec.js` (the four `@staging` tests, against staging) | CICD-37, CICD-27 |
| Staging mail never reaches a real inbox | `emailGuard.test.js` | CICD-44 |
| Deployment health check | `health.test.js` · `deploymentStatus.test.js`: TC-29-40..48 | `/api/health` used by Render and CD |
| Deploy and release scripts | `renderDeploy.test.js` · `releaseRecord.test.js` | CICD-28, CICD-58 |
| Configuration safety | `env.test.js` (production refuses a missing or short `JWT_SECRET`) | D-03, PR #16 |
| Server behind Render's load balancer | `serverTimeouts.test.js` | PR #30 |
| Frontend API address | FE `apiUrl.test.js` | PR #30 |
| Coverage gate (CICD-20, not FR-20) | `coverageGate.test.js`: TC-20-01..19 | CICD-20 |
| Test and build reporting | `testSummary.test.js`: TC-29-01..12 · `runReport.test.js`: TC-29-30..35, TC-29-37 | CICD-29 |
| One-command setup | `setupScript.test.js`: TC-50-01..06 | CICD-50 |
| Security gate: the accepted-risk list | `securitySuppressions.test.js`: TC-SEC-01..06 | CICD-24 |
| Repository hygiene and lint configuration | `repoHygiene.test.js` · `eslintConfig.test.js` · `requestLogger.test.js` | CICD-35, CICD-32 |
| This matrix | `rtmTraceability.test.js`: TC-RTM-01..12 | CICD-23 |
| CI can launch a browser | E2E `setup.spec.js` | Pipeline smoke |

## Coverage summary (7 Oct 2026)

| | Requirements |
|---|---|
| Rows that cite at least one automated test that exists | 25 of 26 (all except CW-12, which has no feature to test) |
| Validated, with tests | FR-02, FR-05, FR-06, FR-08, FR-09, FR-11, FR-15, FR-16, FR-17, FR-18, FR-22, CW-02 |
| Partial, with tests for what works | FR-07 (email format, CICD-47), FR-19 (PDF) |
| Defective: the tests cover the working part or **only document the defect** | FR-03, FR-04 (tests only document the defect); FR-12, FR-13, FR-14 (the behaviour that exists is tested) |
| Needs verification | FR-01, FR-10, FR-20, CW-11 |
| Out of scope | FR-21, FR-23 (AI features; the 501 answers are documented by tests) |
| Planned | CW-12 (rubric management, D-09) |

Every **Validated** requirement has automated tests, which meets the sponsor's §9 requirement that each
validated business requirement is verified by one or more automated tests.

**FR-16.** Fixed in CICD-33. A submission is saved in one transaction (or, on a database
without transactions, saved one by one and rolled back on failure), and a unique index on
`Evaluation` (evaluator, student, course) makes two simultaneous submissions save once. The standalone
fallback is best effort (a crash mid-way can leave ratings behind; Atlas uses the transaction), and at
startup the service logs a warning if the unique index could not be built because of old duplicates.
`atomicSubmission.*.integration.js` (TC-16-30 to TC-16-34, run on a replica set and
on a standalone `mongod`) covers concurrent submits, a failure after the ratings are written, the
index, and resubmitting after a reset; `duplicateEvaluations.integration.js` covers the
pre-deploy check. The earlier partial-save lockout (PR #27) is covered by `submitEvaluation.test.js`.

## Keeping the IDs honest

`scripts/check-rtm.js` reads this file and the test folders. It fails when:

- a cited ID (or any number in a cited range) is not the start of a test title in `src/backend/tests`,
  `src/backend/integration` or `e2e`;
- a cited test file does not exist;
- a requirement row whose status is not Unsupported or Planned cites no test ID that exists;
- a requirement in `requirements.md` has no row here.

Run it with `node scripts/check-rtm.js`. It also runs inside `npm test` in `src/backend`
(`rtmTraceability.test.js`), so the Backend check on every pull request fails when a test is renamed or
deleted while this file still cites it.

## Maintaining this matrix

- Add the test file and ID to the row when a test lands, and move the row out of
  "Planned coverage" once the planned test exists.
- Name new backend tests `TC-<FR>-<n>: ...` (see the testing strategy); name Playwright tests `E2E-<n>: ...`.
- Keep the Status column in step with `requirements.md`; correct both in the same PR.
