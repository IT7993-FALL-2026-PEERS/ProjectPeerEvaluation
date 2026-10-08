# Operations runbook

**Backlog:** CICD-31 · **Owner:** M1 (Donald) · **Last checked against the live settings:** 5 Oct 2026

Everything needed to run, test, release and roll back PEERS without asking the people who built it. Start with
the walkthrough below. Each step links to the page that explains it.

| Page | Use it when |
|---|---|
| [Docker setup](../docker-setup.md) | Running the whole stack locally in containers |
| [README: Getting Started](../../README.md#getting-started-for-new-users) | Running it locally with `npm run dev` |
| [CI/CD operations](ci-cd-operations.md) | Something in GitHub Actions is red, slow or needs changing; routine upkeep |
| [Release procedure](release-procedure.md) | Getting a change onto staging and turning it into a release |
| [Rollback and recovery](rollback-and-recovery.md) | Staging is broken, a deploy went wrong, a secret leaked, CI is blocked |
| [Runbook walkthrough](runbook-walkthrough.md) | Repeating the walkthrough below step by step, with commands, expected output and the record of past runs |
| [Render handover](render-handover.md) | Who owns which account, and what happens to them when the project ends |
| [CD pipeline design](../cd-pipeline.md) | How `cd.yml` and `promote.yml` work inside |
| [Security policy](../security/security-policy.md) | A security check blocks a merge; accepting a risk |
| [Team guide](../team-guide.md) | Pull requests, reviews, merge conflicts |

## Walkthrough: run, test, release, roll back

A teammate who hasn't worked on the pipeline should be able to do all of this from these docs alone. That's the
done condition of CICD-31. Tick each step, and note anything the docs didn't tell you in the issue, so the docs
get fixed rather than the knowledge staying in someone's head.

You need: write access to the repository, Node 24 and Docker. For steps 4 and 5, staging must be running (ask
Khoa, see [Render handover](render-handover.md)).

### 1. Run it locally

- [ ] Clone, `npm run setup`, start MongoDB, `npm run dev`. The README's [Quick start](../../README.md#quick-start)
      has the commands.
- [ ] `npm run verify` prints `✔ backend is up` and `✔ frontend is up`.
- [ ] Or run all of it in containers: `npm run docker:up`, then `npm run docker:down` ([Docker setup](../docker-setup.md)).

### 2. Test it locally

- [ ] Run the same checks CI runs (README, [Continuous Integration](../../README.md#continuous-integration)):
      lint, frontend and backend unit tests with coverage, integration tests, build, end-to-end tests.

### 3. Change something through a pull request

- [ ] Make a small, harmless change on a branch (a docs typo is fine), open a pull request, and watch the eight
      required checks ([CI/CD operations](ci-cd-operations.md#required-checks)).
- [ ] Merge it yourself once they pass ([Team guide](../team-guide.md#merging-your-own-pull-request)).

### 4. Release it

- [ ] Follow the [release procedure](release-procedure.md): watch the CD run deploy (or skip) each service, then
      check `/api/health` and `/version.txt` show the commit.
- [ ] Once the release stages are switched on (`CD_RELEASE=on`), find the `rc-*` release that the run created,
      and run a **dry-run** promotion of it ([release procedure, step 4](release-procedure.md#4-promote-a-release-candidate-optional)).

### 5. Roll it back

- [ ] Redeploy an earlier release candidate with **CD > Run workflow > rollback_to**
      ([Rollback and recovery, R1](rollback-and-recovery.md#r1-staging-is-broken-after-a-deploy)), and check that
      `/api/health` shows its commit.
- [ ] Without any `rc-*` release: revert your change from step 3 in a pull request and let CD deploy the revert
      ([R1, option C](rollback-and-recovery.md#r1-staging-is-broken-after-a-deploy)).

When every box is ticked, write in CICD-31 who did it, on which date, and what was unclear. The
[runbook walkthrough](runbook-walkthrough.md) has each step's commands and expected output, and a run log to add to.

## Where things live

| What | Where |
|---|---|
| Code, issues, pull requests, Actions, releases | GitHub `IT7993-FALL-2026-PEERS/ProjectPeerEvaluation` |
| Staging frontend | https://peers-frontend-staging.onrender.com (its commit: `/version.txt`) |
| Staging backend | https://peers-backend-staging.onrender.com/api/health (its commit: the `commit` field) |
| Staging hosting | Render, workspace on Khoa's account ([Render handover](render-handover.md)) |
| Staging database | MongoDB Atlas M0 |
| Staging email | Mailtrap sandbox: catches every message and delivers nothing |
| Container images | GitHub Container Registry, `ghcr.io/it7993-fall-2026-peers/projectpeerevaluation/{backend,frontend}:<commit>` (once `CD_RELEASE` is on) |

## Changes the next owner should know about

### The frontend moved from Create React App to Vite (Oct 2026)

The full record (what changed, the CI/CD changes, how it was verified, rollback) is in [Vite migration](../architecture/vite-migration.md).

The frontend is now built with Vite and tested with Vitest. `react-scripts` and the build tooling behind the ten
accepted security findings are gone, so the register in `.github/dependency-check-suppressions.xml` is empty
([Security policy](../security/security-policy.md#3-accepted-risks-owasp-dependency-check-2-oct-2026)). What stayed the
same: React, `REACT_APP_API_URL`, the `build/` folder, port 3000 and the Render and Docker delivery path. What to know:

- The bundle goes to `build/assets/` (not `build/static/`); `docker/nginx.conf` caches `/assets/`.
- `vite.config.mjs` reads `REACT_APP_API_URL` at build time and fails a Render build when it is missing.
- Lint is an ESLint 9 flat config (`eslint.config.mjs`) with the rules the old preset used. ESLint 9 is already out of
  support and ESLint 10 does not work with `eslint-plugin-react` 7.37 yet: move to 10 when that plugin supports it.
