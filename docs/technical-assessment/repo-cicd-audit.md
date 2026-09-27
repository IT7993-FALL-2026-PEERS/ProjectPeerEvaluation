# Repository, Dependency and Workflow Audit

**Owner:** M1 Donald Gobin
**Milestone:** 1, Assessment & Planning
**Audited:** 27 September 2026, against `main` at `cccaf4f`
**For:** Laeticia (requirements, week 2) and Aaron (secrets checklist)

This audit covers the repo layout, Node version, npm scripts, dependencies, config and
secrets, existing automation, and the GitHub repository settings. The inventory comes
first (sections 1–6). The findings follow in section 7, numbered **A-01** to **A-17** so
issues and the RTM can reference them. Section 8 lists the entries in
[technical-assessment-report.md](technical-assessment-report.md) that are now out of date.

**Method.** All commands ran on a clean `git clone` using Node 24.21.0 / npm 11.19.0, the
version `.nvmrc` pins, so the results match what CI sees. The GitHub settings were read
through the REST API with an admin token. Secret values were never printed. The scan
reported only whether a value existed and its shape.

---

## 1. Layout

A single repo that is **not** set up as an npm workspace. There are two independent
npm projects:

| App | Path | package.json | Lockfile | Entry point |
|---|---|---|---|---|
| React frontend (Create React App) | repo root, source in `src/frontend/` (+ `src/index.js`, `public/`) | `/package.json` (`peer-evaluation-frontend`) | `/package-lock.json` (lockfileVersion 3) | `src/index.js` |
| Express backend | `src/backend/` | `src/backend/package.json` (`peer-evaluation-backend`) | `src/backend/package-lock.json` | `src/backend/index.js` |

- Those are the only two `package.json` files and the only two lockfiles. There is no
  `yarn.lock`, `pnpm-lock.yaml` or `.npmrc`.
- The root `postinstall` script runs `cd src/backend && npm ci`, so one `npm ci` at the
  root installs both apps (see A-12).
- Playwright E2E tests are in `e2e/` and use the root `playwright.config.js`.
- `build/` holds compiled frontend output and **is tracked in git** (see A-11).

## 2. Node version

| Source | Value |
|---|---|
| `.nvmrc` | `24` |
| Root `package.json` `engines.node` | `>=24` |
| `src/backend/package.json` `engines` | *(none)* |
| CI (`ci.yml`, all jobs) | `node-version-file: .nvmrc`, so **24** ✅ |
| Render (`render.yaml`, both services) | `NODE_VERSION: "24"` ✅ |

CI and Render already match `.nvmrc`. Any new workflow should keep using
`node-version-file: .nvmrc` and not hard-code a version. The lockfiles were written by
npm 11, which needs Node ≥ 20.17. Nothing enforces the version locally (see A-13).

## 3. npm scripts

| Script | Frontend (root) | Backend (`src/backend`) | Verified on Node 24 |
|---|---|---|---|
| `lint` | ✅ `eslint src/frontend --ext .js,.jsx --max-warnings=0` | ❌ none | Frontend: 0 warnings |
| `test` | ✅ `react-scripts test` (Jest 27 via CRA) | ✅ `node --test "tests/**/*.test.js"` | Frontend: 8 suites, 30 tests pass. Backend: 140 tests pass |
| `test:e2e` | ✅ `playwright test` | – | Runs in CI (smoke only) |
| `build` | ✅ `react-scripts build` | ❌ none (plain Node, nothing to build) | Frontend builds |
| `start` | ✅ `react-scripts start` (dev server) | ✅ `node index.js` | – |
| Other | `dev`, `start:backend`, `start:frontend`, `setup`, `postinstall`, `eject` | – | – |

What CI calls today: root `npm ci`, `npm run lint`, `npm test -- --watchAll=false`,
`npm run build`, `npm run test:e2e`, and in the backend `npm ci`, `node --check` on every
file, and `npm test`. The one gap is a **backend lint** step. It needs an ESLint config
and a `lint` script first (A-16).

## 4. Dependencies

Results of `npm ls --depth=0`, `npm outdated` and `npm audit` in each app.

### 4.1 Frontend (root)

- **Direct dependencies:** 12 runtime and 13 dev. `npm ls` is clean after `npm ci`.
- **`npm audit`: 29 vulnerabilities (14 high, 6 moderate, 9 low, 0 critical).**
  - **26 of the 29** come through `react-scripts@5.0.1`: svgo, nth-check, postcss,
    serialize-javascript, workbox, webpack-dev-server/sockjs/uuid, and jsdom/jest.
    Their only "fix" is `npm audit fix --force`, which would install `react-scripts@0.0.0`,
    so it is not a real option.
  - **3 can be fixed now without breaking changes:** `underscore` (high, pulled in via
    `jsonpath` and `bfj`) and `yaml` (moderate). Running `npm audit fix` clears them.
  - All 29 affect **build and test tooling only**, not code shipped in the browser bundle.
    However, `react-scripts` is listed in `dependencies`, so `npm audit --omit=dev`
    still reports all 29 (A-09).
- **Outdated (within range, safe to take):** react/react-dom 19.1.1 → 19.3.0,
  @mui/* 7.3.2 → 7.3.11, prettier 3.6.2 → 3.9.9, and the @testing-library/* patch releases.
- **Outdated (major, needs review):** @mui/* → 9, eslint 8 → 10,
  eslint-plugin-react-hooks 5 → 7, @babel/core 7 → 8, @testing-library/jest-dom 6 → 7,
  concurrently 7 → 10, cross-env 7 → 10.

### 4.2 Backend (`src/backend`)

- **Direct dependencies:** 9, all runtime. There are no devDependencies because the tests
  use the built-in `node:test`.
- **`npm audit`: 0 vulnerabilities.**
- **Outdated (within range):** cors 2.8.6, csv-parser 3.2.1, jsonwebtoken 9.0.3,
  nodemailer 10.0.11.
- **Outdated (major):** express 4 → 5, mongoose 8 → 9, dotenv 16 → 18, bcryptjs 2 → 3.
  Express 5 and Mongoose 9 need real migration work, so treat them as M2+ decisions,
  not Dependabot merges.

## 5. Config and secrets

### 5.1 Files

| File | Tracked? | Contents |
|---|---|---|
| `src/backend/.env` | **Yes** | One key: `MONGO_URI` pointing at **localhost**, with no username or password |
| `src/backend/.env.example` | Yes | Placeholders for `MONGODB_URI`, `JWT_SECRET`, `SMTP_*`, `FRONTEND_URL`, `EMAIL_SEND_INTERVAL_MS` |
| `render-env-variables.txt` | Yes | Placeholders only (`username:password@cluster…`, `your-app-password`) |
| `render.yaml` | Yes | Secrets marked `sync: false` (entered in the Render dashboard). `JWT_SECRET` uses `generateValue: true` |
| `docker-compose.yml` | Yes | Dummy values `secure_password` and `your-secret-key` for a Postgres setup that isn't used |
| `src/backend/config/*` | Yes | No secrets. `db.js` and `corsConfig.js` are one-line leftover stubs |
| `.gitignore` | Yes | Ignores `node_modules`, `coverage` and the Playwright output only. **No `.env`, `build` or `uploads` entries** |

### 5.2 Secret scan result

Every added line in the full history (254 commits, all branches) was searched for
connection strings with credentials, `*_KEY`/`*_SECRET`/`*_PASS`/`token` assignments,
private keys, and AWS, GitHub, OpenAI, Slack and SendGrid token formats.

**No real credentials were found, so nothing needs rotating.** Details:

- The only `mongodb+srv://` URI ever committed (`54cb85f`, `render-env-variables.txt`) is
  the placeholder `username:password@cluster.mongodb.net`.
- The committed `.env` has only ever held a localhost URI.
- The only other hits are **known development passwords**, which are not secrets but still
  matter (A-04).

This result covers the git repo only. The live values in the Render dashboard, MongoDB
Atlas and the SMTP account were not visible to this audit. Aaron's checklist should
record who holds each of those and when it was last rotated.

### 5.3 Environment variables the backend reads

`MONGODB_URI` (falls back to `MONGO_URI`), `JWT_SECRET`, `NODE_ENV`, `PORT`, `FRONTEND_URL`,
`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`, `SMTP_SECURE`,
`SMTP_SERVICE`, `EMAIL_SEND_INTERVAL_MS`. The frontend reads `REACT_APP_API_URL` at build
time. See A-14 for the ones that aren't documented.

## 6. Existing automation and GitHub settings

### 6.1 In the repo

| Item | State |
|---|---|
| `.github/workflows/ci.yml` | PRs and pushes to `main`. Four jobs: Frontend (lint, test, build), Backend (`npm ci`, `node --check`, `npm test`), E2E smoke (Playwright), and Workflow lint (actionlint). `permissions: contents: read`, `persist-credentials: false`, job timeouts, and PR runs that get superseded are cancelled |
| `.github/workflows/security.yml` | OWASP Dependency-Check on PRs, pushes to `main` and weekly. **Reports only, never fails** |
| `.github/dependabot.yml` | Weekly grouped updates for root npm, `src/backend` npm and GitHub Actions. Added 25 Sep. **It has not run yet.** The first run is Mon 28 Sep, 06:00 ET |
| Dockerfiles / `.dockerignore` | **None.** `docker-compose.yml` references `build: ./src/backend` and `./src/frontend`, but neither has a Dockerfile |
| `render.yaml` | Two staging services, `autoDeployTrigger: checksPass`. Staging deploys automatically once CI passes on `main` |
| CODEOWNERS | None |

### 6.2 GitHub settings (read 27 Sep)

| Area | What exists |
|---|---|
| **Branches / Rules** | One ruleset, **"CI/CD Project Rule"** (active, default branch). It blocks deletion and force-push. It requires the 4 CI jobs as status checks (strict mode off). It requires a PR with **0 approvals**, dismisses stale reviews, and allows merge, squash and rebase. **Bypass: org admins and the repo Admin role, always.** No classic branch protection |
| **Actions → General** | Actions enabled. **All actions allowed**, SHA pinning not required. Fork PRs from first-time contributors need approval. Artifact and log retention is 90 days. **Workflow permissions are already "Read repository contents".** "Allow GitHub Actions to create and approve pull requests" is **off** |
| **Secrets and variables → Actions** | 4 repo secrets, all created 22 Sep: `RENDER_{BACKEND,FRONTEND}_{STAGING,PRODUCTION}_DEPLOY_HOOK_URL`. **No workflow on `main` uses them** (A-05). 0 variables, 0 org secrets, 0 Dependabot secrets |
| **Environments** | 5 environments. `production-backend` and `production-frontend` each require one reviewer (dgobin-ksu). Self-review is allowed and no deployment branch policy is set. `main - peers-backend-staging` and `main - peers-frontend-staging` are created automatically by Render's GitHub deployments. `with-test-coverage - peer-evaluation-backend` is left over from an unmerged branch. None has environment secrets or variables |
| **Code security** | **Everything was off:** Dependabot alerts, Dependabot security updates, secret scanning, push protection, CodeQL default setup ("not-configured"), and private vulnerability reporting. The repo is **public**. All six were switched on 27 Sep (see A-01) |

**Workflow permissions change:** the task asked for this to be set to *Read repository
contents*. It **already was** (`default_workflow_permissions: read`), so nothing was
changed. Both workflows also declare `permissions: contents: read` at the top. In
Milestone 2, a job that pushes images should add `packages: write` to **that job only**.

---

## 7. Findings

Severity: **High**: security exposure or blocks a milestone. **Medium**: real risk or
cost that has a workaround. **Low**: hygiene or documentation.

| ID | Sev | Finding | Recommendation | Suggested owner |
|---|---|---|---|---|
| A-01 | **High** | The repo is public and every Code security feature is off: secret scanning, push protection, Dependabot alerts, Dependabot security updates, CodeQL and private vulnerability reporting. Nothing would stop or report a secret committed tomorrow | **Done 27 Sep:** secret scanning, push protection, Dependabot alerts, Dependabot security updates, CodeQL default setup and private vulnerability reporting are all on. Dependabot opened 10 alerts straight away, and they need triage. Non-provider secret patterns and validity checks need a paid Secret Protection license and stay off | Donald (done), Laeticia (triage alerts) |
| A-02 | Medium | `src/backend/.env` is tracked and `.gitignore` has no `.env` rule. The file holds only a localhost URI **(no rotation needed)**, but the next person to put a real `JWT_SECRET` or `SMTP_PASS` in it commits it | `git rm --cached src/backend/.env`. Add `.env`, `.env.*` and `!.env.example` to `.gitignore`. Add `uploads/` too (multer writes there) | Aaron |
| A-03 | Low | CORS allows any `*.onrender.com` origin (`/\.onrender\.com$/`) with `credentials: true` (`src/backend/index.js:11-21`). The JWT is sent as a Bearer header from localStorage, not a cookie, so the direct risk is small. But any site hosted on Render can call the API from a browser | Build the allow-list from `FRONTEND_URL` (+ localhost when not in production) and drop the wildcard. `config/corsConfig.js` is an empty stub waiting for this | Backend |
| A-04 | Medium | Known development passwords are in the repo: `scripts/createTestProfessor.js` creates `test.professor@kennesaw.edu` with a password it prints to the console, and `frontend-backend-integration-guide.txt` and `docs/user-manual/student-guide.md` list others. Anyone who has run a seed script against staging Atlas has created an account whose password is public | Confirm the staging database has none of these accounts, or reset them. Change the seed scripts to read the password from an env var or generate one. Add to Aaron's checklist: "seed scripts never run against staging/production with default credentials" | Aaron |
| A-05 | Medium | There are 4 Render deploy-hook secrets, but only the unmerged `with-test-coverage` branch uses them (added in `4dad906`). A deploy-hook URL works like a password: anyone who has it can trigger a deploy. Commit `4dad906` also says **production Render services were provisioned**, which `render.yaml` on `main` does not describe | Decide in M2: either merge a CD workflow that uses them (in the `production-*` environments), or delete them and regenerate the hooks in Render. Confirm whether the `*-production` Render services exist and are billed | Aaron / Donald |
| A-06 | Medium | Production environments have a single required reviewer, self-review is allowed, and **no deployment branch policy** is set, so a workflow run from any branch can target `production-*` once approved. The stale `with-test-coverage - peer-evaluation-backend` environment is still listed | Limit `production-*` to `main` (deployment branches = selected: `main`). Add a second reviewer and turn on "prevent self-review". Delete the stale environment | Donald |
| A-07 | Low | The ruleset requires 0 approvals, and admins and org admins bypass it **always**, so any admin can push directly to `main`. Strict status checks are off, so a PR can merge on checks that ran against an older `main` | Require 1 approval. Change the bypass mode to "pull requests only" (or remove it). Decide whether strict checks are worth the extra reruns on the build-minute budget | Donald |
| A-08 | Low | Actions allow any third-party action and don't require SHA pinning. First-party actions are pinned to a major tag (`@v7`). Log and artifact retention is 90 days | Allow GitHub-owned + verified creators + an explicit list (`dependency-check/*`). Keep Dependabot's github-actions updates. Lower retention to 30 days | Donald |
| A-09 | Medium | Frontend has 29 audit findings (14 high), all from the CRA toolchain. `react-scripts` is unmaintained upstream, so these will not get fixed. `react-scripts` and `@testing-library/*` are in `dependencies`, which hides the fact that none of this reaches the bundle | Now: `npm audit fix` (clears 3). Move `react-scripts` and `@testing-library/*` to `devDependencies` so `npm audit --omit=dev` gives an accurate result. Record the rest as accepted risk in the Dependency-Check suppressions file. Later: plan a move from CRA to Vite, which also removes the Jest-27 workarounds in `package.json` | Frontend |
| A-10 | Low | Major updates are available for Express 5, Mongoose 9, MUI 9, ESLint 10 and others (section 4). Dependabot will start opening PRs on 28 Sep | Merge the grouped minor/patch PRs. Handle each major as its own ticket, not as a Dependabot merge | All |
| A-11 | Medium | `build/` is tracked. Running `npm run build` locally rewrites or deletes 10 tracked files (verified), so a normal local build leaves a dirty working tree and risks committing a stale bundle. `security.yml` already has to `rm -rf build` to work around it | `git rm -r --cached build` and add `build` to `.gitignore`. Render builds its own copy | Frontend |
| A-12 | Low | The root `postinstall` runs `npm ci` in `src/backend`. The Render **frontend** build (`npm ci && npm run build`) and every CI frontend and E2E job therefore also install the backend, which costs build minutes (500/month) on every frontend deploy | Remove the `postinstall` step and install the backend explicitly where it's needed (CI backend job, `setup` script, E2E when it starts the server) | Donald |
| A-13 | Low | The Node version is pinned but not enforced locally: there is no `engine-strict`, and the backend has no `engines` field. This audit's own dev machine was on Node 18.19.1 and `npm` didn't complain. Its `node_modules` was also out of sync with the lockfile | Add `.npmrc` with `engine-strict=true` and `"engines": {"node": ">=24"}` to `src/backend/package.json`. Tell the team to run `nvm use` | Donald |
| A-14 | Low | Env var docs have drifted. `SMTP_SECURE`, `SMTP_SERVICE` and `PORT` are read by the code but missing from `.env.example` and `render.yaml`. `MONGO_URI` is still accepted as a fallback. The default database name differs between files: `peer-evaluation` in `index.js` and `peer-eval` in `scripts/mongoUri.js` and `.env` | Make `.env.example` the complete list, remove the `MONGO_URI` fallback, and use one default database name. Aaron's checklist can be built from section 5.3 | Aaron |
| A-15 | Low | Several stale or misleading files: `docker-compose.yml` (Postgres, no Dockerfiles), `render-build-info.txt` (wrong paths, `cd src/frontend && npm install`), `PROJECT STRUCTURE` (describes folders that don't exist), `frontend-backend-integration-guide.txt`, and the stub `config/db.js` and `config/corsConfig.js` | Delete them or replace them with pointers to `render.yaml` and `docs/architecture/`. Rewrite `docker-compose.yml` in M2 alongside the Dockerfiles | Aaron (compose), Donald (rest) |
| A-16 | Low | The backend has no ESLint config or `lint` script. The CI job name "Backend (install + syntax check)" is also out of date: that job has run all 140 backend tests since PR #41 | Add a flat ESLint config and a `lint` script, then add the step to CI. Renaming the job means **updating the ruleset's required-check name in the same change**, or merges will block | Backend |
| A-17 | Info | `security.yml` only reports and is not a required check, as intended until findings are triaged | After A-09's suppressions file exists, add `--failOnCVSS 7` and make it required | Laeticia (triage), Donald |

### For Aaron: secrets checklist inputs

| Secret | Where it lives today | Used by | Notes |
|---|---|---|---|
| `MONGODB_URI` | Render dashboard (`sync: false`) | Backend | Atlas user and IP allow-list are outside git. Record the owner and rotation date |
| `JWT_SECRET` | Render `generateValue: true` | Backend | At least 32 characters is enforced at startup in production (`config/env.js`). Rotating it logs everyone out |
| `SMTP_USER` / `SMTP_PASS` (+ `SMTP_HOST`, `SMTP_PORT`, `SMTP_FROM`) | Render dashboard | Backend | Staging must point at a sandbox (Mailtrap), per `render.yaml` |
| `RENDER_*_DEPLOY_HOOK_URL` ×4 | GitHub Actions repo secrets | Nothing on `main` | See A-05. Move them into the `production-*` / staging environments if they're kept |
| `GITHUB_TOKEN` | Automatic | All workflows | Default is read-only (confirmed). Grant more per job only |
| *(M2)* registry credentials | – | Image push | Use `GITHUB_TOKEN` with `packages: write` on that job instead of a PAT |

## 8. Corrections to the technical assessment report

These entries in [technical-assessment-report.md](technical-assessment-report.md) no
longer match `main`:

| Entry | Now |
|---|---|
| D-02 (`MONGO_URI` vs `MONGODB_URI` breaks DB connection) | The code falls back to `MONGO_URI` (`index.js:31`, `scripts/mongoUri.js`), so the connection works. Downgrade to Low and track under A-14 |
| D-07 (Node 20 vs 24 disagreement) | `.nvmrc`, `engines`, CI and Render all say 24. The stack review's 20.12.2 was just the machine it ran on. Resolved (enforcement gap is A-13) |
| D-12 (`multer`/`csv-parser` in root `package.json`) | No longer in the root `package.json` (removed in #53). Resolved |
| D-15 (no backend tests, CI runs a placeholder syntax check) | 14 test files and 140 tests, run in CI by `npm test`. Resolved. Backend coverage measurement is still missing (D-16) |
| §4 "Nothing deploys automatically" | Staging auto-deploys from `main` once checks pass (`render.yaml` `autoDeployTrigger: checksPass`) |
| §9 "Syntax check step is a placeholder" | Superseded as above |
| D-01 (Critical) | Still open (A-02). The file holds no real secret, so **no rotation is needed**. Consider downgrading it to Medium |
