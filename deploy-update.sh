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

echo "[2b/4] Ensuring Chromium system libraries (for receipt PDF generation)"
# Puppeteer downloads its own Chromium via npm, but that binary needs these
# shared libs present on the host. Without them, receipt PDFs fail to render
# (the Discord notification still sends, just without the attachment).
if ! ldconfig -p 2>/dev/null | grep -q 'libnss3'; then
  ASOUND="libasound2"
  apt-cache show libasound2t64 >/dev/null 2>&1 && ASOUND="libasound2t64"
  apt-get update -y && apt-get install -y \
    ca-certificates fonts-liberation libatk-bridge2.0-0 libatk1.0-0 libc6 \
    libcairo2 libcups2 libdbus-1-3 libexpat1 libfontconfig1 libgbm1 \
    libglib2.0-0 libgtk-3-0 libnspr4 libnss3 libpango-1.0-0 libpangocairo-1.0-0 \
    libstdc++6 libx11-6 libx11-xcb1 libxcb1 libxcomposite1 libxcursor1 \
    libxdamage1 libxext6 libxfixes3 libxi6 libxrandr2 libxrender1 libxtst6 \
    "${ASOUND}" \
    || echo "  WARN: could not install all Chromium libs — PDF attachments may fail."
else
  echo "  Chromium libraries already present — skipping."
fi

echo "[3/4] Restarting PM2 process"
pm2 reload "${APP_NAME}" --update-env

echo "[4/4] Verifying"
sleep 2
pm2 describe "${APP_NAME}" | grep -E "status|uptime" || true
echo ""
echo "Done. Tail logs with:  pm2 logs ${APP_NAME}"
