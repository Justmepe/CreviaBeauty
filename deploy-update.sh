#!/usr/bin/env bash
#
# CreviaBeauty — incremental update on the VPS.
# Pulls the latest code, installs deps if package.json changed, restarts PM2.
# Idempotent and safe to re-run.
#
# Run as root (or the user that owns the app dir) from the app directory.

set -euo pipefail

APP_NAME="creviabeauty"
APP_DIR="/var/www/${APP_NAME}"

cd "${APP_DIR}"

echo "[1/4] Fetching latest code"
git fetch --prune origin
BEFORE="$(git rev-parse HEAD)"
git reset --hard origin/main
AFTER="$(git rev-parse HEAD)"

if [[ "${BEFORE}" == "${AFTER}" ]]; then
  echo "  Already up to date — nothing to deploy."
  exit 0
fi

echo "  Updated ${BEFORE:0:7} → ${AFTER:0:7}"

echo "[2/4] Installing dependencies (only if package.json or lockfile changed)"
if git diff --name-only "${BEFORE}" "${AFTER}" | grep -E '^(package(-lock)?\.json)$' >/dev/null; then
  npm ci --omit=dev || npm install --production
else
  echo "  No dependency changes — skipping npm install."
fi

echo "[3/4] Restarting PM2 process"
pm2 reload "${APP_NAME}" --update-env

echo "[4/4] Verifying"
sleep 2
pm2 describe "${APP_NAME}" | grep -E "status|uptime" || true
echo ""
echo "Done. Tail logs with:  pm2 logs ${APP_NAME}"
