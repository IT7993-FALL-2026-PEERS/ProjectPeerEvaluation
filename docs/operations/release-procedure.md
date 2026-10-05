# Release procedure

From a merged pull request to staging, a release candidate, and, with approval, a GitHub Release. Most of it is
automatic. This page says what to watch and what to do by hand.

```
pull request ──► merge to main ──► CI on main ──► CD ──► staging ──► rc-* tag ──► Promote (approval) ──► release-*
                (8 required checks)               (deploy, smoke)   (CD_RELEASE=on)   (Dr. Vyas or Khoa)
```

**Two modes.** While the repository variable `CD_RELEASE` is off (it is today), CD only deploys staging. Steps 3
and 4 below need it **on**. The switch, and why it is still off, is in
[`docs/cd-pipeline.md`](../cd-pipeline.md#release-pipeline-cdyml-cicd-28-design-for-review).

## Before you start

- Staging has to be **running**. It is suspended between checks and demos to save money, and Khoa resumes it in
  Render ([Render handover](render-handover.md)). While it's suspended, a deploy fails at "waiting until live".
- Your change is merged into `main` through a pull request with all eight required checks green
  ([CI/CD operations](ci-cd-operations.md#required-checks)).

## 1. CI on `main`

Merging starts CI again on `main` (Actions > CI, event `push`). CD starts only if this run passes. If it's
cancelled by a GitHub outage, re-run it once Actions is operational
([CI/CD operations](ci-cd-operations.md#re-running-after-an-outage)): re-running CI also starts CD.

## 2. Staging deploy (automatic)

Actions > **CD**, the run for your commit. Its summary starts with a **CD plan** that lists what this run does.

| Job | Look for |
|---|---|
| Prepare | The plan. "main has moved on" means a newer commit's run will deploy instead, which is fine |
| Deploy to staging (backend), (frontend) | `deploying, N changed file(s)` then `<commit> is live`, or `skipping, no file this service uses changed`. A skip is normal for docs-only or backend-only changes |
| report / Deployment status | **Deployed and healthy** |

Check it yourself:

```bash
curl -s https://peers-backend-staging.onrender.com/api/health     # "status":"OK", "commit":"<sha>"
curl -s https://peers-frontend-staging.onrender.com/version.txt   # <sha>
```

The two commits can differ: a service keeps its commit until a change touches files it uses. To deploy both
services anyway, for example after changing an environment variable in Render, run **Actions > CD > Run workflow**
on `main` with **force** ticked. A manual run only deploys a commit whose CI run on `main` passed, and force never
deploys an older commit than the live one (going back is [rollback](rollback-and-recovery.md#r1-staging-is-broken-after-a-deploy)'s job).

If the deploy fails, go to [Rollback and recovery, R2](rollback-and-recovery.md#r2-a-cd-run-failed).

## 3. Release candidate (automatic, `CD_RELEASE=on`)

With the release stages on, the same CD run also:

1. builds both images, checks they're healthy, and pushes them to GHCR tagged with the commit (`images`);
2. after the deploy, runs Staging regression (`smoke`);
3. if all of that passed, and **at least one `@staging` test ran**, creates the tag `rc-<yyyymmdd>-<hhmm>-<sha7>`
   and a **pre-release** with `release-record.json` attached (`Tag release candidate`). The record lists both
   services' commits as staging reported them, the images and their digests, the smoke result and test count, the
   CI run and its coverage, the previous release, and how to recover.

A failed step means **no tag**, a failed run, and an automatic rollback to the previous release
([R2](rollback-and-recovery.md#r2-a-cd-run-failed)). The very first release candidate has nothing to roll back to,
so make it from a commit where staging is known to be good. Release candidates are under the repository's **Releases**,
marked *Pre-release*.

## 4. Promote a release candidate (optional)

Production hosting is out of scope, so "promote" means recording a release candidate as an approved release.
The production deploy step is a placeholder.

1. Actions > **Promote release candidate** > Run workflow > **Use workflow from > Tags >** `rc-…`.
   Leave **dry_run** ticked for a rehearsal. A dry run publishes a *draft* release, which only maintainers can see.
2. `Check the release candidate` confirms it's a real `rc-*` from CD: its record names the tag's commit, links the
   CD run that made it, and says the smoke tests passed. A hand-made release candidate is refused.
3. `Promote to production` **waits for approval**. Ask Dr. Vyas or Khoa: one approval is enough, and whoever
   started the run can't approve it. The approver opens the run > **Review deployments** > tick `production` >
   **Approve and deploy**.
4. The run publishes `release-<yyyymmdd>-<hhmm>-<sha7>` with the release record and the requester and approver.
   Delete a dry-run draft under Releases when you're done; otherwise the same candidate can't be promoted again.

Rejecting the review, or leaving it for 30 days, ends the run without a release.

## Release checklist

- [ ] Staging is running.
- [ ] Pull request merged with eight green checks.
- [ ] CI on `main` passed.
- [ ] CD passed: each service deployed or rightly skipped, and Deployment status says *Deployed and healthy*.
- [ ] `/api/health` and `/version.txt` show the expected commits.
- [ ] With `CD_RELEASE=on`: the `rc-*` pre-release exists and its record matches staging.
- [ ] If promoting: the approval is given, and `release-*` is published (or the draft is deleted after a dry run).
