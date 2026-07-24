#!/bin/bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
cd "$PROJECT_DIR"

PORT="${DEPLOY_RUN_PORT:-5000}"

start_service() {
  echo "Starting HTTP service on port ${PORT} for deploy..."
  npx next start -p "${PORT}" -H 0.0.0.0
}

start_service
