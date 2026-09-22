#!/usr/bin/env bash
# Triggers .github/workflows/deploy-production.yml by pushing a tag -- see
# that file's header for why a tag push, not the Actions "Run workflow"
# button. Deploys whichever app(s) you name, only after that app's unit +
# integration tests pass in CI; nothing reaches production untested.
#
# Usage:
#   scripts/deploy-to-production.sh backend
#   scripts/deploy-to-production.sh frontend
#   scripts/deploy-to-production.sh both
set -euo pipefail

TARGET="${1:-}"
if [ "$TARGET" != "backend" ] && [ "$TARGET" != "frontend" ] && [ "$TARGET" != "both" ]; then
  echo "Usage: $0 <backend|frontend|both>" >&2
  exit 1
fi

REPO="dgobin-ksu/ProjectPeerEvaluation"
REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"

if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "Working tree has uncommitted changes. Commit or stash them first." >&2
  exit 1
fi

current_branch="$(git branch --show-current)"
current_sha="$(git rev-parse --short HEAD)"
stamp="$(date -u +%Y%m%d%H%M%S)"

tags=()
[ "$TARGET" = "backend" ] || [ "$TARGET" = "both" ] && tags+=("deploy-backend-production-$stamp")
[ "$TARGET" = "frontend" ] || [ "$TARGET" = "both" ] && tags+=("deploy-frontend-production-$stamp")

echo "About to deploy '$current_branch' @ $current_sha to PRODUCTION ($TARGET)."
echo "This runs that app's tests first, and only deploys if they pass."
read -r -p "Continue? [y/N] " confirm
if [ "$confirm" != "y" ] && [ "$confirm" != "Y" ]; then
  echo "Aborted."
  exit 1
fi

for tag in "${tags[@]}"; do
  git tag "$tag"
  git push origin "$tag"
  echo "Pushed tag $tag."
done

echo
echo "Watch: https://github.com/$REPO/actions"

if command -v gh >/dev/null 2>&1; then
  echo
  echo "Tailing the run with gh (Ctrl+C to stop watching; the pipeline keeps running)..."
  sleep 5
  gh run watch --repo "$REPO" || true
fi
