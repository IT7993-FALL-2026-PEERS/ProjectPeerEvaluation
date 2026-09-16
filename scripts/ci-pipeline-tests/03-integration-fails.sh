#!/usr/bin/env bash
# Scenario 3: unit-tests pass -> integration-tests fail -> deploy is skipped.
# Breaks the root route's message field, which only
# tests/integration/local-api.test.js asserts on -- no unit test checks it
# (unlike the root route's status/endpoints fields, which core-behavior.test.js
# does pin). Since integration-tests now runs before deploy (against a real
# local MongoDB in CI, not production), nothing ever reaches Render here --
# there is no rollback scenario to prepare for.
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

echo "This will commit a change that fails tests/integration/local-api.test.js and push"
echo "it to '$BRANCH'. unit-tests should pass; integration-tests should fail; deploy"
echo "should show as SKIPPED. Nothing reaches production."
read -r -p "Continue? [y/N] " confirm
if [ "$confirm" != "y" ] && [ "$confirm" != "Y" ]; then
  echo "Aborted."
  exit 1
fi

sed -i "s/message: '🎓 Peer Evaluation System API',/message: 'Peer Evaluation System API (broken)',/" "$FILE"

git add "$FILE"
git commit -m "test: intentionally break integration-only assertion to verify deploy is skipped"
git push origin "$BRANCH"

echo
echo "Pushed $(git rev-parse HEAD)."
echo "Expected: unit-tests OK -> integration-tests FAILS (GET / message check) -> deploy SKIPPED."
echo "Watch: https://github.com/$REPO/actions"
echo
echo "When you've confirmed the failure, clean up with:"
echo "  ./revert-last-scenario.sh"

if command -v gh >/dev/null 2>&1; then
  echo
  echo "Tailing the run with gh (Ctrl+C to stop watching; the pipeline keeps running)..."
  sleep 5
  gh run watch --repo "$REPO" || true
fi
