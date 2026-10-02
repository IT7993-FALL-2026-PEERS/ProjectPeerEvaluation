#!/usr/bin/env bash
# Waits for the frontend and backend and exits non-zero with a clear message if either
# is down. Used by the team locally and by CI after `docker compose up`.
#
#   bash scripts/verify-env.sh
#
# Environment overrides (all optional):
#   FRONTEND_URL  default http://localhost:3000
#   BACKEND_URL   default http://localhost:5000/api/health
#   TIMEOUT       seconds to wait per service, default 60
set -u

FRONTEND_URL="${FRONTEND_URL:-http://localhost:3000}"
BACKEND_URL="${BACKEND_URL:-http://localhost:5000/api/health}"
TIMEOUT="${TIMEOUT:-60}"

# curl is on macOS, Linux, GitHub runners and Git Bash for Windows.
command -v curl >/dev/null 2>&1 || { echo "✖ curl is required but not installed." >&2; exit 2; }

wait_for() {
  local name="$1" url="$2" waited=0
  # -f: HTTP >= 400 (e.g. the backend's 503 when MongoDB is down) counts as failure.
  while ! curl -sf --max-time 3 "$url" >/dev/null 2>&1; do
    if [ "$waited" -ge "$TIMEOUT" ]; then
      echo "✖ $name is NOT healthy: no successful response from $url after ${TIMEOUT}s" >&2
      return 1
    fi
    sleep 2
    waited=$((waited + 2))
  done
  echo "✔ $name is up ($url)"
}

status=0
wait_for "backend"  "$BACKEND_URL"  || status=1
wait_for "frontend" "$FRONTEND_URL" || status=1

if [ "$status" -ne 0 ]; then
  echo "" >&2
  echo "Hints: is 'npm run dev' (or 'docker compose ps') running? Is MongoDB reachable?" >&2
  echo "       A backend that answers 503 means it is up but cannot reach MongoDB." >&2
  exit 1
fi
echo "Environment healthy."
