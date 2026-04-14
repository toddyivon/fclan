#!/usr/bin/env bash
# GT7 Telemetry SaaS Deployment Script
#
# Prerequisites:
#   - SSH key auth configured for the deploy host (see ~/.ssh/config)
#   - Required env vars: DEPLOY_HOST, DEPLOY_USER (defaults: root), DEPLOY_DIR
#   - Local .env.production exists (NOT committed)
#
# Usage:
#   DEPLOY_HOST=example.com DEPLOY_DIR=/opt/projects/gt7-telemetry ./deploy.sh

set -euo pipefail

: "${DEPLOY_HOST:?DEPLOY_HOST is required}"
: "${DEPLOY_DIR:?DEPLOY_DIR is required}"
DEPLOY_USER="${DEPLOY_USER:-root}"
PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
SSH_TARGET="${DEPLOY_USER}@${DEPLOY_HOST}"

if [[ ! -f "${PROJECT_DIR}/.env.production" ]]; then
  echo "ERROR: ${PROJECT_DIR}/.env.production missing" >&2
  exit 1
fi

echo "=========================================="
echo "  GT7 Telemetry SaaS - Deployment"
echo "  Target: ${SSH_TARGET}:${DEPLOY_DIR}"
echo "=========================================="

echo "[1/5] Creating remote directory..."
ssh -o StrictHostKeyChecking=accept-new -o ConnectTimeout=10 "${SSH_TARGET}" "mkdir -p ${DEPLOY_DIR}"

echo "[2/5] Copying project files..."
rsync -avz --delete \
  --exclude 'node_modules' \
  --exclude '.next' \
  --exclude '.git' \
  --exclude 'mobile-app' \
  --exclude 'scripts' \
  --exclude 'supabase' \
  --exclude 'specs' \
  --exclude '*.local' \
  --exclude '.env*' \
  "${PROJECT_DIR}/" \
  "${SSH_TARGET}:${DEPLOY_DIR}/"

echo "[3/5] Copying production environment file..."
scp -o StrictHostKeyChecking=accept-new \
  "${PROJECT_DIR}/.env.production" \
  "${SSH_TARGET}:${DEPLOY_DIR}/.env.production"

echo "[4/5] Building and starting containers..."
ssh -o StrictHostKeyChecking=accept-new "${SSH_TARGET}" DEPLOY_DIR="${DEPLOY_DIR}" bash <<'REMOTE'
set -euo pipefail
cd "${DEPLOY_DIR}"
docker compose down 2>/dev/null || true
docker compose up -d --build
for i in $(seq 1 20); do
  if docker compose ps | grep -q healthy; then
    echo "Container is healthy"
    break
  fi
  sleep 5
done
docker image prune -f >/dev/null 2>&1 || true
REMOTE

echo "[5/5] Verifying deployment..."
ssh -o StrictHostKeyChecking=accept-new "${SSH_TARGET}" \
  "docker ps --filter 'name=gt7-web' --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'"

echo ""
echo "=========================================="
echo "  Deployment complete"
echo "=========================================="
