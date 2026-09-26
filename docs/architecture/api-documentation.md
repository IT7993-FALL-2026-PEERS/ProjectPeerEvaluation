# API Documentation

**Gantt task:** Technical Assessment — *"Review software architecture & technology stack"* (M1)
**Milestone:** 1 — Assessment & Planning
**Status:** Complete for review. Documents the API as it is on `main` (commit `11cfd3d`, 26 Sep 2026)
**Related:** [system-architecture.md](system-architecture.md) ·
[database-schema.md](database-schema.md) · [../csv-upload-format.md](../csv-upload-format.md)

This is a reference for the REST API served by the Express backend in `src/backend/`. It
was written from the route files (`src/backend/routes/`) and controllers
(`src/backend/controllers/`), not from the older `Frontend-Backend API Contract Document`
at the repository root, which no longer matches the code.

---

## 1. Conventions

**Base URL**

| Environment | Base URL |
|---|---|
| Local development | `http://localhost:5000/api` |
| Staging (Render) | Set at build time through `REACT_APP_API_URL` (see `render.yaml`) |

**Content type.** Requests and responses are JSON (`Content-Type: application/json`),
except the roster upload (multipart form) and the report download (CSV).

**Authentication.** Professor endpoints need a JSON Web Token from `POST /auth/login`:

```
Authorization: Bearer <access_token>
```

Tokens are signed with `JWT_SECRET` (HS256) and expire after **1 hour**. There is no
working refresh endpoint, so the user logs in again (see D-18 for the 30-minute
requirement). Student endpoints under `/evaluate` use no login: the evaluation token in
the URL is the only credential.

**Course ownership.** Every `/courses/:course_id/...` endpoint first checks that the
course belongs to the logged-in professor (`middleware/courseOwner.js`). Another
professor's course answers **404**, exactly like a course that doesn't exist, so course IDs
can't be probed. A malformed ID answers **400**.

**IDs.** `course_id`, `team_id` and most `student_id` path parameters are MongoDB
ObjectIds (24 hex characters). The one exception is `/reports/student/:student_id`, which
takes the student's **university ID** string (for example `S0012345`).

**Errors.** Every error goes through `middleware/errorHandler.js` and has the same shape:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Course name, number, section, and semester are required.",
    "details": {},
    "timestamp": "2026-09-26T05:04:49.496Z"
  }
}
```

| HTTP | `code` | Meaning |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Missing or invalid input, malformed ID |
| 400 | `TOKEN_ERROR` | Password reset token unknown or expired |
| 401 | `UNAUTHORIZED` | No token, or an invalid or expired token |
| 401 | `AUTH_ERROR` | Wrong email or password |
| 404 | `NOT_FOUND` | Resource missing, or a course owned by someone else |
| 404 | `EVALUATION_CANCELLED` / `INVALID_TOKEN` | Student evaluation token no longer valid |
| 409 | `DUPLICATE` | Email or student ID already exists |
| 409 | `ALREADY_COMPLETED` | Student already submitted their evaluation |
| 409 | `CONSTRAINT_ERROR` | Team still has students |
| 500 | `SERVER_ERROR` | Unexpected failure (the message is the raw internal error) |
| 501 | `NOT_IMPLEMENTED` | Endpoint exists but does nothing yet |

Two professor endpoints (`/professor/ai-words`) return `{ "error": "Professor not found" }`
on 404 instead of this shape.

---

## 2. Endpoint summary

🔒 = needs a professor token. 🎟 = student evaluation token in the URL. 🌐 = public.

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/health` | 🌐 | Service and database health |
| POST | `/auth/register` | 🌐 | Create a professor account |
| POST | `/auth/login` | 🌐 | Log in, get a token |
| POST | `/auth/logout` | 🔒 | No-op; the client discards the token |
| POST | `/auth/reset-password` | 🌐 | Email a password reset link |
| POST | `/auth/update-password` | 🌐 | Set a new password with the reset token |
| POST | `/auth/refresh` | 🌐 | **501** — not implemented |
| POST | `/auth/verify-mfa` | 🌐 | **501** — not implemented (D-17) |
| GET | `/professor/ai-words` | 🔒 | The professor's concerning-words list |
| POST | `/professor/ai-words` | 🔒 | Add, edit or delete a word |
| GET | `/courses` | 🔒 | List own courses |
| POST | `/courses` | 🔒 | Create (or reactivate) a course |
| POST | `/courses/migrate` | 🔒 | One-off migration of own legacy courses |
| GET | `/courses/:course_id` | 🔒 | One course with its student count |
| PUT | `/courses/:course_id` | 🔒 | Edit a course |
| DELETE | `/courses/:course_id` | 🔒 | Deactivate a course (soft delete) |
| GET | `/courses/:course_id/students` | 🔒 | List students |
| POST | `/courses/:course_id/students` | 🔒 | Add one student |
| PUT | `/courses/:course_id/students/:student_id` | 🔒 | Edit a student, move teams |
| DELETE | `/courses/:course_id/students/:student_id` | 🔒 | Delete a student |
| POST | `/courses/:course_id/students/bulk-delete` | 🔒 | Delete several students |
| DELETE | `/courses/:course_id/students` | 🔒 | Delete all students, teams and evaluations |
| POST | `/courses/:course_id/roster` | 🔒 | Upload a roster CSV |
| GET | `/courses/:course_id/teams` | 🔒 | List teams |
| POST | `/courses/:course_id/teams` | 🔒 | Create teams |
| PUT | `/courses/:course_id/teams/:team_id` | 🔒 | Edit a team |
| DELETE | `/courses/:course_id/teams/:team_id` | 🔒 | Delete an empty team |
| DELETE | `/courses/:course_id/teams` | 🔒 | Delete all teams |
| POST | `/courses/:course_id/teams/auto-assign` | 🔒 | **501** — not implemented |
| POST | `/courses/:course_id/teams/:team_id/students/:student_id` | 🔒 | Add a student to a team |
| DELETE | `/courses/:course_id/teams/:team_id/students/:student_id` | 🔒 | Remove a student from a team |
| POST | `/courses/:course_id/evaluations/send` | 🔒 | Email evaluation invitations to the course |
| POST | `/courses/:course_id/teams/:team_id/evaluations/send` | 🔒 | Email invitations to one team |
| GET | `/courses/:course_id/evaluations/status` | 🔒 | Who has and hasn't submitted |
| POST | `/courses/:course_id/evaluations/remind` | 🔒 | Email reminders to students who haven't submitted |
| DELETE | `/courses/:course_id/evaluations/reset` | 🔒 | Delete all evaluations and tokens |
| GET | `/courses/:course_id/reports` | 🔒 | Course report with grades |
| GET | `/courses/:course_id/reports/download` | 🔒 | Course report as CSV |
| POST | `/courses/:course_id/reports/generate` | 🔒 | Same as `GET /reports` |
| GET | `/courses/:course_id/reports/student/:student_id` | 🔒 | One student's report |
| GET | `/courses/:course_id/reports/team/:team_id` | 🔒 | One team's report |
| GET | `/evaluate/:token` | 🎟 | Evaluation form for a student |
| POST | `/evaluate/:token` | 🎟 | Submit evaluations |
| GET | `/evaluate/:token/status` | 🎟 | Check whether a token is valid and used |
| POST | `/ai/summarize`, `/ai/red-flags`, `/ai/sentiment` | 🔒 | **501** — not implemented |

---

## 3. Health

### `GET /api/health`

Used by Render before switching traffic to a new deploy, and planned as the CD
readiness check. Returns **200** when the database is connected, **503** otherwise.

```json
{ "status": "OK", "database": "connected", "timestamp": "2026-09-26T05:04:42.245Z",
  "commit": "6db1d1fdeed5fe1d3f7a9505f8ac76a56f881acb" }
```

`status` is `OK` or `DEGRADED`. `commit` comes from Render's `RENDER_GIT_COMMIT` and is
`null` elsewhere.

---

## 4. Authentication — `/api/auth`

### `POST /auth/register`

Open to anyone (see CW-11: the sponsor has not yet confirmed that public professor
sign-up is intended).

| Body field | Required | Notes |
|---|---|---|
| `email` | yes | Must be unique |
| `password` | yes | Stored as a bcrypt hash (10 rounds). No strength rule is enforced |
| `name` | yes | |
| `department` | yes | |

**201** `{ "message": "Registration successful.", "professor_id": "<id>" }` ·
**400** missing field · **409** `DUPLICATE` email already registered.

### `POST /auth/login`

Body: `{ "email", "password" }`.

**200**
```json
{
  "access_token": "<JWT>",
  "professor": { "id": "<id>", "email": "...", "name": "...", "department": "...",
                 "mfa_enabled": false, "created_at": "...", "last_login": "..." }
}
```
If `mfa_enabled` is true the response is `{ "mfa_required": true, "professor_id": "<id>" }`
instead, and the user can't finish logging in because `/auth/verify-mfa` is not
implemented (D-17). **400** missing field · **401** `AUTH_ERROR` (same message for an
unknown email and a wrong password).

The token payload is `{ id, email, name, iat, exp }`.

### `POST /auth/logout` 🔒

**200** `{ "message": "Logout successful." }`. The server keeps no session, so this
does nothing; the frontend deletes the token.

### `POST /auth/reset-password`

Body: `{ "email" }`. Always answers **200**
`{ "message": "If the email is registered, a reset link will be sent." }` so it doesn't
reveal which emails exist. For a registered email it stores a random 32-byte token valid
for **1 hour** and emails `FRONTEND_URL/reset-password/<token>`. **400** without email.

### `POST /auth/update-password`

Body: `{ "token", "password" }`. **200** `{ "message": "Password updated successfully." }`
and the token is cleared, so it works once. **400** `VALIDATION_ERROR` missing field ·
**400** `TOKEN_ERROR` unknown or expired token.

### `POST /auth/refresh`, `POST /auth/verify-mfa`

Both return **501** `NOT_IMPLEMENTED`.

---

## 5. Professor settings — `/api/professor` 🔒

### `GET /professor/ai-words`

**200** `{ "words": ["cheat", "abuse", ...] }`. New accounts get a default list of 46
words (`models/Professor.js`).

### `POST /professor/ai-words`

| `action` | Other fields | Effect |
|---|---|---|
| `add` | `word` | Append a word |
| `edit` | `index`, `word` | Replace the word at `index` |
| `delete` | `index` | Remove the word at `index` |

**200** `{ "words": [...] }` with the updated list. An unknown action or a bad index is
ignored and the list comes back unchanged. The course report uses this list to flag
feedback (FR-22).

---

## 6. Courses — `/api/courses` 🔒

### `GET /courses`

Lists the logged-in professor's courses. Optional query filters (case-insensitive
partial match): `course_name`, `course_number` (also matches the legacy `course_code`),
`course_section`, `semester`. `course_status` defaults to `Active`; pass `Inactive` for
deactivated courses or an empty value for all.

**200** an array of courses, each with a live `team_count`.

### `POST /courses`

Body: `{ "course_name", "course_number", "course_section", "semester" }`, all required.

**201** `{ "id": "<id>", "message": "Course created." }`. If an **Inactive** course with
the same four values exists, it is reactivated instead: **200**
`{ "id": "<id>", "message": "Course reactivated." }`.

### `GET /courses/:course_id`

**200** the course document plus `student_count`, counted live from the students
collection.

### `PUT /courses/:course_id`

Body: any of `course_name`, `course_number`, `course_section`, `semester`,
`course_status` (`Active` or `Inactive`). Other fields, including `professor_id`, are
ignored. **200** `{ "message": "Course updated." }`.

### `DELETE /courses/:course_id`

Soft delete: sets `course_status` to `Inactive`. Students, teams and evaluations are
kept, and creating the same course again reactivates it.
**200** `{ "message": "Course deleted successfully." }`.

### `POST /courses/migrate`

One-off helper that fills in `course_number`, `course_section`, `course_status` and the
counters on the professor's courses created by the previous version of the app.
**200** `{ "message", "migratedCount", "totalFound" }`.

---

## 7. Students — `/api/courses/:course_id/students` 🔒

A student record belongs to one course. `student_id` in request bodies is the
**university ID**; `:student_id` in paths is the record's ObjectId.

### `GET .../students`

**200** an array of students (`_id`, `student_id`, `name`, `email`, `team_id`,
`group_assignment`, `evaluation_token`, `evaluation_completed`, `created_at`).

### `POST .../students`

Body: `{ "student_id", "name", "email", "group_assignment"? }`. A non-empty
`group_assignment` puts the student in that team, creating the team if needed.
**201** `{ "message": "Student added.", "student": {...} }` · **400** missing field ·
**409** `DUPLICATE` university ID already in this course.

### `PUT .../students/:student_id`

Body: fields to change. Changing `group_assignment` moves the student to that team
(creating it if needed), and an empty value removes them from their team. Team and course
counts are updated. **200** `{ "message": "Student updated." }` · **404** not in this course.

### `DELETE .../students/:student_id`

**200** `{ "message": "Student deleted." }`. Team and course counts are updated.

### `POST .../students/bulk-delete`

Body: `{ "student_ids": ["<ObjectId>", ...] }`. Also deletes the evaluations other
students wrote about them. **200** `{ "message": "Students deleted.", "deleted_count": 3 }`.

### `DELETE .../students`

Deletes **every** student, team and evaluation in the course.
**200** `{ "message", "deleted_students", "deleted_evaluations", "deleted_teams" }`.

### `POST /courses/:course_id/roster`

Multipart form with the CSV in the field `file` (format: [csv-upload-format.md](../csv-upload-format.md)).
New students are created, existing ones (same university ID) are updated, and teams are
created from the group column.

> **Warning:** every roster upload first **deletes all submitted evaluations** for the
> course and clears all evaluation tokens, even when students have already submitted.

**200** `{ "message", "students": [ids added], "students_updated": [...], "teams_created",
"team_names": [...], "evaluations_cleared", ... }`. Rows with problems come back in an
`errors` array. **400** no file.

---

## 8. Teams — `/api/courses/:course_id/teams` 🔒

| Method and path | Body | Success |
|---|---|---|
| `GET .../teams` | — | **200** array of teams |
| `POST .../teams` | `{ "teams": [{ "team_name": "Team A" }, ...] }` | **201** `{ "message": "Teams created.", "teams": [ids] }` |
| `PUT .../teams/:team_id` | fields to change, for example `team_name`, `team_status` | **200** `{ "message", "team" }`. Renaming also updates each member's `group_assignment` |
| `DELETE .../teams/:team_id` | — | **200** `{ "message" }`. **409** `CONSTRAINT_ERROR` if the team still has students |
| `DELETE .../teams` | — | **200** `{ "message", "teams_deleted" }`. Students are kept and unassigned |
| `POST .../teams/auto-assign` | — | **501** `NOT_IMPLEMENTED` |
| `POST .../teams/:team_id/students/:student_id` | — | **200** `{ "message", "team", "student" }`. **409** `DUPLICATE` if already a member |
| `DELETE .../teams/:team_id/students/:student_id` | — | **200** `{ "message", "team", "student" }`. **404** if not a member |

---

## 9. Evaluation management — `/api/courses/:course_id/evaluations` 🔒

Sending runs inside the request: emails go out one at a time, `EMAIL_SEND_INTERVAL_MS`
apart (11 s on staging, because Mailtrap's free plan allows one email every 10 s). A large
class therefore makes a long request. The frontend waits up to 3 minutes.

### `POST .../evaluations/send` and `POST /courses/:course_id/teams/:team_id/evaluations/send`

Body (optional): `{ "deadline": "2026-10-10", "custom_message": "..." }`. Students
without an evaluation token get one, then each receives an email with
`FRONTEND_URL/evaluate/<token>`.

**200**
```json
{ "message": "Evaluation invitations sent successfully.", "emails_sent": 2,
  "total_students": 3, "failed": ["Carol (carol@example.com): <error message>"],
  "deadline": "2026-10-10" }
```
Partial failures still answer 200: check `failed`, a list of `"Name (email): error"` strings. **404** no students in the course or team.

### `GET .../evaluations/status`

**200**
```json
{ "total_count": 3, "completed_count": 1, "pending_count": 2, "completion_rate": 33,
  "evaluations_sent": true,
  "students": [{ "student_id": "S001", "name": "Alice", "email": "...", "team": "Team A",
                 "completed": true, "evaluation_token": "...", "last_activity": "..." }] }
```

### `POST .../evaluations/remind`

Body (optional): `{ "student_ids": [...] }` is meant to remind only some students, but it
is currently ignored (API-8), so everyone who hasn't submitted is reminded. **200** `{ "message", "reminders_sent", "total_reminded",
"failed": [...] }`, or `reminders_sent: 0` when everyone is done.

### `DELETE .../evaluations/reset`

Deletes every evaluation in the course and clears all tokens, so old links stop working.
**200** `{ "message", "tokens_cleared", "evaluations_deleted" }`.

---

## 10. Reports — `/api/courses/:course_id/reports` 🔒

### `GET .../reports` (and `POST .../reports/generate`)

| Query parameter | Default | Meaning |
|---|---|---|
| `gradingMethod` | `mean` | `mean` or `curved` |
| `boostFactor` | `0.5` | Curved only: how far a low score moves toward the class mean |
| `protectionThreshold` | `80` | Curved only: scores at or above this are not changed |

**Scoring.** Each student's score is the mean of all ratings they received, as a
percentage (mean × 20). Participation is rated 1–4 and scaled by 5/4 first (D-19). Letter
grades: A ≥ 90, B ≥ 80, C ≥ 70, D ≥ 60, otherwise F. Curved: `score + boostFactor × (mean
− score)` for scores below the threshold.

**200**
```json
{
  "course": { ... },
  "students": [{ "...student fields": "", "originalScore": 79.17, "finalScore": 79.17,
                 "letterGrade": "C", "evaluationsReceived": 2, "improvement": 0,
                 "evaluationDetails": [{ "...evaluation": "",
                   "aiFlags": { "allFive": false, "concerning": true, "flagged": true } }] }],
  "teams": [{ "...team fields": "", "students": [...], "averageScore": 70,
              "letterGrade": "C" }],
  "summary": { "totalStudents": 8, "studentsWithEvaluations": 8, "averageScore": 74.5,
               "gradeDistribution": { "A": 1, "B": 2, "C": 2, "D": 2, "F": 1 } },
  "gradingMethod": "mean",
  "gradingSettings": null
}
```
With no students or no evaluations yet, the response has a `message` and empty lists.
`aiFlags.flagged` is true when all five 1–5 ratings are 5, or when the feedback contains
a word from the professor's list (substring match, ignoring case).

### `GET .../reports/download`

Same query parameters. Returns `text/csv; charset=utf-8` as
`course_<id>_report.csv` with the columns Student ID, Name, Email, Team, Original
Score, Final Score, Letter Grade, Evaluations Received, Improvement. Fields are quoted per
RFC 4180, and text starting with `=`, `+`, `-` or `@` gets a leading `'` so spreadsheets
don't run it as a formula.

### `GET .../reports/student/:student_id`

`:student_id` is the **university ID**. **200** `{ "student", "meanScore", "letterGrade",
"evaluationsReceived", "evaluationsGiven", "detailedEvaluations": [...] }` · **404** unknown.

### `GET .../reports/team/:team_id`

**200** `{ "team", "members": [{ ..., "meanScore", "letterGrade", "evaluationsReceived" }],
"teamAverage", "teamLetterGrade" }` · **404** unknown team.

---

## 11. Student evaluation — `/api/evaluate/:token` 🎟

These are the only endpoints students use. The token comes from the invitation email.

### `GET /evaluate/:token`

**200** the form:
```json
{
  "evaluator": { "name": "Alice", "student_id": "S001", "team": "Team A" },
  "course": { "name": "...", "number": "...", "section": "...", "semester": "..." },
  "teammates": [{ "_id": "<ObjectId>", "name": "Bob", "student_id": "S002" }],
  "rubric": { "title": "...", "criteria": [ ... ] },
  "token": "<token>"
}
```
Teammates are the other members of the student's team, or everyone else in the course if
they have no team. If already submitted: **200** `{ "message": "Evaluation already
completed.", "completed": true, "submitted_at": "..." }`. **404**
`EVALUATION_CANCELLED` for an unknown or reset token.

### `POST /evaluate/:token`

```json
{
  "evaluations": [{
    "student_id": "<teammate ObjectId>",
    "ratings": { "professionalism": 4, "communication": 4, "work_ethic": 5,
                 "content_knowledge_skills": 4, "overall_contribution": 4, "participation": 3 },
    "overall_feedback": "Reliable teammate, always met deadlines."
  }]
}
```
Ratings are 1–5, except `participation`, which is 1–4 (D-19). `overall_feedback` needs at
least 10 characters (FR-14 asks for 50–500). Every evaluation is validated before any is
saved (FR-16), so a submission is all-or-nothing.

**201** `{ "message": "Evaluation submitted successfully.", "evaluations_count": 2,
"submitted_at": "..." }` · **400** `VALIDATION_ERROR` · **404** `EVALUATION_CANCELLED` ·
**409** `ALREADY_COMPLETED`.

### `GET /evaluate/:token/status`

**200** `{ "valid": true, "completed": false, "student_name": "Alice", "course_name":
"..." }` · **404** `INVALID_TOKEN`.

---

## 12. Not implemented

`/auth/refresh`, `/auth/verify-mfa`, `/courses/:course_id/teams/auto-assign` and the three
`/ai/*` endpoints are routed but return **501**. The frontend's AI-flagging feature does
not use `/ai/*`; flags are computed inside the course report (section 10).

## 13. Known API issues

Found while writing this document. Defect IDs refer to the
[technical assessment report](../technical-assessment/technical-assessment-report.md).

| # | Issue | Risk |
|---|---|---|
| API-1 | Student evaluation tokens are generated with `Math.random()`, which is not cryptographically random, and never expire | A token is the only credential for a student's form; it should come from `crypto.randomBytes` and expire after the deadline |
| API-2 | `POST /evaluate/:token` does not check that each `student_id` is one of the evaluator's teammates, or that it appears only once | A student can rate themselves, rate someone outside their team, or rate one teammate twice, which changes grades |
| API-3 | Uploading a roster deletes every submitted evaluation in the course | Re-uploading a corrected roster mid-evaluation silently destroys student work |
| API-4 | `PUT .../students/:student_id` and `PUT .../teams/:team_id` save the request body as sent | Within their own course a professor can overwrite system fields (for example `course_id`) |
| API-5 | No rate limiting on `/auth/login`, `/auth/reset-password` or `/evaluate/*` | Password guessing and reset-email flooding are unthrottled |
| API-6 | 500 responses include the raw internal error message | Can leak database or library details |
| API-7 | Sending invitations and reminders happens inside the HTTP request | About 16 students fit in the frontend's 3-minute timeout on staging's email pace |
| API-8 | `remindEvaluations` builds its query with `_id` twice, so the second key replaces the first and `student_ids` is ignored | Latent: the frontend never sends `student_ids` today, but a client that does would email every student who hasn't submitted |
