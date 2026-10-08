# Frontend build migration: Create React App to Vite

**What this is:** a record of moving the frontend's build and test tooling from Create React App (CRA, `react-scripts` 5.0.1) to Vite and Vitest. It is a tooling change only. The app's code, its behaviour, the backend, MongoDB, email, the Render deployment and the CI/CD pipeline all stay as they were, apart from the places listed below.

**Approval:** the sponsor approved it on 7 Oct 2026 on three conditions: document the migration (this file), make sure the existing application still works (section 4), and update the CI/CD pipeline accordingly (section 3).

## 1. Why

- Create React App is no longer maintained, and `react-scripts` 5.0.1 is its last release.
- Ten of the security findings that OWASP Dependency-Check flagged were in `react-scripts` build and dev-server tooling. They were accepted as risks in `.github/dependency-check-suppressions.xml` with an expiry date (31 Dec 2026), and none of that code was in the deployed site. After the move there are none to accept: the register is empty and `npm audit` reports 0 vulnerabilities for the frontend.
- The build is much faster (about 1 second instead of 8) and the install is smaller (about 520 packages instead of about 1570).

## 2. What changed

| Area | Before (CRA) | After (Vite) |
|---|---|---|
| Build and dev server | `react-scripts start` / `build` | `vite` / `vite build` (`vite.config.mjs`) |
| Entry page | `public/index.html`, scripts injected by CRA | `index.html` at the repo root loading `src/index.jsx` |
| JSX files | `.js` | `.jsx` (42 files renamed, history kept; plain logic files stay `.js`) |
| Unit tests | Jest 27 through `react-scripts test` | Vitest 5 (`npm test`), same Testing Library, jsdom |
| Coverage | Jest (istanbul) | Vitest with the istanbul provider; the numbers match to the statement, so the floors did not change |
| Lint | `react-app` presets in `package.json` | `eslint.config.mjs`, an explicit ESLint 9 flat config with the same rules at the same severities |
| Build output | `build/`, assets in `build/static/` | `build/` (unchanged), assets in `build/assets/` |
| API address | `REACT_APP_API_URL` read by webpack | `REACT_APP_API_URL` (same name), read by `vite.config.mjs` and written into the bundle |
| Dev server | port 3000, `proxy` to the backend | port 3000, `host 0.0.0.0` (no proxy: the app calls the backend by its full address) |
| Removed packages | `react-scripts`, `eslint-config-react-app`, `@babel/core`, `@types/jest`, `cross-env`, `@eslint/eslintrc` | |
| Added packages | | `vite`, `@vitejs/plugin-react`, `vitest`, `@vitest/coverage-istanbul`, `jsdom`, `eslint` 9 and the lint plugins |

What did **not** change: the backend (no controller, model, route or email code was touched), MongoDB, the React app's source (only file extensions), `render.yaml`, the Render service settings, `REACT_APP_API_URL`, port 3000, the `build/` folder and `build/version.txt`, the names of the required CI checks, and the ruleset.

Behaviour differences worth knowing:

- **Browser support.** Vite's default build target is newer than CRA's `browserslist` (">0.2%, not dead"). It is the "baseline widely available" set (roughly browsers from 2023 on). The `browserslist` setting was removed because Vite ignores it. If a sponsor requirement names an older browser, set `build.target` in `vite.config.mjs`.
- **Build warnings.** CRA failed `CI=true` builds on lint warnings; Vite does not. CI already runs lint as its own step (`npm run lint`, zero warnings allowed), so nothing is lost.
- **ESLint 9.** ESLint 9 is already out of upstream support, and ESLint 10 does not work with `eslint-plugin-react` 7.37 yet. Move to 10 when that plugin supports it. The lint tooling is dev-only and `npm audit` is clean.
- **`REACT_APP_API_URL` on Render.** The build now fails on Render when the variable is missing, instead of silently using the old hosted backend as a fallback.

## 3. CI/CD changes

| File | Change |
|---|---|
| `.github/workflows/ci.yml` | The frontend unit-test step runs `npm test -- --coverage --reporter=default --reporter=json --outputFile.json=reports/frontend-tests.json` (Vitest) instead of Jest. The test summary, coverage gate and artifact upload steps are unchanged, and the job names (the required checks) are unchanged. |
| `.github/workflows/security.yml` | The summary line copes with an empty suppression register. |
| `.github/dependency-check-suppressions.xml` | Empty (the ten `react-scripts` entries are gone). `src/backend/tests/securitySuppressions.test.js` still checks any future entry; TC-SEC-01 now accepts an empty register. |
| `.github/dependabot.yml` | The comment about `react-scripts` pins is updated. |
| `scripts/render-deploy.js` | The frontend path filter (which changes trigger a frontend deploy) follows the renames and the new files: `src/index.jsx`, `index.html`, `vite.config.mjs`, and `*.test.jsx` is ignored like `*.test.js`. `src/backend/tests/renderDeploy.test.js` covers it. |
| `Dockerfile.frontend`, `.dockerignore` | Copy `index.html`, `vite.config.mjs` and `src/index.jsx`; the build stage otherwise runs `npm run build` as before. |
| `docker/nginx.conf` | Long-lived caching applies to `/assets/` (where Vite puts hashed files) instead of `/static/`. |
| `e2e/server/frontend.js`, `e2e/server/build-guard.js` | The guard that refuses an E2E build pointing at a hosted backend now scans `build/assets` and **fails closed** when it finds no bundle (before, a missing folder meant "nothing found, all good"). `src/backend/tests/e2eBuildGuard.test.js` tests it. |
| `e2e/staging.spec.js` | A new `@staging` test proves the deployed app sends its requests to the configured backend. It answers the login request itself, so nothing is sent to the backend or saved. |
| `docs/requirements/rtm.md` | The test files it cites are now `.test.jsx`; `scripts/check-rtm.js` checks the links in CI. |
| `package.json` | Scripts: `start` and `build` use Vite, `preview` added, `test` is `vitest run`, `lint` also covers `src/index.jsx` and `src/setupTests.js` (CRA's build used to lint the entry file; Vite's does not). `eject`, `proxy`, `browserslist`, the Jest block and `eslintConfig` are gone. |

Render needs no setting changes: the build command stays `npm ci && npm run build && ... > build/version.txt`, the publish path stays `./build`, and `REACT_APP_API_URL` keeps its name.

## 4. How we know the existing application still works

Checked locally on the migration branch before the pull requests:

| Check | Result |
|---|---|
| Frontend unit tests | 467 pass. That is the 461 from before, with the same names, plus 6 for the Vite config. Two colour assertions in `LoginPage.test` were rewritten, because the newer jsdom reports `rgb(0, 128, 0)` where the test said `green`. |
| Coverage | Statements 93.49%, branches 87.07%, functions 92.60%, lines 93.53%, the same as under Jest; the floors (93/87/92) hold. |
| Backend | 393 unit tests and 133 integration tests (real MongoDB) pass; no backend code changed. |
| End-to-end | All 46 Playwright tests pass against the Vite build: login, courses, students and CSV upload, teams, evaluation links and submissions, reports, and the evaluation emails (captured by the test mail server). |
| Containers | The frontend image builds, the Compose stack (frontend, backend, MongoDB) comes up healthy, `/assets/*.js` is served as `immutable`, `index.html` as `no-cache`, and a deep link such as `/evaluate/<token>` opens the app. |
| By hand | In the Vite dev server against seeded data: log in as a professor, the course dashboard, Reports with both grading methods (the curved-grade arithmetic checked), Settings (added a flagged word, reloaded to confirm it was saved, deleted it), sending evaluation invitations ("Emails sent to 4 students"), and opening an emailed evaluation link. |
| Security | `npm audit` 0 vulnerabilities; the old suppressed packages (svgo, nth-check, postcss 7, webpack-dev-server and the others) are gone from the lockfile. |
| Lint | Clean with zero warnings; the resolved rules match the old preset except for the Flow rules (the repo has no Flow) and five Jest rules that have no Vitest equivalent. |

Two independent reviews (Codex) of the plan and of the finished change found five problems, all fixed before the pull requests: lint would have failed during the test switch, the environment variable could have been lost at build time, a check could not have caught a build pointed at the wrong backend, the lint preset carried rules the first replacement did not, and the entry file was no longer linted.

**Proven only after merge:** the OWASP job on the empty register, the Render static build and deploy, the `@staging` smoke tests, and a real email sent through the staging mail account. The pull request checks and the CD run cover the first three; send one real email from staging to cover the last.

## 5. Working with it

| To | Run |
|---|---|
| Develop (frontend and backend) | `npm run dev` (frontend on http://localhost:3000, backend on 5000) |
| Frontend only | `npm start` |
| Production build | `npm run build` (output in `build/`; `npm run preview` serves it) |
| Unit tests with coverage | `npm test -- --coverage`, then `node scripts/coverage-gate.js frontend` |
| Lint | `npm run lint` |
| End-to-end tests | `npm run build`, then `E2E_START_SERVER=1 npm run test:e2e` |

`REACT_APP_API_URL` is public and read at build time: change it, rebuild. Do not put a secret in it.

## 6. Rollback

Each stage is its own pull request, so any one can be reverted. After a revert, redeploy staging through the CD workflow; `cd.yml` can also roll back to a previous release tag (`rollback_to`, see [rollback and recovery](../operations/rollback-and-recovery.md)).

## 7. Follow-ups (not part of this change)

- Move lint to ESLint 10 when `eslint-plugin-react` supports it.
- The production bundle is about 690 KB (210 KB compressed); code-splitting by route would help but is a feature change.
- Rename `REACT_APP_API_URL` to `VITE_API_URL`: cosmetic, and it touches Render, Docker and CD, so it was left alone.
- Remove the unused `loginProfessor` service and its test (dead code found on the way).
