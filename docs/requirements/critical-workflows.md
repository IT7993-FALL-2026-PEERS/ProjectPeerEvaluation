# Critical Workflows

This document identifies the end-to-end workflows the PEERS system supports, as a basis for
the Requirements Traceability Matrix (`docs/requirements/rtm.md`). Each workflow is traced to
the functional requirements it implements (`docs/requirements/functional-requirements.md`) and
to the actual routes/controllers that carry it out, so the mapping reflects what the code does
today rather than what was originally specified.

**Status of this document:** approved. The workflows and requirement/code traceability below
were identified from the current codebase, and the sponsor approved the critical workflows
(CW-01 to CW-12) on 25 September 2026. The Requirements Traceability Matrix
(`docs/requirements/rtm.md`) maps every requirement to these workflows.

## Legend
- **Status**: Implemented / Partial / Broken / Planned
- **Priority**: as approved by the sponsor, 25 Sep 2026

**Note on naming — CW vs. WF:** the README's `WF01`–`WF12` IDs label stages of the CI/CD
*pipeline* (checkout, build, deploy, etc.). The `CW-01`–`CW-12` IDs below label the
*application's* business workflows (a professor logging in, a student submitting an
evaluation, and so on) — an unrelated numbering scheme, deliberately given a different prefix
so the two are never confused.

## CW-01: Professor Authentication
- **Actor:** Professor
- **Priority:** Critical — every other workflow requires an authenticated session
- **Trigger:** Professor opens the app and needs access to their courses
- **Steps:** submit credentials → server issues JWT → session persists client-side → protected
  routes accept the token until expiry or logout
- **Requirements:** FR1.1 (secure login), FR1.3 (MFA), FR1.4 (session timeout)
- **Implementation:** `LoginPage.js` → `POST /auth/login`, `POST /auth/logout`,
  `POST /auth/refresh` (`authController.js`, `authRoutes: auth.js`)
- **Status:** Partial — login works. Logout is a server-side no-op (it returns 200; the client
  just discards the token, so tokens stay valid until expiry). Refresh is a stub that returns
  501 `NOT_IMPLEMENTED` (`authController.js:98-104`). MFA is advertised (`mfa_required: true`) but
  `verifyMfa` is unimplemented, so a professor with MFA enabled cannot complete login (tracked
  as **D-17**, High, in the technical assessment report). Session timeout is also 1 hour, not
  the 30 minutes FR1.4 specifies (**D-18**).

## CW-02: Password Reset
- **Actor:** Professor
- **Priority:** High
- **Trigger:** Professor forgets their password
- **Steps:** request reset → receive token → submit new password via `ResetPassword.js`
- **Requirements:** FR1.1 (secure login, implicit)
- **Implementation:** `POST /auth/reset-password`, `POST /auth/update-password`
  (`authController.js`)
- **Status:** Implemented

## CW-03: Course Setup
- **Actor:** Professor
- **Priority:** Critical — nothing downstream (rosters, teams, evaluations) exists
  without a course
- **Trigger:** Start of semester / new section
- **Steps:** create course → set name, code, section, semester → course appears on dashboard
- **Requirements:** FR2.1
- **Implementation:** `CourseManagement.js` → `POST /courses`, `GET /courses`,
  `PUT /courses/:course_id`, `DELETE /courses/:course_id` (`courseController.js`)
- **Status:** Implemented

## CW-04: Roster Management
- **Actor:** Professor
- **Priority:** Critical
- **Trigger:** Professor needs to populate a course with students
- **Steps:** bulk upload CSV/Excel (with validation and error handling) or add/edit/remove
  students individually or in bulk
- **Requirements:** FR2.2 (bulk upload), FR2.3 (validation)
- **Implementation:** `CourseManagement.js` → `POST /courses/:course_id/roster` (multer upload),
  `GET/POST/PUT/DELETE /courses/:course_id/students`,
  `POST /courses/:course_id/students/bulk-delete` (`studentController.js`)
- **Status:** Implemented

## CW-05: Team Assignment
- **Actor:** Professor
- **Priority:** Critical — evaluations are scoped to teams
- **Trigger:** Roster is in place and teams need to be formed
- **Steps:** create teams → auto-assign students or move them manually between teams
- **Requirements:** FR2.4
- **Implementation:** `TeamAssignment.js` → `POST /courses/:course_id/teams`,
  `POST /courses/:course_id/teams/auto-assign`,
  `POST|DELETE /courses/:course_id/teams/:team_id/students/:student_id`
  (`teamController.js`)
- **Status:** Implemented

## CW-06: Evaluation Distribution
- **Actor:** Professor (initiates), Student (receives)
- **Priority:** Critical — this is the core function of the product
- **Trigger:** Professor is ready to open a round of peer evaluations for a course or team
- **Steps:** system generates a unique evaluation form/link per student → sends email invitation
- **Requirements:** FR3.1, FR3.2
- **Implementation:** `POST /courses/:course_id/evaluations/send`,
  `POST /courses/:course_id/teams/:team_id/evaluations/send` (`evaluationController.js`)
- **Status:** Partial — links are generated and sent, but email delivery (FR3.2) is unverified:
  it depends on SMTP config and `FRONTEND_URL` at deploy time.

## CW-07: Student Evaluation Submission
- **Actor:** Student
- **Priority:** Critical — this is the only workflow that does not require a login,
  per FR1.2, and is the primary data-collection path
- **Trigger:** Student opens their unique evaluation link
- **Steps:** load form by token (no login) → rate teammates numerically → provide written
  feedback → submit → duplicate submissions rejected
- **Requirements:** FR1.2 (no login required), FR4.1 (numeric ratings), FR4.2 (text feedback),
  FR4.3 (timestamping), FR4.4 (prevent duplicates)
- **Implementation:** `StudentEvaluation.js` → `GET /evaluate/:token`,
  `POST /evaluate/:token`, `GET /evaluate/:token/status` (`evaluationController.js`,
  public route `evaluate.js`)
- **Status:** Partial — the flow works end to end, but participation is rated 1-4 instead of
  1-5 (FR4.1, **D-19**), and feedback only requires 10 characters with no maximum, against a
  spec of 50-500 (FR4.2). The duplicate guard (FR4.4) still lets concurrent submits through; see FR-16 in
  `rtm.md`.

## CW-08: Evaluation Tracking and Reminders
- **Actor:** Professor
- **Priority:** High
- **Trigger:** A round of evaluations is in progress
- **Steps:** view completion status per student/team → send reminder emails to students who
  have not submitted
- **Requirements:** FR3.3 (track completion), FR3.4 (automated reminders)
- **Implementation:** `GET /courses/:course_id/evaluations/status`,
  `POST /courses/:course_id/evaluations/remind` (`evaluationController.js`)
- **Status:** Partial — completion tracking (FR3.3) works. Reminders are professor-triggered
  only; no scheduler exists, so FR3.4 ("automated") is defective as written. Worth confirming
  with the sponsor whether a manual trigger is acceptable.

## CW-09: Report Generation and Review
- **Actor:** Professor
- **Priority:** Critical — this is how the evaluation data becomes usable
- **Trigger:** Evaluations for a course, team, or student are complete (or in progress)
- **Steps:** generate aggregated report → view course/team/student breakdowns → download as
  CSV
- **Requirements:** FR5.1 (aggregated reports), FR5.2 (average scores), FR5.3 (downloadable
  reports), FR5.4 (outlier highlighting), FR6.2 (flag concerning language — the flagging
  actually runs here, during report generation, not in CW-10)
- **Implementation:** `Reports.js` → `POST /courses/:course_id/reports/generate`,
  `GET /courses/:course_id/reports`, `GET /courses/:course_id/reports/student/:student_id`,
  `GET /courses/:course_id/reports/team/:team_id`,
  `GET /courses/:course_id/reports/download` (`reportController.js`)
- **Status:** Partial — CSV export exists (`downloadReport`), contradicting the technical
  assessment report's D-20 finding that no export exists; that finding needs correcting. PDF
  export (also specified by FR5.3) is not implemented. Outlier/discrepancy highlighting (FR5.4)
  needs verification against `getCourseReport`'s actual output. Concerning-language flagging
  uses a hardcoded word list (`reportController.js:183`) and ignores the professor's configured
  list (`Professor.aiConcerningWords`), so FR6.2 is defective.

## CW-10: AI-Assisted Feedback Analysis (optional, FR6)
- **Actor:** Professor
- **Priority:** Low — functional requirements mark this whole category optional
- **Trigger:** Professor reviews submitted feedback and wants a summary or flag for concerning
  language
- **Steps:** submit feedback text → receive a summary, flagged terms, or sentiment
- **Requirements:** FR6.1 (summarization), FR6.3 (sentiment). FR6.2 (flagging) is traced to
  CW-09, where the flagging actually happens.
- **Implementation:** `POST /ai/summarize`, `POST /ai/red-flags`, `POST /ai/sentiment`
  (`aiController.js`); configurable flagged-word list via `GET|POST /professor/ai-words`
  (`professorController.js`, surfaced in `Settings.js`). The saved list is never read by
  the flagging code in CW-09.
- **Status:** Needs verification — routes and a UI settings surface exist; whether the AI logic
  itself is a real implementation or a stub has not been checked as part of this pass.

## CW-11: Professor Self-Registration
- **Actor:** Anyone with access to the login page
- **Priority:** Pending sponsor — see open items
- **Trigger:** A new user wants a professor account
- **Steps:** toggle the login page into "Professor Registration" mode → submit details →
  account is created → log in
- **Requirements:** none — not in the inherited FR list
- **Implementation:** `LoginPage.js` (`isRegistering` mode) → `POST /auth/register`
  (`authController.js`, `routes/auth.js`)
- **Status:** Implemented, but unrestricted — the route is public, so anyone who can reach the
  app can create a professor account. Whether that is intended is an open question below.

## CW-12: Rubric Management
- **Actor:** Professor
- **Priority:** Pending sponsor — see open question 8 in `requirements.md`
- **Trigger:** Professor wants to create or adjust the criteria students evaluate each other on
- **Steps:** create or edit a rubric → assign it to a course → students see it on their
  evaluation form
- **Requirements:** none — not in the inherited FR list, but the sponsor specification lists
  rubric management as a core workflow
- **Implementation:** none. A single fixed rubric lives in `src/backend/config/rubric.js` and is
  sent with every evaluation form (`evaluationController.js:403`). There is no Rubric model, no
  endpoint, and no UI for editing it.
- **Status:** Planned — tracked as **D-09**. If the sponsor confirms a fixed rubric is enough,
  this becomes "Implemented as fixed configuration" and D-09 closes.

## Open items before this feeds the RTM
- Sponsor validation of the priorities above, from Donald's sponsor session.
- Team leader (Khoa Ho) to decide, informed by that sponsor input, whether CW-01's broken MFA
  (D-17) and CW-09's CSV/PDF export gap should block Milestone 1 sign-off or carry forward as
  tracked defects.
- Confirm with the sponsor whether open professor self-registration (CW-11) is intended. As
  built, anyone who can reach the login page can create a professor account. If signup should
  be restricted (invite-only, admin-created, or limited to university email), CW-11 is a
  security defect and needs a D-number.

## Automated regression coverage (CICD-22)

Each workflow has integration tests that run in CI against a real MongoDB (`src/backend/integration/`,
`npm run test:integration`), on a fixed seed. Test names start with `TC-<requirement>-<n>`. Where a
feature is a stub or missing, the test records how it behaves today and is marked so; replace it when
the feature is built.

| Workflow | Test files | What is covered | Gaps and notes |
|---|---|---|---|
| CW-01 Professor authentication | `login.integration.js` (TC-01-20..28) | Login, saved last login, bad credentials, operator payload, register, duplicate email, unique index; logout, refresh and MFA as they behave today | Logout is a no-op, refresh is a 501 stub, MFA cannot complete (D-17) |
| CW-02 Password reset | `passwordReset.integration.js` (TC-01-30..35) | Emailed link and stored token, no account enumeration, one-time use, expiry, forged and operator tokens | |
| CW-03 Course setup | `courses.integration.js` (TC-05-30..36), `courseOwnership.integration.js` (TC-05-20..25) | Create, list, edit, validation, soft delete and reactivation, search, ownership across professors | |
| CW-04 Roster management | `roster.integration.js` (TC-06-20..27), `students.integration.js` (TC-06-30..40) | Roster upload, invalid files keep data, rows with missing fields, manual add, edit, delete, bulk delete, counts | Email format is not validated yet (FR-07); a valid re-upload deletes evaluations (sponsor decision, API-3) |
| CW-05 Team assignment | `teams.integration.js` (TC-08-20..33), consistency helper `helpers/consistency.js` | Create, move, remove, rename, delete, clear, membership and counts agree on both sides | Auto-assign is a 501 stub |
| CW-06 Evaluation distribution | `invitation.integration.js` (TC-10-20..25) | Emails captured at the transport, link matches stored token, 14-day expiry, resend, team send, authorization | |
| CW-07 Student submission | `submission.integration.js` (TC-16-20..27), `atomicSubmission.*.integration.js` (TC-16-30..34), `duplicateEvaluations.integration.js` | Full path from the emailed link, validation, duplicates, concurrent double submit, all-or-nothing save | Participation 1-4 and a 10-character feedback minimum are as built (D-19, FR-14) |
| CW-08 Tracking and reminders | `status.integration.js` (TC-11-20..21, TC-12-20..25) | Status counts, reminders only to students who have not submitted, reuse of the existing link, reset, authorization | Reminders are manual only (FR-12 asks for scheduled) |
| CW-09 Reports | `reports.integration.js` (TC-17-20..27, TC-18-20, TC-19-20..21, TC-20-30, TC-22-20..21) | Scores, grades, summary and team averages from a fixed set of evaluations, curved grading, no-data cases, CSV export and formula safety, outlier and concerning-word flags, authorization | PDF export is not built (FR-19) |
| CW-10 AI-assisted feedback | `settings.integration.js` (TC-21-20..21, TC-22-30..32) | Flag-word list: defaults, add, edit, delete, per professor | Summaries, red flags and sentiment are 501 stubs (FR-21, FR-23) |
| CW-11 Self-registration | `login.integration.js` (TC-01-23, 24) | Register, hash, duplicate | Open to anyone (sponsor question) |
| CW-12 Rubric management | `settings.integration.js` (TC-13-20) | The one fixed rubric reaches the student form with the right scales | No rubric management exists (D-09) |
