#!/usr/bin/env bash
# Scenario 3: unit-tests pass -> deploy succeeds (production gets this commit!) ->
# integration-tests fail. Breaks the root route's message field, which only
# tests/integration/render-api.test.js asserts on -- no unit test checks it
# (unlike the root route's status/endpoints fields, which core-behavior.test.js
# does pin, and which an earlier version of this script mistakenly targeted).
# /api/health and app boot are untouched, so the deploy step's health-poll
# still succeeds.
#
# WARNING: this deliberately deploys broken-per-integration-tests code to
# production. Have revert-last-scenario.sh ready before running this.
set -euo pipefail

BRANCH="with-test-coverage"
REPO="dgobin-ksu/ProjectPeerEvaluation"
REPO_ROOT="$(git rev-parse --show-toplevel)"
FILE="$REPO_ROOT/src/backend/index.js"
cd "$REPO_ROOT"

current_branch="$(git branch --show-current)"
if [ "$current_branch" != "$BRANCH" ]; then
  echo "Currently on '$current_branch'. Switch to '$BRANCH' first:" >&2
  echo "  git checkout $BRANCH" >&2
  exit 1
fi

if ! git diff --quiet -- "$FILE" || ! git diff --cached --quiet -- "$FILE"; then
  echo "$FILE already has uncommitted changes. Commit or stash them first." >&2
  exit 1
fi

if ! grep -q "message: '🎓 Peer Evaluation System API'," "$FILE"; then
  echo "Expected root-route message line not found in $FILE -- has it changed?" >&2
  echo "Edit the script's sed pattern to match the current source before running." >&2
  exit 1
fi

echo "This WILL deploy a broken commit to production (peer-evaluation-backend-rd6z)."
echo "unit-tests and deploy should succeed; integration-tests should fail on GET / (message check)."
read -r -p "Continue? [y/N] " confirm
if [ "$confirm" != "y" ] && [ "$confirm" != "Y" ]; then
  echo "Aborted."
  exit 1
fi

sed -i "s/message: '🎓 Peer Evaluation System API',/message: 'Peer Evaluation System API (broken)',/" "$FILE"

git add "$FILE"
git commit -m "test: intentionally break integration-only assertion to verify deploy still occurs"
git push origin "$BRANCH"

echo
echo "Pushed $(git rev-parse HEAD). Production is now running this commit."
echo "Expected: unit-tests OK -> deploy OK -> integration-tests FAILS (GET / message check)."
echo "Watch: https://github.com/$REPO/actions"
echo
echo "To roll back once you've confirmed the failure, run:"
echo "  ./revert-last-scenario.sh       (fix-forward through the pipeline)"

if command -v gh >/dev/null 2>&1; then
  echo
  echo "Tailing the run with gh (Ctrl+C to stop watching; the pipeline keeps running)..."
  sleep 5
  gh run watch --repo "$REPO" || true
fi
