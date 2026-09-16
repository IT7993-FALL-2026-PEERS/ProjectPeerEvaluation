#!/usr/bin/env bash
# Local counterpart to scripts/ci-pipeline-tests/ and .github/workflows/ci-cd.yml:
# starts a local MongoDB, runs unit tests, then integration tests against that
# MongoDB, and only if both pass, runs the app itself so you can interact with
# it. Gives two independent ways to verify the same gates -- this script
# locally, the GitHub Actions pipeline in CI.
set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
BACKEND_DIR="$REPO_ROOT/src/backend"
MONGO_PORT="${MONGO_PORT:-27017}"
APP_PORT="${PORT:-5000}"
# Not exported at script scope on purpose: test:unit must run with no
# MONGODB_URI set in its environment, matching the CI unit-tests job (a
# separate process with no leaked env vars). If MONGODB_URI is already set
# for tests/unit/index-coverage.test.js's mongo-connect branch tests, one of
# its branches never gets exercised and the coverage threshold fails even
# though every test still passes.
APP_MONGODB_URI="${MONGODB_URI:-mongodb://127.0.0.1:${MONGO_PORT}/peer-evaluation}"
INTEGRATION_MONGODB_URI="mongodb://127.0.0.1:${MONGO_PORT}/peer-evaluation-integration-test"

cd "$REPO_ROOT"

echo "==> Starting local MongoDB (docker compose)..."
docker compose up -d mongo

echo "==> Waiting for MongoDB to accept connections..."
ready=0
for i in $(seq 1 30); do
  if docker compose exec -T mongo mongosh --quiet --eval "db.runCommand({ ping: 1 })" >/dev/null 2>&1; then
    ready=1
    break
  fi
  sleep 1
done
if [ "$ready" -ne 1 ]; then
  echo "MongoDB did not become ready in time." >&2
  exit 1
fi
echo "MongoDB is ready."

cd "$BACKEND_DIR"

echo
echo "==> Installing dependencies..."
npm install

echo
echo "==> Running unit tests..."
npm run test:unit

echo
echo "==> Running integration tests (against $INTEGRATION_MONGODB_URI)..."
MONGODB_URI="$INTEGRATION_MONGODB_URI" npm run test:integration

echo
echo "==> Unit and integration tests passed. Starting the app..."
echo "    MongoDB: $APP_MONGODB_URI"
echo "    App:     http://localhost:${APP_PORT}"
echo "    Ctrl+C stops the app. MongoDB keeps running -- 'docker compose stop mongo' to stop it."
echo

MONGODB_URI="$APP_MONGODB_URI" NODE_ENV=development PORT="$APP_PORT" node index.js
