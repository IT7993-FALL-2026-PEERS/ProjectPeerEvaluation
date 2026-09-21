# Required Functionality & Acceptance Criteria

**Owner:** Laeticia Neno Aloyem (M3) — Requirements, QA, security & documentation
**Milestone:** 1 — Assessment & Planning (14 Sep – 4 Oct 2026), review 28 Sep
**Gantt task:** Requirements Validation & RTM — *"Document required functionality, acceptance criteria & defects"*
**Status:** Draft — critical-workflow marking pending M1's sponsor session
**Last updated:** 21 September 2026

## Purpose and method

This document validates the functional requirements inherited from the previous team and
restates each one as something that can be tested.

The inherited list lives in `docs/requirements/functional-requirements.md` (IDs FR1.1 to
FR6.3) and `docs/requirements/user-stories.md`. That file is preserved unchanged as the
historical record. This document re-numbers each item with a stable ID (**FR-01**
onwards), records whether the application actually implements it, and states acceptance
criteria in Given / When / Then form.

**These IDs are permanent.** Test cases and the Requirements Traceability Matrix will
refer to them, so they must not be renumbered once this document is merged.

### Status values

| Status | Meaning |
|---|---|
| **Validated** | Implementation found in the codebase and consistent with the requirement |
| **Defective** | Implemented, but behaviour contradicts the requirement (linked defect ID) |
| **Unsupported** | No implementation found |
| **Needs verification** | Implementation found, but correctness could not be confirmed by code reading alone; requires a runtime check during Milestone 2 testing |

### Method and limits

Statuses were determined by reading the `main` branch on 21 September 2026 — routes,
controllers, models and configuration — and by cross-referencing M4's containerization
and test-coverage review and M5's database schema review. No requirement has been
confirmed against a running instance yet, so anything marked *Validated* means "correctly
implemented as far as the code shows", not "observed working". Runtime confirmation
happens in Milestone 2, when the unit, integration and end-to-end tests are written
against these criteria.

**Criticality is not yet assigned.** M1 is holding the critical-workflow session with the
sponsor in the week of 21 Sep; output goes to `docs/requirements/critical-workflows.md`.
Once it exists, a Critical column will be added here and used to prioritise test coverage.

### Summary

| Status | Count |
|---|---|
| Validated | 11 |
| Needs verification | 5 |
| Defective | 4 |
| Unsupported | 3 |
| **Total** | **23** |

---

## 1. Authentication & authorization

### FR-01 — Professor login
*Inherited: FR1.1* · **Status: Needs verification**

**Required functionality.** A professor can sign in securely to reach their own courses.

**Given** a registered professor with a valid email and password,
**when** they submit those credentials to the login endpoint,
**then** a signed authentication token is returned and they reach their course dashboard.

**Given** an unregistered email or an incorrect password,
**when** the credentials are submitted,
**then** authentication is refused and no token is issued.

*Note.* The inherited wording says "using university credentials". The implementation uses
locally stored, bcrypt-hashed passwords rather than a university identity provider. The
sponsor should confirm which is intended — if federated university login is expected, this
becomes Unsupported and a new defect is raised.

### FR-02 — Student evaluation access without login
*Inherited: FR1.2* · **Status: Validated**

**Required functionality.** A student can open their evaluation form from an emailed link
without creating an account.

**Given** a student record holding a valid, unused evaluation token,
**when** the student opens the evaluation link containing that token,
**then** their evaluation form opens without any login prompt.

**Given** an invalid or unrecognised token,
**when** the link is opened,
**then** access is refused and no evaluation form is shown.

*Evidence.* `Student.evaluation_token` in the schema; `routes/evaluate.js`.

### FR-03 — Multi-factor authentication for professors
*Inherited: FR1.3* · **Status: Defective** · **Defect: D-17**

**Required functionality.** A professor can protect their account with a second
authentication factor.

**Given** a professor with MFA enabled,
**when** they submit correct credentials,
**then** they are prompted for a second factor and, on providing a valid one, are signed in.

**Current behaviour.** Login returns `mfa_required: true`, but the verification endpoint
raises `'MFA verification not implemented.'` — so a professor with MFA enabled **cannot
complete login at all**. The feature is scaffolded, not built.

*Evidence.* `src/backend/controllers/authController.js` (`verifyMfa`);
`src/backend/routes/auth.js`; `Professor.mfa_enabled` in the schema.

*Recommendation.* Ask the sponsor whether MFA is in scope. If not, the flag should be
removed or permanently disabled so the login path cannot reach a dead end.

### FR-04 — Session expiry
*Inherited: FR1.4* · **Status: Defective** · **Defect: D-18**

**Required functionality.** A professor's session expires after a period of inactivity.

**Given** a professor who signed in more than the configured session lifetime ago,
**when** they make a request with the expired token,
**then** the request is refused and they are asked to sign in again.

**Current behaviour.** Tokens are issued with a fixed one-hour expiry
(`JWT_EXPIRES_IN = '1h'`), against an inherited requirement of 30 minutes. The expiry is
also absolute rather than inactivity-based. The sponsor should confirm the intended
value, and the requirement or the code should then be corrected to match.

---

## 2. Course management

### FR-05 — Create and manage courses
*Inherited: FR2.1; user story US-P1* · **Status: Validated**

**Required functionality.** A professor can create multiple courses, each identified
separately, and edit or archive them.

**Given** an authenticated professor,
**when** they create a course with a name, number, section and semester,
**then** the course is saved against their account and appears in their course list.

**Given** an existing course,
**when** the professor edits its details or changes its status,
**then** the change is persisted and reflected in the course list.

*Evidence.* `models/Course.js`; `routes/courseRoutes.js`, `routes/courses.js`.

### FR-06 — Bulk roster upload
*Inherited: FR2.2; user story US-P2* · **Status: Validated**

**Required functionality.** A professor can upload a class roster from a file rather than
entering students one at a time.

**Given** an authenticated professor viewing one of their courses,
**when** they upload a CSV roster in the documented format,
**then** each student in the file is added to that course and a summary of what was added
is shown.

**Given** a file that is malformed or in the wrong format,
**when** it is uploaded,
**then** the upload is rejected with an error identifying the problem, and no partial
roster is created.

*Evidence.* `controllers/studentController.js` (CSV parsing and bulk create); `multer` and
`csv-parser` dependencies; format documented in `docs/csv-upload-format.md`.

### FR-07 — Roster validation and duplicate handling
*Inherited: FR2.3* · **Status: Validated**

**Required functionality.** Uploaded roster data is validated, and students already on the
course are not added twice.

**Given** a CSV containing a student whose ID already exists on the course,
**when** the file is uploaded,
**then** that student is skipped rather than duplicated, and the response reports how many
entries were filtered.

**Given** a CSV row with an invalid email address,
**when** the file is uploaded,
**then** that row is reported as an error and is not silently accepted.

*Evidence.* `controllers/studentController.js` — duplicate check and deduplication before
insert, with a `DUPLICATE` error code.

### FR-08 — Assign students to teams
*Inherited: FR2.4; user story US-P3* · **Status: Validated** *(see D-10)*

**Required functionality.** A professor can group the students on a course into teams.

**Given** a course with students on its roster,
**when** the professor creates a team and assigns students to it,
**then** those students are recorded as members of that team within that course.

**Given** an existing team,
**when** the professor moves a student to a different team,
**then** the student's membership is updated and they appear on exactly one team.

*Evidence.* `models/Team.js`, `controllers/teamController.js`.

*Risk.* Membership is stored in two places, `Team.students[]` and `Student.team_id`, with
no synchronisation found (D-10). The second criterion above is the one that would expose
a drift, and should be an explicit integration test in Milestone 2.

---

## 3. Evaluation management

### FR-09 — Generate per-student evaluation forms
*Inherited: FR3.1* · **Status: Validated**

**Required functionality.** Each student receives their own evaluation form for their team.

**Given** a course with teams and students,
**when** the professor launches evaluations,
**then** each student is issued their own unique evaluation token and form.

*Evidence.* `Student.evaluation_token`; `controllers/evaluationController.js`.

### FR-10 — Email invitations with secure links
*Inherited: FR3.2* · **Status: Needs verification**

**Required functionality.** Each student receives a personalised email containing their
own evaluation link.

**Given** a launched evaluation round,
**when** invitations are sent,
**then** every student on the roster receives an email addressed to them containing a link
carrying their own token, and no student receives another student's link.

*Evidence.* `sendEvaluationInvitation` in `utils/emailUtils.js`.

*Why verification is needed.* Delivery depends on SMTP credentials and on `FRONTEND_URL`
being set correctly at deployment time; link correctness cannot be confirmed without a
runtime test. A wrong `FRONTEND_URL` produces links that look valid but do not work.

### FR-11 — Track completion status
*Inherited: FR3.3* · **Status: Validated**

**Required functionality.** A professor can see who has and has not submitted.

**Given** a course with an evaluation round in progress,
**when** the professor views the course,
**then** each student's completion status is shown, and it updates once they submit.

*Evidence.* Completion state used by `controllers/evaluationController.js` to determine
who still needs reminders.

### FR-12 — Reminders for incomplete evaluations
*Inherited: FR3.4* · **Status: Defective**

**Required functionality.** The inherited requirement specifies **automated** reminders to
students who have not completed their evaluations.

**Given** a course with students who have not yet submitted,
**when** the configured reminder schedule is reached,
**then** a reminder email is sent to exactly those students, without anyone triggering it.

**Current behaviour.** Reminders exist but are **manually triggered** through an endpoint —
there is no scheduler, cron job or timed trigger anywhere in the backend. The capability
is there; the automation is not.

*Evidence.* `controllers/evaluationController.js` — reminder handler present, correctly
filtering to incomplete students and reporting `reminders_sent`; no scheduling mechanism
found in a repository-wide search.

*Recommendation.* Confirm with the sponsor whether manual reminders are acceptable. If
automation is required, raise it as a defect; if not, amend the requirement to say
"on-demand".

---

## 4. Data collection

### FR-13 — Numeric ratings on a 1–5 scale
*Inherited: FR4.1* · **Status: Defective** · **Defect: D-19**

**Required functionality.** Students rate teammates numerically on each rubric criterion,
on a 1–5 scale.

**Given** a student completing an evaluation,
**when** they submit a rating outside the permitted range for a criterion,
**then** the submission is rejected with a validation error.

**Given** ratings within range for every required criterion,
**when** the evaluation is submitted,
**then** the ratings are stored against the correct evaluator and evaluatee.

**Current behaviour.** Five criteria enforce 1–5, but **participation is limited to 1–4**,
contradicting the requirement. The code carries an inline comment acknowledging the
difference, so it may be deliberate — but the requirement and the implementation disagree
and one of them must change.

*Evidence.* `models/Evaluation.js` — `participation: { min: 1, max: 4 }` against
`min: 1, max: 5` for the other five criteria.

### FR-14 — Textual feedback with length limits
*Inherited: FR4.2* · **Status: Needs verification**

**Required functionality.** Students provide written feedback, at least 50 and at most 500
characters.

**Given** a student submitting feedback shorter than the minimum or longer than the
maximum,
**when** they submit,
**then** the submission is rejected with a message stating the permitted length.

*Why verification is needed.* No `minlength` or `maxlength` constraint was found on
`Evaluation.overall_feedback` in the schema. If the limits are enforced only in the
frontend, the rule can be bypassed by calling the API directly — which would make this
Defective. Confirm before Milestone 2 testing.

### FR-15 — Timestamp all submissions
*Inherited: FR4.3* · **Status: Needs verification**

**Required functionality.** Every submission records when it was made.

**Given** a submitted evaluation,
**when** it is stored,
**then** the record carries the submission date and time.

*Why verification is needed.* Confirm whether `Evaluation` uses Mongoose `timestamps` or an
explicit field; M5's schema summary does not list one.

### FR-16 — Prevent duplicate submissions
*Inherited: FR4.4* · **Status: Needs verification**

**Required functionality.** A student cannot submit more than one evaluation for the same
teammate in the same round.

**Given** a student who has already submitted an evaluation for a given teammate,
**when** they attempt to submit again using the same link,
**then** the second submission is refused and the first is preserved unchanged.

*Why verification is needed.* Duplicate handling was found for roster entries and teams,
but no equivalent guard was confirmed for evaluation submissions. This is a data-integrity
requirement and should be tested explicitly in Milestone 2.

---

## 5. Reporting

### FR-17 — Aggregated team reports
*Inherited: FR5.1* · **Status: Validated**

**Required functionality.** A professor can see results aggregated per team.

**Given** a course with submitted evaluations,
**when** the professor generates the report,
**then** results are aggregated per team and stored against the course.

*Evidence.* `models/Report.js`; `controllers/reportController.js`.

### FR-18 — Average score per criterion
*Inherited: FR5.2* · **Status: Validated**

**Given** a student with multiple evaluations submitted about them,
**when** the report is generated,
**then** an average score is calculated for each rubric criterion.

*Evidence.* Aggregation logic in `controllers/reportController.js`.

### FR-19 — Downloadable reports (PDF, CSV)
*Inherited: FR5.3* · **Status: Unsupported** · **Defect: D-20**

**Required functionality.** A professor can download reports as PDF and CSV files.

**Given** a generated course report,
**when** the professor chooses to download it as PDF or as CSV,
**then** a file in that format is produced containing the report contents.

**Current behaviour.** No PDF or CSV generation library is installed, and no export route
or handler exists. Reports can be viewed but not exported.

### FR-20 — Highlight outliers and discrepancies
*Inherited: FR5.4* · **Status: Needs verification**

**Required functionality.** Reports draw attention to unusual or inconsistent scores.

**Given** a team where one member's scores differ markedly from the rest,
**when** the report is generated,
**then** that difference is surfaced rather than left for the professor to spot.

*Evidence.* `controllers/reportController.js` computes a standard deviation per set of
scores.

*Why verification is needed.* The statistic is calculated, but whether anything is actually
flagged or highlighted to the professor — as opposed to the number simply being stored —
could not be confirmed from the backend alone. Requires checking the frontend report view.

---

## 6. AI features

*Inherited section note.* The inherited file marks all three items with "may", which is
not testable as written. Each is restated below as a definite behaviour where an
implementation exists, and flagged for sponsor confirmation where it does not.

### FR-21 — Summarise textual feedback
*Inherited: FR6.1* · **Status: Unsupported**

**Required functionality (proposed).** Reports include a short generated summary of the
written feedback for each student.

**Given** a student with several pieces of written feedback,
**when** the report is generated,
**then** a summary of that feedback appears in the report.

**Current behaviour.** `Report.ai_insights` exists as an untyped field and `routes/ai.js`
exists, but no summarisation implementation was confirmed. Needs a scope decision from the
sponsor: build, or record as out of scope.

### FR-22 — Flag concerning language
*Inherited: FR6.2* · **Status: Validated**

**Required functionality.** Feedback containing concerning language is flagged for the
professor.

**Given** a professor's configured list of concerning words,
**when** a student submits feedback containing one of them,
**then** that feedback is flagged for the professor's attention.

**Given** feedback containing none of those words,
**when** it is submitted,
**then** it is not flagged.

*Evidence.* `Professor.aiConcerningWords` holds a substantial default keyword list
(for example "harass", "discriminate", "unfair grading"). Per M5's review, this is existing
functionality to preserve, not new work.

### FR-23 — Sentiment trends
*Inherited: FR6.3* · **Status: Unsupported**

**Required functionality (proposed).** Reports show how feedback sentiment varies across a
team or over time.

**Given** a course with evaluations submitted across more than one round,
**when** the report is generated,
**then** a sentiment trend is shown.

**Current behaviour.** No sentiment analysis implementation found. Needs a scope decision
from the sponsor.

---

## Non-functional requirements

`docs/requirements/non-functional-requirements.md` is an unwritten stub (D-08). Performance,
availability, security and accessibility requirements are therefore undefined for this
project. Filling that file is proposed as an M3 task for the week of 28 Sep, to be
confirmed with the sponsor — the security items in particular bear directly on the
Milestone 2 security-scanning work.

## Open questions for the sponsor

1. **FR-01** — should professor login use university credentials (federated identity), or
   are locally managed passwords acceptable?
2. **FR-03** — is multi-factor authentication in scope? It is currently a dead end that
   locks out any professor who enables it.
3. **FR-04** — is the session lifetime 30 minutes as documented, or one hour as built, and
   should it be absolute or inactivity-based?
4. **FR-12** — must reminders be automated on a schedule, or is the current on-demand
   behaviour acceptable?
5. **FR-13** — is the 1–4 participation scale intentional, or should it be 1–5 like the
   others?
6. **FR-19** — are PDF and CSV report downloads in scope for this capstone?
7. **FR-21, FR-23** — are the AI summary and sentiment features in scope, or recorded and
   deferred?
8. **Rubric (D-09)** — the specification lists rubric management as a core workflow, but
   the rubric is hardcoded with no per-course customisation. Is per-course rubric editing
   expected?

## Next step

The Requirements Traceability Matrix skeleton (`docs/requirements/rtm.md`) is due in the
week of 28 Sep and will seed one row per requirement ID above, with these columns:

| Business requirement ID | Functional requirement ID | Workflow | Test case ID | Test type | Status |

Test case IDs will be filled in during Milestone 2 as M4 and M5 write the unit,
integration and end-to-end tests. The Workflow column will be populated from
`docs/requirements/critical-workflows.md` once M1's sponsor session has taken place.
