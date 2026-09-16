#!/usr/bin/env bash
# Scenario 1: unit-tests pass -> deploy -> integration-tests pass.
# No source change needed -- just pushes an empty commit to trigger the pipeline.
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

git commit --allow-empty -m "test: pipeline happy path $(date -u +%Y-%m-%dT%H:%M:%SZ)"
git push origin "$BRANCH"

echo
echo "Pushed $(git rev-parse HEAD)."
echo "Expected: unit-tests OK -> deploy OK -> integration-tests OK."
echo "Watch: https://github.com/$REPO/actions"

if command -v gh >/dev/null 2>&1; then
  echo
  echo "Tailing the run with gh (Ctrl+C to stop watching; the pipeline keeps running)..."
  sleep 5
  gh run watch --repo "$REPO" || true
fi
