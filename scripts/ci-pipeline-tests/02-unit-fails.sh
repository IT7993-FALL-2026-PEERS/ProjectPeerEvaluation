#!/usr/bin/env bash
# Scenario 2: unit-tests fail -> integration-tests and deploy are skipped, nothing deploys.
# Breaks /api/health's status field, which tests/unit/api-routes.test.js asserts on.
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

if ! grep -q "    status: 'OK'," "$FILE"; then
  echo "Expected line (    status: 'OK',) not found in $FILE -- has it changed?" >&2
  echo "Edit the script's sed pattern to match the current source before running." >&2
  exit 1
fi

echo "This will commit a change that fails tests/unit/api-routes.test.js and push it"
echo "to '$BRANCH'. integration-tests and deploy should be SKIPPED (not run)."
read -r -p "Continue? [y/N] " confirm
if [ "$confirm" != "y" ] && [ "$confirm" != "Y" ]; then
  echo "Aborted."
  exit 1
fi

sed -i "s/    status: 'OK',/    status: 'BROKEN',/" "$FILE"

git add "$FILE"
git commit -m "test: intentionally break unit test to verify pipeline halts before integration/deploy"
git push origin "$BRANCH"

echo
echo "Pushed $(git rev-parse HEAD)."
echo "Expected: unit-tests FAILS, integration-tests and deploy show as SKIPPED."
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
