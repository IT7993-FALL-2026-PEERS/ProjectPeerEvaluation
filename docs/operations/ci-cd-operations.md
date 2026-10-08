# CI/CD operations

How the GitHub Actions setup is run day to day: what each workflow does, which checks gate a merge, where the
settings and secrets are, and what to do when something is red. The design behind CD is in
[`docs/cd-pipeline.md`](../cd-pipeline.md).

## Workflows

| Workflow | File | Runs on | What it does |
|---|---|---|---|
| CI | `ci.yml` | every pull request to `main`, every push to `main`, by hand | Lint, unit tests with coverage floors, integration tests (real MongoDB), build, Playwright end-to-end, Docker Compose smoke, actionlint, then a `Run report` summary |
| Security scan | `security.yml` | pull requests, pushes to `main`, Mondays 11:00 UTC, by hand | OWASP Dependency-Check; fails on CVSS 7+ unless accepted ([security policy](../security/security-policy.md)) |
| CodeQL | none (GitHub default setup) | pull requests, pushes to `main` | Code scanning for JavaScript and Actions; a new alert fails the `CodeQL` check |
| CD | `cd.yml` | after CI passes on a push to `main`; by hand on `main` | Deploys staging; with `CD_RELEASE=on` also builds images, runs smoke tests, tags `rc-*`, rolls back on failure ([release procedure](release-procedure.md)) |
| Image build and push | `image-build.yml` | called by CD; by hand | Builds both images, checks them healthy, pushes to GHCR tagged with the commit |
| Deployment status | `deployment-status.yml` | called by CD | Health check and "Deployment status" section in the CD summary |
| Staging regression | `staging-regression.yml` | called by CD (smoke); by hand | Read-only health, frontend and `@staging` Playwright tests against staging. Never sends email |
| Promote release candidate | `promote.yml` | by hand, from an `rc-*` tag | Waits for approval in `production`, then publishes a GitHub Release ([release procedure](release-procedure.md#4-promote-a-release-candidate-optional)) |
| Dependabot | `.github/dependabot.yml` | Mondays 06:00 New York | Update pull requests: npm frontend, npm backend, GitHub Actions |

## Required checks

The `main-protection` ruleset (Settings > Rules > Rulesets) requires, for every change to `main`:

- a pull request (0 approvals; authors merge their own, see the [team guide](../team-guide.md));
- a branch that is **up to date** with `main`;
- these eight checks: `Frontend (test + build)`, `Backend (install + syntax check)`, `Integration (real MongoDB)`,
  `E2E smoke (Playwright)`, `Containers (build + compose smoke)`, `Workflow lint (actionlint)`,
  `OWASP Dependency-Check`, `CodeQL`.

It also blocks deleting `main` and force-pushing to it. **Nobody can bypass it**, admins included.

The check names are the jobs' `name:` fields. Renaming a CI job means updating the ruleset in the same change,
or every pull request waits forever for a check that no longer runs.

## Settings that matter

| Setting | Value | Where |
|---|---|---|
| Actions must be pinned to a full commit SHA | on (CICD-42) | Settings > Actions > General |
| Default `GITHUB_TOKEN` permission | read; Actions can't approve pull requests | Settings > Actions > General |
| Artifact and log retention | 90 days (repository maximum). Per artifact: release record and deployment status 90, test results and reports 30, CI Playwright report 7 | each `upload-artifact` step |
| Delete branch on merge | on | Settings > General |
| Secret scanning and push protection | on | Settings > Code security |

### Secrets, variables and environments

| Name | Kind | Where | Used by |
|---|---|---|---|
| `RENDER_BACKEND_DEPLOY_HOOK_URL` | secret | environment `staging` | CD deploy and rollback |
| `RENDER_FRONTEND_DEPLOY_HOOK_URL` | secret | environment `staging` | CD deploy and rollback |
| `CD_RELEASE` | repository variable, `on` to enable | Settings > Secrets and variables > Actions > Variables | CD release stages. **On** since 7 Oct 2026 |
| `STAGING_URL`, `STAGING_API_URL` | repository variables | same | Staging regression when run by hand. Not set; CD passes the URLs itself |
| `staging` | environment, deploys from `main` only | Settings > Environments | holds the deploy hooks |
| `production` | environment: Dr. Vyas or Khoa approves, no self-review, `rc-*` tags only, no secrets | Settings > Environments | `promote.yml` approval gate only |
| `main - peers-*-staging` | environments created by Render | — | Render's own deploy records. Don't delete them; Render recreates them |

There are no repository-level secrets, on purpose. A secret goes into the environment of the job that uses it.

## Routine upkeep

- **Dependabot pull requests (Mondays).** Minor and patch updates come grouped, one pull request per area; majors
  come one at a time. Merge them like any other pull request once the checks pass. Each npm merge that changes
  frontend or backend files triggers a Render build, and the workspace has 500 build minutes a month.
- **Action updates.** Dependabot bumps the pinned SHA and its `# vX.Y.Z` comment together. To add a new action,
  pin it the same way: `uses: owner/action@<40-character SHA> # v1.2.3`. A tag like `@v4` makes the workflow
  fail to start. Find the SHA with `gh api repos/<owner>/<action>/commits/<tag> --jq .sha`.
- **Coverage floors** (`coverage-floors.json`) only go up. Raise them in a pull request when coverage improves.
- **Accepted security risks expire** on 31 Dec 2026, after which OWASP blocks again. Review them before then
  ([security policy](../security/security-policy.md#2-accepting-a-risk)).
- **Runner image.** CI is pinned to `ubuntu-24.04`, and GitHub moves `ubuntu-latest` to 26.04 from 19 Oct 2026
  (CICD-54). Try a new label on a test branch first.

## When something is red

| What you see | What to do |
|---|---|
| A check failed with test or lint output | A real failure. Open the job log, reproduce locally with the README's [CI commands](../../README.md#continuous-integration), fix and push |
| A check is **cancelled** with "The job was not acquired by Runner of type hosted" | A GitHub outage, not your code. Check https://www.githubstatus.com. Wait until Actions is operational, then re-run (below) |
| Cancelled with "Canceling since a higher priority waiting request … exists" | A newer run of the same pull request replaced it. Only the newest commit's runs count; ignore the old one |
| "Expected — Waiting for status to be reported" | The branch is behind `main`. **Update branch** (or `gh pr update-branch <n>`) |
| `CodeQL` failed | A new alert in your change: Security > Code scanning, or the check's annotations. Fix it, or for a false positive dismiss it with a reason |
| `OWASP Dependency-Check` failed | A dependency gained a CVSS 7+ advisory. Upgrade it, or accept the risk as the [security policy](../security/security-policy.md) describes |
| Workflow fails to start: "must be pinned to a full-length commit SHA" | An action is referenced by tag. Pin it (see Routine upkeep) |
| CD failed | See [Rollback and recovery](rollback-and-recovery.md#r2-a-cd-run-failed) |

### Re-running after an outage

1. Make sure Actions shows operational on https://www.githubstatus.com. Re-running during the outage only gets
   cancelled again.
2. Re-run only the **current head commit** of a pull request: Actions > the run > **Re-run failed jobs**, or
   `gh run rerun <run-id> --failed`. Never re-run an older commit of the same pull request. Its runs share the
   concurrency group, so they cancel the current ones.
3. CodeQL's default-setup runs can't be re-run ("This workflow run cannot be retried"). Give the pull request a
   new commit instead: **Update branch** if it is behind `main`, otherwise push an empty commit
   (`git commit --allow-empty -m "Re-run the checks"`).
4. If a check can never pass (it's broken for everyone), fix the check itself in a pull request. If even that
   can't merge, a repository admin (`dgobin-ksu` or `KhoaHo-kho6`) can relax `main-protection` for that one
   merge, say so in the team channel, and put it back straight away.
