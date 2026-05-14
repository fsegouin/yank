#!/usr/bin/env bash
#
# Deploy Yank to the NAS.
#
# Prerequisites on NAS (one-time):
#   1. Tailscale installed and joined to the tailnet
#   2. Docker + Docker Compose v2 installed
#   3. Repo cloned at $YANK_REMOTE_PATH (default: /srv/yank)
#   4. A .env file alongside docker-compose.yml on the NAS with prod secrets
#
# Usage:
#   ./scripts/deploy.sh                 # rebuild and restart everything
#   ./scripts/deploy.sh daemon          # rebuild and restart only the daemon
#   ./scripts/deploy.sh daemon api      # multiple specific services

set -euo pipefail

YANK_REMOTE_HOST="${YANK_REMOTE_HOST:-nas}"
YANK_REMOTE_PATH="${YANK_REMOTE_PATH:-/srv/yank}"

services=("$@")

echo "▶ Pushing latest commits to origin"
git push

echo "▶ Pulling on ${YANK_REMOTE_HOST} at ${YANK_REMOTE_PATH}"
ssh "${YANK_REMOTE_HOST}" "cd ${YANK_REMOTE_PATH} && git pull --ff-only"

if [ ${#services[@]} -eq 0 ]; then
  echo "▶ Building and restarting all services"
  ssh "${YANK_REMOTE_HOST}" "cd ${YANK_REMOTE_PATH} && docker compose up -d --build"
else
  echo "▶ Building and restarting: ${services[*]}"
  ssh "${YANK_REMOTE_HOST}" "cd ${YANK_REMOTE_PATH} && docker compose up -d --build ${services[*]}"
fi

echo "▶ Status"
ssh "${YANK_REMOTE_HOST}" "cd ${YANK_REMOTE_PATH} && docker compose ps"
