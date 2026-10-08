# Team guide

A few short working habits for PEERS. They are adapted from Matt Pocock's
[skills](https://github.com/mattpocock/skills) (MIT license): `pr`, `code-review`,
`resolving-merge-conflicts`, `tdd` and `handoff`.

## Opening a pull request

- Say what changed and why in a few sentences.
- Answer "Can this be undone?" in the template. A **two-way door** is easy to revert. A **one-way
  door** is not: deploys, data, secrets, or rewriting history. For a one-way change, say what could
  go wrong and what has to happen first. Example: a change that stops the backend from starting
  until `JWT_SECRET` is set on Render.
- Show that it works: a screenshot, or the test that failed before and passes now.

## Merging your own pull request

You can merge your own pull request once the required checks pass. No approval is needed. The
`main-protection` ruleset requires a pull request, the four CI checks, and a branch that is up to
date with `main`, but 0 approvals and no code-owner review, so nobody waits on a reviewer to ship.
Reviews are still welcome: CODEOWNERS requests one automatically, and for a one-way door, ask
someone to look before you merge.

If GitHub says the branch is out of date, click **Update branch** (or run
`gh pr update-branch <number>`), wait for the checks to pass again, then merge.

### No bypass

Nobody can bypass `main-protection`, admins included: every change to `main` goes through a pull
request with passing checks, and a direct push is rejected (`GH013: Changes must be made through a
pull request`). If a required check is broken and blocks every merge, fix the check in a pull
request. If even that can't pass, a repository admin (**dgobin-ksu** or **KhoaHo-kho6**) can
change the ruleset in Settings → Rules → Rulesets. Say in the team channel what was changed and
why, and put the setting back straight after.

## Reviewing a pull request

Ask two separate questions and answer them separately:

1. **Does it do what was asked?** Compare it with the task or milestone item. Is anything missing,
   extra, or wrong?
2. **Does it follow our habits?** Node 24, the PR template, no secrets, tests for new behavior,
   short docs.

A change can do the right thing badly, or the wrong thing well. Keeping the two questions apart
stops one from hiding the other.

## Resolving merge conflicts

1. Look at the state: `git status`, the log, and the conflicting files.
2. Find out why each side changed (commit messages, PRs).
3. Fix each conflict. Keep both intentions where you can. If they clash, pick the one that matches
   the goal of the merge and note the trade-off. Don't invent new behavior, and finish the merge
   instead of aborting it.
4. Run the checks (`npm test`, `npm run build`, `npm run test:e2e`) and fix
   anything the merge broke.
5. Commit the merge and let CI run again.

If a pull request is only behind `main`, no conflict work is needed: use **Update branch**, or
`gh pr update-branch <number>`.

## Writing tests

- Test what a user or caller can see, not the inner workings. A refactor should not break the test.
- Go one step at a time: one test, then just enough code to pass it, then the next test. Don't
  write all the tests first.
- Get the expected value from somewhere independent (a fixed example or the requirements). A test
  that recomputes the answer the way the code does can never fail.
- Agree on what to test before writing tests, so the effort goes to the critical workflows.

## Handing work to the next person (or the next AI session)

Leave a short "pick up here" note: what is done, what is next, and links to the PRs and docs. Don't
repeat what is already in a PR or a document; link to it instead. Leave out passwords and personal
details.
