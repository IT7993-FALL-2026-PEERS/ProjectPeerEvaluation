#!/usr/bin/env bash
# Thin wrapper so `bash scripts/setup.sh` works; the logic lives in setup.js, which also
# runs on Windows without bash. Usage: bash scripts/setup.sh [--env-only] [--force]
set -euo pipefail
cd "$(dirname "$0")/.."
command -v node >/dev/null 2>&1 || { echo "✖ Node.js not found. Install Node 24 (see .nvmrc): https://nodejs.org/" >&2; exit 1; }
exec node scripts/setup.js "$@"
