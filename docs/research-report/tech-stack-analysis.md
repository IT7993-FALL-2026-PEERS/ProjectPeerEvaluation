# Tech Stack Analysis

**Gantt task:** Technical Assessment — *"Review software architecture & technology stack"* (M1)
**Milestone:** 1 — Assessment & Planning
**Status:** Complete for review. Versions read from the lockfiles on `main` at commit
`11cfd3d`; latest versions and audit results checked on 26 Sep 2026
**Related:** [../architecture/system-architecture.md](../architecture/system-architecture.md) ·
[../stack-review-output.txt](../stack-review-output.txt) (raw review output, 16 Sep) ·
[technical assessment report](../technical-assessment/technical-assessment-report.md) §2

This analysis looks at each part of the stack PEERS inherited: what is installed, whether
it's still maintained, what risk it carries, and what we recommend. Replacing the tech
stack is **out of scope** for this capstone, so every recommendation keeps the current
stack and focuses on patching, trimming and containing risk.

---

## 1. Summary

| Layer | Technology | Installed | Latest | Verdict |
|---|---|---|---|---|
| Runtime | Node.js | 24 (`.nvmrc`, `engines: >=24`, CI, Render) | 24 LTS | ✅ Keep |
| Frontend library | React | 19.1.1 | 19.3.0 | ✅ Keep; minor updates via Dependabot |
| Frontend routing | React Router | 7.9.1 | 7.18.4 | ⚠️ Update: known high-severity advisory, fix available |
| UI components | MUI (`@mui/material`, icons) | 7.3.2 | 9.4.0 | ✅ Keep on 7; majors are optional |
| HTTP client | axios | 1.12.1 | 1.20.0 | ⚠️ Update: known high-severity advisory, fix available |
| Build tooling | Create React App (`react-scripts`) | 5.0.1 (Apr 2022) | 5.0.1 | 🔴 Unmaintained; main source of audit findings (§3) |
| Backend framework | Express | 4.22.3 | 5.2.1 | ✅ Keep on 4 for now |
| Database | MongoDB (Atlas on staging) + Mongoose | Mongoose 8.24.4 | 9.10.2 | ✅ Keep on 8 |
| Auth | jsonwebtoken, bcryptjs | 9.0.2, 2.4.3 | 9.0.3, 3.0.3 | ✅ Keep |
| Email | Nodemailer | 10.0.10 | 10.0.10 | ✅ Current (upgraded in PR #49) |
| File upload / CSV | multer, csv-parser | 2.4.0, 3.2.0 | 2.4.0, 3.2.1 | ✅ Current |
| Unit tests | Jest 27 (bundled with CRA) + React Testing Library 16; `node:test` for the backend | — | Jest 30 | ⚠️ Frontend Jest is tied to CRA |
| End-to-end tests | Playwright | 1.63.0 | 1.63.0 | ✅ Current |
| Linting | ESLint 8 via `eslint-config-react-app` | 8.57.1 | 10.11.0 | ⚠️ ESLint 8 is past end of life; tied to CRA |
| CI/CD | GitHub Actions, actionlint, Dependabot, OWASP Dependency-Check, Render | — | — | ✅ Keep |
| Containers | Docker, Docker Compose | none working | — | 🔴 Not started (D-05, D-06) |

**Against the sponsor's suggested stack** (Node.js, React, MongoDB, Docker): Node, React
and MongoDB match. Docker is the gap, and it's scheduled for Milestone 2.

**Runtime version (resolves D-07).** The 16 Sep stack review recorded Node 20.12.2 because
that was the reviewer's machine. The project's declared runtime is Node 24 everywhere
that matters: `.nvmrc`, `package.json` `engines`, the CI workflows and `NODE_VERSION` in
`render.yaml`. Node 20 leaves maintenance in April 2026, and nodemailer 10 already
requires Node 20 or newer.

---

## 2. Frontend

**React 19, React Router 7, MUI 7.** A current, well-supported combination. The app
uses `BrowserRouter` (switched from `HashRouter` in PR #32 so emailed links work) and
MUI for all UI. Keep them, and take minor and patch updates through Dependabot's weekly
grouped pull requests.

**axios and React Router need updating now.** Both ship to users' browsers and both have
high-severity advisories with a fix inside the current major version
(`npm audit fix`). This is the cheapest real security win in the frontend.

**Ten declared frontend packages are never imported** by the frontend code:

| Package | Why it's unused |
|---|---|
| `@mui/x-data-grid` | Tables are built with plain MUI components |
| `chart.js`, `react-chartjs-2`, `recharts` | Reports show no charts |
| `formik`, `yup` | Forms use React state |
| `date-fns` | Not used |
| `react-dropzone` | The roster upload uses a plain file input |
| `multer`, `csv-parser` | Server-side packages; the backend has its own copies (D-12) |

Removing them shrinks the install, the attack surface and the audit report. `multer`
alone accounts for one high-severity finding in the frontend audit. The README's Tech
Stack section also lists Formik, Yup, Chart.js and Recharts as if they were in use.
`babel-eslint` in `devDependencies` is also unused: the lint configuration extends
`react-app`.

**Create React App is the frontend's main risk.** See §3.

---

## 3. Create React App (`react-scripts`)

`react-scripts` 5.0.1 was released in April 2022 and has had no release since. The React
team has deprecated Create React App for new projects. It pins old versions of webpack,
Jest 27, ESLint 8, Babel, SVGO and the dev server, and those pinned versions carry most of
the frontend's security findings.

**Frontend `npm audit` (26 Sep 2026): 64 findings: 2 critical, 35 high, 15 moderate,
12 low.**

| Group | Findings | Fix |
|---|---|---|
| Fixable inside current versions (includes axios, React Router, `@babel/core`, `multer`) | 39 | `npm audit fix` |
| Reachable only through `react-scripts` (webpack, Jest 27, SVGO, workbox, dev server, including both criticals: `shell-quote` and `websocket-driver`) | 25 | None without replacing `react-scripts` |

How much this matters:
- The 25 `react-scripts` findings are in **build and development tooling**. They run on a
  developer's machine or the CI runner, not in the static files served to users. They
  matter for supply-chain hygiene more than for the running app.
- CRA's bundled Jest 27 can't load React Router 7 as-is. We added a `moduleNameMapper`
  and a `TextEncoder` polyfill in PR #32. More workarounds like this should be expected.

**Options:**
1. **Keep CRA and contain the risk (recommended for this capstone).** Run
   `npm audit fix` for the 39 fixable findings. In the OWASP triage (week of 19 Oct),
   record the 25 CRA findings as accepted build-time risks with a written reason, so they
   don't block the quality gate. No change to how the app is built.
2. **Migrate the build to Vite** (with Vitest for unit tests). This removes the
   `react-scripts` findings and the Jest workarounds, but it replaces part of the tech
   stack, which is out of scope. Raise it with the sponsor as a recommendation for whoever
   maintains PEERS next.

---

## 4. Backend

**Express 4.22.3.** Express 5 is the current major, but it changes routing and error
handling, and Express 4 still receives security fixes. Stay on 4 during the capstone.
Upgrading is a sensible follow-up once integration tests exist to catch regressions.

**Mongoose 8.24.4 on MongoDB.** Mongoose 9 exists; 8 is still supported. Stay on 8.
The schema-level validation (for example the 1–5 rating ranges) is part of the business
rules, so a Mongoose major upgrade needs the integration tests first.

**Authentication: jsonwebtoken 9 and bcryptjs 2.4.3.** Both are fine. bcryptjs 3 changes
the default hash prefix, which is harmless but needs a test before upgrading. The
weaknesses are in how these are used (1-hour sessions in `localStorage`, no rate
limiting, weak student tokens), covered in the
[system architecture](../architecture/system-architecture.md#6-security-model) security model.

**Nodemailer 10.0.10.** Upgraded from 7 in PR #49 to clear two high-severity advisories;
SMTP certificate checking is back on. The backend `npm audit` is now **0 findings**.

**Not present, worth adding:** a rate limiter (`express-rate-limit`) for login, password
reset and the student evaluation endpoints. It's small and within scope.

---

## 5. Testing and quality tooling

| Tool | Where | Notes |
|---|---|---|
| Jest 27 + React Testing Library 16 | Frontend unit tests (`npm test`) | Jest is bundled with CRA and can't be upgraded on its own |
| `node:test` (built into Node 24) | Backend unit tests (`cd src/backend && npm test`) | No extra dependency; 140 tests on 26 Sep |
| Playwright 1.63 | End-to-end tests (`npm run test:e2e`) | Only a setup smoke test so far |
| ESLint 8 (`eslint-config-react-app`) | `npm run lint`, frontend only | ESLint 8 is past end of life; the backend isn't linted |
| Prettier 3 | Installed | No script or CI step uses it |

Gaps for Milestone 2: a real MongoDB for integration tests (a MongoDB service container
in CI, or `mongodb-memory-server`), linting for the backend, and coverage reporting with
a threshold (D-16).

---

## 6. CI/CD and hosting

| Tool | Role | Status |
|---|---|---|
| GitHub Actions (`ci.yml`) | Lint, unit tests, build, E2E smoke, workflow lint; 4 required checks on `main` | Live |
| actionlint | Checks the workflow files | Live |
| Dependabot | Weekly grouped update pull requests for npm (root and backend) and Actions | Live |
| OWASP Dependency-Check (`security.yml`) | Dependency vulnerability scan on every pull request, `main` and weekly | Live, report-only |
| Render.com | Staging: backend web service (Starter plan) and frontend static site, from `render.yaml` | Live; deploys `main` after checks pass |
| MongoDB Atlas | Staging database (M0 free tier) | Live |
| Mailtrap Email Sandbox | Staging SMTP; captures email instead of delivering it | Live; free plan limits sending to one email every 10 s |
| Docker / Docker Compose | Local environment and the images the CD pipeline will deploy | Not started (Milestone 2) |

Render was proposed by the team and approved by the sponsor. Production hosting is out
of scope: the pipeline ends at a manual sponsor approval gate.

---

## 7. Recommendations

In priority order. None of them replaces part of the stack.

| # | Recommendation | Effort | When |
|---|---|---|---|
| 1 | `npm audit fix` in the frontend (39 findings, including axios and React Router) | Small | Now |
| 2 | Remove the 10 unused frontend packages and `babel-eslint`; correct the README's Tech Stack list | Small | Now |
| 3 | Triage OWASP results: accept the 25 CRA build-time findings with reasons, then fail CI on new high-severity findings | Medium | Week of 19 Oct (M3) |
| 4 | Add `express-rate-limit` to auth and evaluation endpoints | Small | Milestone 2 |
| 5 | Write the Dockerfiles and a MongoDB-based `docker-compose.yml` | Medium | Milestone 2 (M2) |
| 6 | Pick the integration-test database approach (service container or `mongodb-memory-server`) | Decision | By 5 Oct |
| 7 | Lint the backend (ESLint with a Node config) | Small | Milestone 2 |
| 8 | Recommend a Vite migration to the sponsor as future work, not part of this project | — | Final report |
