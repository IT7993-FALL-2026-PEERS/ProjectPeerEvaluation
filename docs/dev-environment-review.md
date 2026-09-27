# Development Environment Review (M2)

**Task:** 3.1 — Validate the development environment runs end-to-end locally
**Owner:** Aaron Simpson (M2) — Environment, containerization & delivery
**Objective:** confirm a brand-new clone can get running with minimal manual steps; friction found here feeds Milestone 2's "finalize development environment" work.
**Last updated:** 27 September 2026 (live clean-clone run added in §3.1)

## Method

This review was done against the current `main` snapshot (via the exported repo archive, not a live `git clone`). Every command `npm run setup` and `npm run dev` would run was traced through `package.json`, and every file a fresh clone would actually contain (`.env`, `.env.example`, `docker-compose.yml`, `.nvmrc`, backend config) was inspected directly. The assistant environment used for this pass has no outbound network access, so `npm install`, a real `npm run dev`, and a live MongoDB connection could not be executed here — that final live confirmation still needs to happen on a real machine (see "What still needs a live run" below). Everything else below — the exact install/start sequence, every environment variable the app reads, and the fallback behavior when one is missing — was verified by reading the actual source, not inferred.

## 1. What `npm run setup` and `npm run dev` actually do

`npm run setup` → `npm install && cd src/backend && npm install`. Root `package.json` also has a `postinstall` hook (`cd src/backend && npm ci`) that fires automatically on the root `npm install`. That means one `npm run setup` installs the backend's dependencies **twice** — once via the `postinstall` hook, once via the explicit `cd src/backend && npm install` at the end of the script. It's not broken, just wasted time on every fresh setup (and on every `npm install` anyone runs later, e.g. after adding a package). CI avoids this: its "Install dependencies" step is a single `npm ci` and a comment notes the `postinstall` hook already covers the backend. **Recommendation:** drop the redundant `&& cd src/backend && npm install` from the `setup` script and rely on `postinstall`, matching what CI already does.

`npm run dev` → `concurrently "npm run start:backend" "npm run start:frontend"`, i.e. `node src/backend/index.js` and `react-scripts start` (bound to `0.0.0.0` via `cross-env HOST=0.0.0.0`) running side by side. No explicit startup ordering is enforced — the frontend can come up before the backend — but this isn't a real problem: the frontend only calls the backend when a user interacts with the page, by which point the backend (a plain `express().listen()`, no slow bootstrap) is normally already up.

## 2. Manual steps that aren't automated

| # | Step | Automated? | Notes |
|---|---|---|---|
| 1 | Install Node 24 | **No** | `.nvmrc` pins `24` and `package.json` declares `"engines": { "node": ">=24" }`, but nothing enforces this locally — `npm run setup` will run on an older Node without complaint. The README tells the user to run `nvm use`, but that's a step the person has to remember and `nvm` has to be installed for it to do anything. |
| 2 | Install and start MongoDB | **No, and not documented in the README's Prerequisites at all** | The backend needs a MongoDB instance reachable at whatever `MONGO_URI`/`MONGODB_URI` resolves to (`src/backend/index.js`). There is no bundled/local Mongo, no Docker Compose that works (see §3), and the README's "Prerequisites" section (lines 279–285) lists only Node, Git, and an editor — MongoDB isn't mentioned. A first-time clone has to independently know to either install MongoDB locally, run one in Docker by hand, or point at an Atlas cluster. |
| 3 | Reconcile the committed `.env` with what the README says to do | **Partially automated, contradicts itself** | The README's step 3 says "copy `src/backend/.env.example` to `src/backend/.env` and fill in `MONGODB_URI` and SMTP settings" — but a real `src/backend/.env` is already committed to the repo (and isn't in `.gitignore`), so a fresh clone already has a `.env` and the README's "copy the example" instruction doesn't apply as written. The committed file sets `MONGO_URI` (not `MONGODB_URI`) and nothing else — no `JWT_SECRET`, no `SMTP_*` values. |
| 4 | Provide `JWT_SECRET` and SMTP credentials | **No, but not blocking** | Confirmed by reading `src/backend/config/env.js` and `src/backend/utils/emailUtils.js`: outside of `NODE_ENV=production`, a missing `JWT_SECRET` falls back to a hardcoded dev secret with a console warning, and missing SMTP settings fall back to placeholder values rather than crashing the server. So the app **does** start and the core flows work without these — but login tokens use an insecure shared default and any email actually sent (invitations, reminders) will silently fail against real SMTP credentials until someone fills in `SMTP_HOST/PORT/USER/PASS`. This should be called out in onboarding docs so a new dev doesn't spend time debugging "why didn't the invite email arrive" without realizing SMTP was never configured. |
| 5 | Notice the `MONGO_URI` / `MONGODB_URI` naming mismatch | **No** | `src/backend/index.js` reads `process.env.MONGODB_URI \|\| process.env.MONGO_URI \|\| 'mongodb://localhost:27017/peer-evaluation'` — so the committed `.env`'s `MONGO_URI` **does** work today, because of that fallback chain. This is better than the technical assessment's D-02 finding suggests (it doesn't actually block a local run), but it's still an inconsistency between `.env`, `.env.example`, and would silently break if someone "cleaned up" the fallback in `index.js` without updating `.env`. Worth standardizing on one name. |
| 6 | Free up ports 3000 and 5000 | **No** | Standard for any two-service local setup, but not mentioned anywhere — if either port is already in use, `npm run dev` fails with no guidance in the docs about which service owns which port or how to override it. |
| 7 | `docker-compose up` as a setup path | **Not usable at all** | `docker-compose.yml` exists at the repo root, but no `Dockerfile` exists anywhere in the repository, so `docker-compose up` fails immediately trying to build either service. This is already tracked in `docs/technical-assessment/containerization-and-test-coverage-review.md` and is the subject of task 3.2 below — noted here only because a new developer might reasonably try `docker-compose up` as their first move and hit a dead end with no explanation in the README. |

## 3. What still needs a live run

This review traced every script and every config file the app reads, and the fallback behavior confirms the app is written to start with only Node + a reachable MongoDB — no `JWT_SECRET` or SMTP values strictly required for `npm run dev` to come up. What it did **not** do is actually execute `git clone` → `npm run setup` → `npm run dev` on a machine with network access and a real MongoDB, because this review pass ran in a sandboxed environment without outbound network access. Before closing this task, one of us should do that literal run once (any machine with Node 24 and either a local `mongod` or an Atlas connection string works) and confirm:
- both `localhost:3000` and `localhost:5000` come up with the exact steps in the README, with no undocumented step beyond what's listed in §2 above
- the console warning for the missing `JWT_SECRET` actually appears as described
- total first-time setup time, to sanity-check against whatever time budget Milestone 2 sets for "finalize development environment"

### 3.1 Live run, 27 September 2026

Done on a Windows 10 machine with network access, from a brand-new `git clone` of `main` at
`e25d3b6`, following the README's Getting Started steps exactly, with MongoDB started in
Docker because it is not otherwise available (the §2, row 2 gap).

Environment: Node 24.21.0, npm 11.19.0, Git 2.54.0, Docker 29.4.3.

| Step | Command | Result | Time |
|---|---|---|---|
| Clone | `git clone https://github.com/IT7993-FALL-2026-PEERS/ProjectPeerEvaluation.git` | OK | 1 s |
| Install (README step 2) | `npm run setup` | OK, 0 vulnerabilities | 59 s |
| Configure (README step 3) | copy `src/backend/.env.example` to `src/backend/.env` | Overwrites the committed `.env` (§2, row 3); the copied file already points at `mongodb://localhost:27017/peer-eval` | — |
| Database (not in the README) | `docker run -d --name peers-dev-mongo -p 27017:27017 mongo:7` | MongoDB 7.0.43 accepting connections | 37 s, including the first image download |
| Start (README step 4) | `npm run dev` | Backend on 5000 (`✅ MongoDB connected`), frontend on 3000 (`webpack compiled successfully`) | 14 s |

Checks, all passed:
- `GET http://localhost:5000/api/health` returned 200 with `"database":"connected"`.
- Through the API: register a test professor (201), log in (token issued), create a course,
  add a student with a team (201, team "Team A" created), list the students (1), and a
  request without a token was refused (401). The data landed in the `peer-eval` database
  (collections `courses`, `evaluations`, `professors`, `students`, `teams`).
- `http://localhost:3000` rendered the Professor Login page with no browser console errors.

What the run showed about §3's questions:
- **Both ports came up with the README's steps**, once MongoDB was running. MongoDB is the
  only undocumented step, as §2 predicted.
- **No `JWT_SECRET` warning appeared**, because README step 3 copies `.env.example`, which sets a
  placeholder secret. The development fallback in `config/env.js` is only reached when the
  variable is missing entirely.
- **First-time setup took about 2 minutes of machine time** (install 59 s, MongoDB 37 s,
  start 14 s), plus reading the README.
- Email was not exercised: the copied SMTP values are placeholders, so invitations fail until
  real SMTP settings are added (§2, row 4).
- Startup logs only deprecation notices from Create React App's development server, which
  are harmless.

## 4. Recommended quick fixes (feeds Milestone 2)

- [ ] Remove the redundant backend install in the `setup` script (rely on `postinstall`)
- [ ] Add MongoDB to the README's Prerequisites, with a one-line recommendation (local install vs. a free Atlas cluster) since Docker isn't a working option yet
- [ ] Update the README's step 3 to reflect that `.env` is already committed, not something to copy from `.env.example` — or better, remove the committed `.env` from version control and add it to `.gitignore` (this is already flagged as D-01, Critical, in the technical assessment report)
- [ ] Standardize on `MONGODB_URI` (or `MONGO_URI`) everywhere — `.env`, `.env.example`, and `index.js` — rather than relying on the fallback chain
- [ ] Add a short "email/auth won't fully work until you set `SMTP_*`/`JWT_SECRET`" note near the setup instructions, so the dev-default fallback isn't mistaken for a bug later
- [ ] Note the required ports (3000, 5000, and MongoDB's 27017 if run locally) and how to override them

## Done checklist

- [x] Documented setup and start scripts traced end-to-end via source inspection
- [x] Every manual step found (automated or not) listed in §2, each backed by a specific file/line
- [x] Full local run confirmed from an actual clean clone with network access (§3.1, 27 Sep)
- [x] This file committed to `docs/dev-environment-review.md` (PR #56)
