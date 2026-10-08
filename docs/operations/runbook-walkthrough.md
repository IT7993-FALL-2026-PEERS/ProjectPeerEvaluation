# Runbook walkthrough: run, test, release, roll back

**Backlog:** CICD-31 (#148) · **Last run:** 6 Oct 2026, against `main` at `d98b4a7`

This is the [operations runbook](README.md#walkthrough-run-test-release-roll-back) walkthrough written out step by
step: the exact commands, what you should see, and what happened when it was run on 6 Oct 2026. Use it to repeat the
walkthrough, or as proof that the steps work. When you repeat it, add a row to the [run log](#run-log) at the end.

**Who ran it.** Donald (M1) ran it with Claude Code, in a fresh clone on a WSL Ubuntu machine with Node 24.21.0, npm
11.19.0 and Docker 29.8. CICD-31's done condition asks for a teammate who didn't build the pipeline. This run proves
the steps work. A run by such a teammate would also prove the docs are clear enough without help.

## Before you start

| You need | Check |
|---|---|
| Write access to the repository | you can open and merge pull requests |
| Node 24 and npm 11 | `node -v` → `v24.x` (`nvm use` reads `.nvmrc`) |
| Docker with Compose 2.24+ | `docker compose version` |
| Free ports 3000, 5000, 27017 | `ss -ltn \| grep -E ':(3000\|5000\|27017)\b'` prints nothing |
| Staging running (steps 4 and 5) | `curl -s https://peers-backend-staging.onrender.com/api/health` answers `"status":"OK"` |

## Step 1. Run it locally

**1a. With npm** ([README Quick start](../../README.md#quick-start))

```bash
git clone https://github.com/IT7993-FALL-2026-PEERS/ProjectPeerEvaluation.git
cd ProjectPeerEvaluation
npm run setup                                             # checks Node, creates .env files, installs everything
docker run -d --name peers-dev-mongo -p 27017:27017 mongo:7   # or: docker start peers-dev-mongo
npm run dev                                               # leave running
npm run verify                                            # in a second terminal
```

Expect `✔ backend is up`, `✔ frontend is up`, `Environment healthy.`, and from
`curl -s localhost:5000/api/health` the fields `"status":"OK","database":"connected"`.

> **6 Oct 2026: passed.** Setup took 46 s. npm warned that `core-js` install scripts were held back for approval;
> that's harmless (now noted in the README). Verify passed and health said `connected`.

**1b. In containers** ([Docker setup](../docker-setup.md)). Stop `npm run dev` and `peers-dev-mongo` first: they use
the same ports.

```bash
docker stop peers-dev-mongo
npm run docker:up        # builds and starts mongo, backend, frontend; waits until all are healthy
npm run verify
npm run docker:down
```

Expect all three containers `(healthy)` in `docker compose ps`, then the same two ✔ lines.

> **6 Oct 2026: passed.** All three containers were healthy after 71 s, and verify passed.

## Step 2. Test it locally

The same checks CI runs ([README, Continuous Integration](../../README.md#continuous-integration)):

```bash
npm ci
npm run lint
npm test -- --coverage && node scripts/coverage-gate.js frontend
npm run build
npx playwright install chromium                 # once per machine
E2E_START_SERVER=1 npm run test:e2e
(cd src/backend && npm run lint && npm run test:coverage && node ../../scripts/coverage-gate.js backend)
(cd src/backend && npm run test:integration)
```

Expect every command to exit 0, with the coverage tables showing `pass` for lines, branches and functions.

The first end-to-end run on a new machine may fail with `error while loading shared libraries: libnspr4.so`. Install
Chromium's system libraries once with `sudo npx playwright install-deps chromium`, or, without sudo, run the tests in
Playwright's image (the README has the command).

> **6 Oct 2026: passed, after fixing two gaps in the docs.**
>
> | Check | Result |
> |---|---|
> | Frontend lint | pass |
> | Frontend unit tests | 232 / 232 |
> | Frontend coverage gate | pass (lines 41.95%, branches 52.04%, functions 54.76%) |
> | Build | compiled |
> | End-to-end (Playwright) | **39 / 39**, in the `mcr.microsoft.com/playwright:v1.63.0-noble` image |
> | Backend lint | pass |
> | Backend unit tests | 370 / 370 |
> | Backend coverage gate | pass (lines 69.11%, branches 81.07%, functions 75.45%) |
> | Integration (real MongoDB) | 131 / 131 |
>
> The README's commands didn't say to download the Playwright browser, or that it needs system libraries, so the
> first E2E attempt failed on both. CI does both with `npx playwright install --with-deps chromium`. The README now
> has the browser download, the `install-deps` fix, and the no-sudo Docker command.

## Step 3. Change something through a pull request

Make a small change on a branch, open a pull request, watch the eight required checks
([CI/CD operations](ci-cd-operations.md#required-checks)), and merge it yourself when they pass
([team guide](../team-guide.md#merging-your-own-pull-request)).

Pick a change to a file a service uses if you want steps 4 and 5 to actually deploy something. A docs-only change
is fine for practising pull requests, but CD then skips both services, so there's nothing to release or roll back.

> **6 Oct 2026: passed.** [#166](https://github.com/IT7993-FALL-2026-PEERS/ProjectPeerEvaluation/pull/166) added an
> HTML comment to `public/index.html`, a frontend file with no visible effect. All eight required checks and both
> CodeQL analyses passed, and it merged as `f306afd`.

## Step 4. Release it

Follow the [release procedure](release-procedure.md). After the merge, CI runs on `main`, then **Actions > CD**:

| Job | Expect |
|---|---|
| Prepare | the CD plan in the summary |
| Deploy to staging (frontend / backend) | `deploying, N changed file(s)` then `<sha> is live`, or `skipping, no file this service uses changed` |
| report / Deployment status | success, **Deployed and healthy** |

Then check what staging runs:

```bash
curl -s https://peers-frontend-staging.onrender.com/version.txt       # the frontend's commit
curl -s https://peers-backend-staging.onrender.com/api/health          # "commit": the backend's commit
```

Check these commits, not the page source. The production build drops HTML comments, so a comment-only change never
shows up in the page, even when it is live.

With `CD_RELEASE=on`, the same run also makes an `rc-*` release candidate. You can then dry-run a promotion of it
([release procedure, step 4](release-procedure.md#4-promote-a-release-candidate-optional)).

> **6 Oct 2026: passed (deploy part).** Before: frontend `d98b4a7`, backend `6b0dc31`.
> [CD run 37462700387](https://github.com/IT7993-FALL-2026-PEERS/ProjectPeerEvaluation/actions/runs/37462700387):
> `frontend: deploying, 1 changed file(s), e.g. public/index.html` → `frontend: f306afd is live`;
> `backend: skipping, no file this service uses changed since 6b0dc31`; Deployment status: success.
> `/version.txt` then showed `f306afd`, and health said OK with the database connected.
>
> **Not exercised:** the `rc-*` release candidate and its promotion, because `CD_RELEASE` is off (#146). The promotion
> gate itself was proven separately with a dry run on 5 Oct (#147).

## Step 5. Roll it back

**Option A, with a release candidate** (`CD_RELEASE=on`): **Actions > CD > Run workflow** on `main`, with
**rollback_to** set to the last good `rc-…` tag. The `Roll back` jobs, then `rollback-report` and `rollback-smoke`,
should pass, and both commits should match the release's record
([R1](rollback-and-recovery.md#r1-staging-is-broken-after-a-deploy)).

**Option C, by revert** (always available):

```bash
git checkout -b revert-<change> origin/main
git revert -m 1 <merge commit of your step 3 pull request>
git push -u origin revert-<change>             # open a pull request, merge it when the checks pass
```

Then watch CD deploy the revert, and check `/version.txt` (and `/api/health`) again.

> **6 Oct 2026: passed (option C).** [#167](https://github.com/IT7993-FALL-2026-PEERS/ProjectPeerEvaluation/pull/167)
> reverted #166 (`git revert -m 1 f306afd`), passed all checks and merged as `e6d434f`.
> [CD run 37464007826](https://github.com/IT7993-FALL-2026-PEERS/ProjectPeerEvaluation/actions/runs/37464007826):
> `frontend: deploying, 1 changed file(s), e.g. public/index.html` → `frontend: e6d434f is live`; backend skipped;
> Deployment status: success. `/version.txt` showed `e6d434f`, whose `public/` is identical to the starting
> point `d98b4a7`, and health said OK with the database connected.
>
> **Not exercised:** option A (`rollback_to`), because there are no `rc-*` releases while `CD_RELEASE` is off (#146),
> and option B (Render's rollback), which needs the Render account.

## What the walkthrough changed in the docs

- **README, Continuous Integration:** the browser download (`npx playwright install chromium`), the `install-deps`
  fix for missing libraries, the no-sudo Docker command for the end-to-end tests, and a note on npm 11's
  install-script warning.
- **Release procedure:** check the two commit endpoints, not the page source.
- This page, with the record of the run.

## Run log

| Date | Who | `main` at start | Result | Notes |
|---|---|---|---|---|
| 6 Oct 2026 | Donald (with Claude Code) | `d98b4a7` | Steps 1–3 ✔, step 4 deploy ✔, step 5 option C ✔ | Release candidate, promotion and rollback option A not possible while `CD_RELEASE` is off. Two README gaps fixed (Playwright browser and libraries) |
