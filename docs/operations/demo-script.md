# Demo script

A written walk through the whole system for the sponsor package (Nov 29), the Computing Showcase (Wednesday,
Dec 2, 2026) and the final package (Dec 6). It covers the path from a pull request to staging, the application
itself, and the release and rollback safety nets. The time, room and audience of the Showcase are set by the
organisers; add them here when they are known.

**What it proves.** A change goes from a pull request to staging with no manual step except the production approval;
the application does its job on that staging site; and a bad release can be undone.

**Length.** About 15 minutes in full (parts A to D). For the Showcase, a 5 minute version is parts B and C only.

## Before the demo

| When | Check | How |
|---|---|---|
| 2 days before | Staging is healthy and current | `curl -s https://peers-backend-staging.onrender.com/api/health` shows `"status":"OK"`, `"database":"connected"` and the `commit` of the latest `main`; `curl -s https://peers-frontend-staging.onrender.com/version.txt` shows the same commit |
| 2 days before | The last CD run on `main` is green and made an `rc-*` release | Actions > CD; Releases |
| 2 days before | Mailtrap quota | The sandbox plan allows 50 emails a month, 10 stored messages and one email every 10 seconds. Every send uses some of it, so count them: send one team of three or fewer per run and empty the inbox afterwards |
| 2 days before | Demo data exists (see below) | Log in as the demo instructor and open the course |
| 1 hour before | Repeat the health check; log in once (a session lasts at most 8 hours and ends after 60 minutes idle) | |
| 1 hour before | Open the tabs in this order: the pull request page, Actions > CD, the staging site (instructor), the Mailtrap sandbox inbox, a private window for the student, the health URL | |
| Always | Fallback assets are ready | Screenshots and a short screen recording of every step, made from a clean run before the demo. Say plainly that a recording is a recording |

**Accounts.** One demo instructor account on staging and the Mailtrap login. The team leader holds the credentials; do
not write them in this file or in a chat. Registration is limited to `@kennesaw.edu` addresses, so do not demo
registering. GitHub: a second person who can approve at the `production` environment, and someone with Write access
for the rollback.

**Demo data.** Test data only, student addresses on `example.edu` (they land in the Mailtrap sandbox, never in a
real inbox). Two courses, because the curve is worked out per course and the live step in B1 and B2 must not change the
numbers shown in B3:

- **Demo report** (seed it once, a day or more before; it is what B3 shows): one team, **Team 1**, four students (call
  them A, B, C, D) who have all submitted. Send the invitations (four emails, about 40 seconds), then submit each
  form from its Mailtrap link. In every form give **all six criteria the same number**, and a feedback line of at
  least 50 characters. The numbers each student gives:

  | Rater | Rates A | Rates B | Rates C | Rates D |
  |---|---|---|---|---|
  | A | | 5 | 4 | 3 |
  | B | 5 | | 4 | 3 |
  | C | 5 | 5 | | 3 |
  | D | 4 | 4 | 4 | |

- **Demo live** (used live in B1 and B2, recreate it before each run): one team, **Team 2**, three students, nothing
  sent. Upload `e2e/fixtures/roster.csv` or add them by hand.

**Expected numbers for Demo report.** They were checked on Nov 19, 2026 against the real report endpoints (all three
methods, and the team grade typed as 85) with the ratings above, on a test database. Check them against staging once
after seeding. If a number differs, stop and find out why before the demo.

| Student | Regular (mean score) | Curved (mean 85, deviation 20) | Contribution score | Multiplier | Final grade, team grade automatic (100) | Final grade, team grade typed as 85 |
|---|---|---|---|---|---|---|
| A | 93.33 | 100 | 100 | 1.00 | 100 | 85 |
| B | 93.33 | 100 | 100 | 1.00 | 100 | 85 |
| C | 80.00 | 82.56 | 80 | 0.9231 | 90 (92.31 before rounding) | 80 (78.46 before rounding) |
| D | 60.00 | 53.24 | 60 | 0.6429 | 65 (64.29 before rounding), **flagged** | 55 (54.64 before rounding), **flagged** |

The class mean for the curve is 81.67 with a standard deviation of 13.64. What the table lets you say: the multiplier
never goes above 1.00 (A and B), a lower score only shares the team grade out (C), and there is no floor: D gets what
the formula gives and is flagged for the instructor (the multiplier took the grade below 70). Final grades are rounded
to the nearest 5. Typing 85 as the team grade lowers everyone's grade.

## A. The pipeline (about 5 minutes)

| # | Show | Expected | If it fails |
|---|---|---|---|
| A1 | A pull request with its checks. Name the eight required checks (frontend, backend, integration, E2E, containers, CodeQL, OWASP, workflow lint) and that a red one cannot merge (ruleset `main-protection`, no bypass) | All checks green; the merge button is blocked while any is red | Use PR [#296](https://github.com/IT7993-FALL-2026-PEERS/ProjectPeerEvaluation/pull/296) (all checks green) |
| A2 | The CD run for the merge: Actions > CD. Walk the jobs: Prepare, images, scan the images (Trivy), deploy backend and frontend, smoke tests, move the staging pointer, tag the release candidate | Every job green; the run summary shows what was deployed | Show run [44460477771](https://github.com/IT7993-FALL-2026-PEERS/ProjectPeerEvaluation/actions/runs/44460477771) (for #296) |
| A3 | Staging reports what it runs | The health `commit` and `/version.txt` equal the commit in A2 | Quote the two lines from the run summary |
| A4 | The release candidate: Releases > the newest `rc-*` | A pre-release with `release-record.json` (both commits, the backend image digest, smoke result, run links) | Show `rc-20261119-0451-15398b0` |

A live merge during the demo takes about 10 minutes before staging shows it. Either merge a small pull request before
the demo starts and show the finished run, or open it at the start of part B and come back in part C.

## B. The application (about 7 minutes, instructor then student)

| # | Show | Expected | If it fails |
|---|---|---|---|
| B1 | Instructor sends evaluations to **Team 2** (Demo live) with a deadline in the future (before sending, the app tells the instructor who the send cannot reach, and while it runs, how many invitations it is sending and about how long it takes) | The app reports the invitations as sent; three messages arrive in the Mailtrap inbox, one every 10 seconds, so talk while they arrive | Show the prepared screenshots; if Mailtrap is over its limit, say so and use the invitation link from the recording |
| B2 | Student: open the personal link from the email in a private window, rate the teammates on the sponsor's rubric (six criteria, five levels each) and write the feedback (50 to 500 characters), submit | The submission is accepted; the instructor's status shows it; a second submission with the same link is refused | Use the recording; or a prepared student link of a team that has not submitted |
| B3 | Reports for **Demo report**: the regular method, the curved method (mean 85, deviation 20, the default) and the **Contribution Multiplier** method; the Team Grades panel (type 85, then back to automatic); the **Review** mark on D and the **Edit** button (set a final score by hand: the row shows Adjusted; **Use calculated grade** undoes it); Download CSV | Numbers match the table in *Demo data*; the CSV opens with the same columns, including Flag, Calculated Score and Final Score Source | Screenshots; the numbers from the table |
| B4 | Roster: upload `e2e/fixtures/roster.csv` into an empty demo course, optional | Students appear under their teams; a bad team name is reported, not silently dropped | Skip it |

Curved grading is the default method. The Contribution Multiplier is a third method, proposed after the sponsor's Oct 30
answer and changed to her feedback; say that when you show it, and that all three methods stay available.

## C. The safety nets (about 3 minutes)

| # | Show | Expected | If it fails |
|---|---|---|---|
| C1 | Release gate: Actions > Promote release candidate > Run workflow from the newest `rc-*` tag with **dry run on** | It checks the release candidate, waits at the `production` environment for an approver, then publishes a **draft** release; production hosting is out of scope, so nothing is deployed. A dry run is never refused; a real promotion needs a candidate newer than the last change to `.github/workflows/` | A draft for the same tag blocks a repeat ("already exists"): use a newer tag or delete the draft first. Fallback: run [39033612573](https://github.com/IT7993-FALL-2026-PEERS/ProjectPeerEvaluation/actions/runs/39033612573) (Oct 17) |
| C2 | Rollback: Actions > **Manual Rollback** > Run workflow, branch `main`, paste the previous `rc-*` tag (the newest release's notes name it) | The run checks the tag, starts CD in rollback mode and links that run; staging returns to that release's commits and image digest; smoke tests pass; the pointer moves back. To put staging back, run Manual Rollback again with the newest `rc-*` tag (done this way on Oct 27), or run CD with **force** | Describe it and show the Oct 27 runs: [Manual Rollback 40603963449](https://github.com/IT7993-FALL-2026-PEERS/ProjectPeerEvaluation/actions/runs/40603963449) (rolled back) and [40604530549](https://github.com/IT7993-FALL-2026-PEERS/ProjectPeerEvaluation/actions/runs/40604530549) (rolled forward). Do C2 live only if there is time to put staging back before the next step, and never roll back past a release that changed the database (read the notes of the releases in between) |
| C3 | The Staging regression workflow runs the smoke tests every week | A green scheduled run (for example Nov 17) | Show the Actions list |

## D. Close (about 1 minute)

Requirements traceability (`docs/requirements/rtm.md`), the runbook ([operations](README.md)), and what happens on
Dec 6: staging is handed over or shut down ([Render handover](render-handover.md)).
