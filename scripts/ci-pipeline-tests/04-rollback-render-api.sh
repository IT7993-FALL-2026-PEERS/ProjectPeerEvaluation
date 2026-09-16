#!/usr/bin/env bash
# Scenario 4a: fast rollback via the Render API to the previous live deploy.
#
# Requires:
#   RENDER_API_KEY    Render dashboard -> Account Settings -> API Keys
#   RENDER_SERVICE_ID The service's srv-xxxxxxxx id. Find it in the service's
#                      dashboard URL, or list your services with:
#                        curl -s -H "Authorization: Bearer $RENDER_API_KEY" \
#                          https://api.render.com/v1/services | jq '.[].service | {id, name}'
set -euo pipefail

: "${RENDER_API_KEY:?Set RENDER_API_KEY first}"
: "${RENDER_SERVICE_ID:?Set RENDER_SERVICE_ID first}"

if ! command -v jq >/dev/null 2>&1; then
  echo "jq is required (https://jqlang.org/). Install it and re-run." >&2
  exit 1
fi

API="https://api.render.com/v1"
AUTH_HEADER="Authorization: Bearer $RENDER_API_KEY"

echo "Fetching the two most recent live deploys..."
deploys="$(curl -fsS -H "$AUTH_HEADER" "$API/services/$RENDER_SERVICE_ID/deploys?status=live&limit=2")"

count="$(echo "$deploys" | jq 'length')"
if [ "$count" -lt 2 ]; then
  echo "Fewer than 2 live deploys found -- nothing to roll back to." >&2
  exit 1
fi

current_id="$(echo "$deploys" | jq -r '.[0].deploy.id')"
current_commit="$(echo "$deploys" | jq -r '.[0].deploy.commit.id')"
target_id="$(echo "$deploys" | jq -r '.[1].deploy.id')"
target_commit="$(echo "$deploys" | jq -r '.[1].deploy.commit.id')"
target_finished="$(echo "$deploys" | jq -r '.[1].deploy.finishedAt')"

echo
echo "Currently live:     deploy $current_id, commit $current_commit"
echo "Will roll back to:  deploy $target_id, commit $target_commit (finished $target_finished)"
echo
echo "Note: an API-triggered rollback does NOT disable Auto-Deploy. That's currently"
echo "set to Off for this service, so it's not an active risk -- but if it's ever"
echo "turned back on, a later push could silently overwrite this rollback."
read -r -p "Continue? [y/N] " confirm
if [ "$confirm" != "y" ] && [ "$confirm" != "Y" ]; then
  echo "Aborted."
  exit 1
fi

curl -fsS -X POST "$API/services/$RENDER_SERVICE_ID/rollback" \
  -H "$AUTH_HEADER" \
  -H "Content-Type: application/json" \
  -d "{\"deployId\": \"$target_id\"}"

echo
echo "Rollback triggered."
echo "Check status: curl -s -H \"$AUTH_HEADER\" \"$API/services/$RENDER_SERVICE_ID/deploys?limit=1\" | jq"
echo "Or verify directly: curl -s https://peer-evaluation-backend-rd6z.onrender.com/api/health | jq"
