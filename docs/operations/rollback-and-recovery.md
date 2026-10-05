# Rollback and recovery

What to do when something goes wrong, by symptom. Each entry says how to tell, what to do first, and how to
confirm it's fixed. Staging is the only hosted environment, so every rollback here is a staging rollback.

| | Symptom |
|---|---|
| [R1](#r1-staging-is-broken-after-a-deploy) | Staging is broken after a deploy |
| [R2](#r2-a-cd-run-failed) | A CD run failed |
| [R3](#r3-staging-doesnt-answer) | Staging doesn't answer at all |
| [R4](#r4-health-says-degraded-database) | `/api/health` says `DEGRADED` (database) |
| [R5](#r5-emails-arent-sent-on-staging) | Emails aren't sent on staging |
| [R6](#r6-the-browser-shows-cors-errors) | The browser shows CORS errors |
| [R7](#r7-a-secret-leaked) | A secret leaked |
| [R8](#r8-ci-blocks-every-merge) | CI blocks every merge |

**Commits to know.** Live: `curl -s https://peers-backend-staging.onrender.com/api/health` (`commit`) and
`curl -s https://peers-frontend-staging.onrender.com/version.txt`. Known good: the newest `rc-*` pre-release under
Releases, whose `release-record.json` lists both services' commits.

## R1. Staging is broken after a deploy

The app misbehaves, but `/api/health` still answers.

**Option A: roll back to a release candidate** (needs an `rc-*` release, so `CD_RELEASE=on`).
1. Actions > **CD** > Run workflow > branch `main` > **rollback_to** = the last good `rc-…` tag.
2. The `Roll back` jobs force-redeploy each service to the commit in that release's record, and wait until
   staging reports it.
3. Confirm: `/api/health` and `/version.txt` show the release's commits.

**Option B: Render's own rollback** (fastest; needs the Render account, Khoa).
Render > the service > **Events** > an earlier successful deploy > **Rollback**, or Manual Deploy > *Deploy a
specific commit*. Render's auto-deploy is off, so nothing undoes this until the next CD deploy.

**Option C: revert the change** (always available; this is what keeps the fix).
1. On GitHub, open the merged pull request and click **Revert**, or run `git revert -m 1 <merge commit>` on a branch.
2. Merge the revert pull request once its checks pass. CD deploys the reverted code like any change.

A and B are temporary: the next merge to `main` deploys `main` again. If `main` itself is broken, follow A or B
with C.

## R2. A CD run failed

Open the run and find the first red job.

| Failed job | Meaning | Do |
|---|---|---|
| Prepare | Bad `rollback_to` value, or no release record for it | Use an exact `rc-…` tag name from Releases |
| images | The images didn't build or weren't healthy in Compose | Same as a red `Containers` check in CI: reproduce with `npm run docker:up` |
| Deploy to staging: "set SERVICE, SHA and HOOK_URL" | A deploy hook secret is missing | Add it to the `staging` environment ([Render handover](render-handover.md#render-settings-to-know)) |
| Deploy: "Render refused the deploy hook (HTTP 4xx)" | The hook was regenerated or deleted in Render | New hook from Render > service > Settings > Deploy Hook, saved to the `staging` environment secret |
| Deploy: "was not live after 20 minutes" | Render's build failed, the service is suspended, or the new version doesn't start | Render > service > **Events / Logs**. Suspended: R3. Build or start error: fix in a pull request, or roll back (R1) |
| smoke | Staging regression failed after the deploy | Its report artifact names the failing test. CD has already rolled back (`Roll back` jobs) if an earlier release exists |
| Tag release candidate: "staging did not report its commits" | A service couldn't be asked which commit it runs | Check both URLs above. Re-run CD by hand once they answer |
| report: "Deployment status: set ENVIRONMENT and RESULT" | Should no longer happen (an `abandoned` result was fixed in #156) | Re-run the run |
| Jobs cancelled, "not acquired by Runner" | A GitHub Actions outage | Wait for https://www.githubstatus.com, then **Re-run failed jobs** |

A failed deploy or smoke run never creates an `rc-*` tag. With `CD_RELEASE=on` and an earlier release, CD rolls
back by itself, but **the run stays failed** on purpose: someone still has to fix the cause.

## R3. Staging doesn't answer

`curl` times out or Render shows a "service suspended" page.

1. It's probably suspended: staging is switched off between checks and demos. Ask Khoa to **Resume** both
   services in Render ([Render handover](render-handover.md)).
2. After resuming, the services run the commit they had. To bring them up to `main`, run **CD** by hand with
   **force**.
3. If it's not suspended, check Render > service > **Events** for a failed deploy (R2), and Render's status page.

## R4. Health says DEGRADED (database)

`/api/health` answers 503 with `"database":"disconnected"`. The backend is up but can't reach MongoDB Atlas.

1. Atlas > the cluster: is it running? Free M0 clusters are paused after a long time unused, so resume it.
2. Atlas > **Network Access**: Render's outbound IP addresses must be allowed (`render.yaml` says so).
3. Render > `peers-backend-staging` > **Environment**: `MONGODB_URI` must be the Atlas connection string, and the
   database user's password must still be valid.
4. Restart the backend (Render > Manual Deploy > *Restart service*), and confirm `/api/health` says `OK`.

**Data recovery:** Atlas M0 has no automatic backups. Staging data is test data, so the recovery is to re-create
it (upload a roster CSV again, see [`docs/csv-upload-format.md`](../csv-upload-format.md)).

## R5. Emails aren't sent on staging

Invitations or resets fail with "Staging only sends email through the Mailtrap sandbox … No email was sent".
That's the staging email guard (CICD-44) doing its job: a setting points at something other than the sandbox.

1. Render > `peers-backend-staging` > **Environment**: `SMTP_HOST` must be `sandbox.smtp.mailtrap.io`, and
   `SMTP_SERVICE` must not exist. `SMTP_USER` and `SMTP_PASS` come from Mailtrap > Sandboxes > SMTP settings.
2. The backend's startup log (Render > Logs) prints the same reason when it starts with a wrong setting.
3. Don't switch the guard off. It's what keeps real students from getting staging email.

"550 Too many emails per second" means Mailtrap's free plan is limiting the sends (one every 10 s);
`EMAIL_SEND_INTERVAL_MS` is 11000 on staging for this. A batch of more than 14 recipients is refused: send team
by team.

## R6. The browser shows CORS errors

The frontend can't call the API, and the browser console shows "blocked by CORS policy".

The backend only accepts the origin of `FRONTEND_URL` (CICD-37). On staging, `render.yaml` sets it to
`https://peers-frontend-staging.onrender.com`. If the frontend's address changed (a renamed service, a custom
domain), change `FRONTEND_URL` to match, then redeploy the backend (CD with force, or Render > Manual Deploy).
Locally: open the app at `http://localhost:3000`, or set `FRONTEND_URL` to the address you use
([Docker setup](../docker-setup.md)).

Check: `curl -sI https://peers-backend-staging.onrender.com/api/health -H "Origin: https://peers-frontend-staging.onrender.com"`
should include `access-control-allow-origin`.

## R7. A secret leaked

Act first, then tell the team. Never paste the new value anywhere but where it belongs.

| Leaked | Do |
|---|---|
| A Render deploy hook URL | Render > service > Settings > Deploy Hook > **Regenerate**; save the new URL as the `staging` environment secret (`gh secret set RENDER_BACKEND_DEPLOY_HOOK_URL --env staging`) |
| `JWT_SECRET` (staging) | Render > backend > Environment > generate a new value (32+ characters) and save. Everyone is logged out |
| MongoDB Atlas password | Atlas > Database Access > edit the user > new password; update `MONGODB_URI` in Render |
| Mailtrap SMTP credentials | Mailtrap > the sandbox > reset credentials; update `SMTP_USER` and `SMTP_PASS` in Render |
| A secret committed to git | Rotate it as above first. Removing it from history doesn't help, because it was already public. Push protection should have stopped it, so say how it got through |

## R8. CI blocks every merge

See [CI/CD operations, When something is red](ci-cd-operations.md#when-something-is-red). In short: an outage
means wait, then re-run the current commit only. A broken check gets fixed in a pull request. Relaxing the
ruleset is for an admin, for one merge, announced in the team channel, and put back straight away.
