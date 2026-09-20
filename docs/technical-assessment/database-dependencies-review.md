# Database Architecture & External Dependencies Review

**Author:** Kylee Gipson (M5) — Milestone 1, item 1.3
**Scope:** MongoDB/Mongoose data model and every external service the backend depends on.

## Data Model (MongoDB via Mongoose)

Six collections define the application's core data:

| Model | Purpose | Key relationships |
|---|---|---|
| Professor | Instructor account, auth, and settings | Owns many Courses |
| Course | A class section | Belongs to a Professor; has many Teams and Students |
| Team | A student grouping within a course | Belongs to a Course; references Students |
| Student | A roster entry | Belongs to a Course; optionally belongs to a Team |
| Evaluation | One peer review submission | References a Course, the Student being evaluated, and the Student submitting (evaluator) |
| Report | Aggregated results for a course | Belongs to a Course; stores summary stats and loosely-typed report data |

### Notable findings

- **Rubric criteria are hardcoded, not database-driven.** `src/backend/config/rubric.js` defines a single fixed evaluation rubric (professionalism, communication, work ethic, content knowledge/skills, overall contribution, participation), explicitly commented as "the hardcoded rubric provided by sponsors." There is no Rubric model or per-course customization — despite "peer evaluation rubric management" being listed as a core workflow in the project spec.
- **Team membership is tracked in two places** with no visible sync mechanism: `Team.students[]` (array of Student references) and `Student.team_id` (a reverse reference). These could drift out of sync if only one side is updated.
- **AI red-flag detection already exists at the schema level.** `Professor.aiConcerningWords` stores a large default keyword list (e.g. "harass," "discriminate," "unfair grading") used to flag concerning language in feedback — this is existing functionality, not something to build, despite the original application's documented feature list listing it as optional/future scope.
- **`Report.team_reports`, `student_reports`, and `ai_insights`** are typed as generic `Object`/`[Object]` with no schema enforcement, which will matter for anyone writing tests against report generation.

## External Dependencies

Sourced from `src/backend/.env.example`:

| Variable | Purpose |
|---|---|
| `MONGODB_URI` | MongoDB connection string |
| `SMTP_HOST` | Outgoing email server |
| `SMTP_PORT` | Email server port |
| `SMTP_USER` | Email account username |
| `SMTP_PASS` | Email account password |
| `SMTP_FROM` | Sender address for outgoing evaluation emails |
| `FRONTEND_URL` | Base URL the backend uses to build evaluation links |

Backend npm dependencies tied to external services: `mongoose` (MongoDB), `nodemailer` (email), `jsonwebtoken` + `bcryptjs` (authentication), `multer` + `csv-parser` (roster CSV upload).

### Notable findings

- **A real `.env` file is committed to the repository**, alongside `.env.example`. If it contains live credentials (Mongo URI, SMTP password, etc.), that's a credential-exposure issue worth flagging to the team as a known defect — not something to fix unilaterally, but worth surfacing.
- **No `JWT_SECRET` (or equivalent) appears in `.env.example`**, despite `jsonwebtoken` being a dependency. Either the secret is hardcoded elsewhere in the codebase or it's an undocumented required variable — worth confirming before Milestone 2's auth testing begins.

## Open items

- Contents of `src/backend/config/db.js` (connection setup) not yet confirmed.
- Confirm whether `JWT_SECRET` is defined and where.
