#!/usr/bin/env bash
# Reverts the most recent commit on the current branch and pushes the revert.
# Use after 02-build-fails.sh (cleanup) or 03-integration-fails.sh (fix-forward
# rollback -- re-runs the full pipeline against the reverted code, including a
# real redeploy).
set -euo pipefail

BRANCH="with-test-coverage"
REPO="dgobin-ksu/ProjectPeerEvaluation"
REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"

current_branch="$(git branch --show-current)"
if [ "$current_branch" != "$BRANCH" ]; then
  echo "Currently on '$current_branch'. Switch to '$BRANCH' first:" >&2
  echo "  git checkout $BRANCH" >&2
  exit 1
fi

last_subject="$(git log -1 --pretty=%s)"
echo "About to revert HEAD ($(git rev-parse --short HEAD)): $last_subject"
read -r -p "Continue? [y/N] " confirm
if [ "$confirm" != "y" ] && [ "$confirm" != "Y" ]; then
  echo "Aborted."
  exit 1
fi

git revert --no-edit HEAD
git push origin "$BRANCH"

echo
echo "Reverted and pushed $(git rev-parse HEAD)."
echo "Watch: https://github.com/$REPO/actions"
