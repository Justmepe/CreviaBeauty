#!/usr/bin/env bash
#
# CreviaBeauty — first-install deploy for a shared VPS.
#
# Designed to coexist with other apps already running on the same box:
#   - does NOT remove nginx's default site or any other site
#   - does NOT force-enable ufw (we won't lock you out)
#   - does NOT regenerate the .env if one already exists
#   - creates a Postgres user/db only if missing
#   - uses a unique PM2 process name and unique nginx site name
#
# Run as root on the VPS, from /var/www/creviabeauty (after `git clone`).
#
# Tweak the variables below before running.

set -euo pipefail

# ============ CONFIGURATION ============
APP_NAME="creviabeauty"               # PM2 process + nginx site name
APP_DIR="/var/www/${APP_NAME}"
APP_PORT="${APP_PORT:-3001}"          # change if 3001 is taken on the VPS
DB_NAME="creviabeauty"                # dedicated DB for this app
DB_USER="creviabeauty_user"           # dedicated user — does NOT collide with other apps
DOMAIN="${DOMAIN:-creviabeauty.com}"
SKIP_NGINX="${SKIP_NGINX:-0}"         # set to 1 if nginx is managed elsewhere (e.g. CloudPanel)

cd "${APP_DIR}"

if [[ ! -f package.json ]]; then
  echo "ERROR: package.json not found in ${APP_DIR}. Clone the repo here first."
  exit 1
fi

echo "[1/6] Ensuring Node.js, PM2, nginx, postgresql-client are present"
command -v node    >/dev/null || { curl -fsSL https://deb.nodesource.com/setup_20.x | bash -; apt-get install -y nodejs; }
command -v pm2     >/dev/null || npm install -g pm2
command -v nginx   >/dev/null || apt-get install -y nginx
command -v psql    >/dev/null || apt-get install -y postgresql-client

echo "[2/6] Ensuring Postgres database '${DB_NAME}' and user '${DB_USER}' exist"
if ! sudo -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='${DB_USER}'" | grep -q 1; then
  DB_PASSWORD="$(openssl rand -base64 32 | tr -dc 'a-zA-Z0-9' | head -c 24)"
  sudo -u postgres psql <<SQL
CREATE USER ${DB_USER} WITH PASSWORD '${DB_PASSWORD}';
CREATE DATABASE ${DB_NAME} OWNER ${DB_USER};
GRANT ALL PRIVILEGES ON DATABASE ${DB_NAME} TO ${DB_USER};
SQL
  echo "  Created user '${DB_USER}'. Password: ${DB_PASSWORD}"
  echo "  Save this — it's also written into .env below."
else
  DB_PASSWORD=""
  echo "  User '${DB_USER}' already exists. Re-using existing credentials (you must already have a .env)."
fi

echo "[3/6] Writing .env if missing"
if [[ -f .env ]]; then
  echo "  .env exists — leaving it untouched."
else
  if [[ -z "${DB_PASSWORD}" ]]; then
    echo "ERROR: existing DB user but no .env. Create .env manually with the correct DB_PASSWORD."
    exit 1
  fi
  cat > .env <<ENV
NODE_ENV=production
PORT=${APP_PORT}
SESSION_SECRET=$(openssl rand -hex 32)
DATABASE_URL=postgresql://${DB_USER}:${DB_PASSWORD}@localhost:5432/${DB_NAME}
DB_HOST=localhost
DB_PORT=5432
DB_NAME=${DB_NAME}
DB_USER=${DB_USER}
DB_PASSWORD=${DB_PASSWORD}
UPLOAD_MAX_SIZE=5242880
COOKIE_SECURE=true
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_REQUESTS=100
AUTH_RATE_LIMIT_WINDOW_MS=900000
AUTH_RATE_LIMIT_MAX_REQUESTS=5
LOG_LEVEL=info
ENV
  chmod 600 .env
fi

echo "[4/6] Installing production dependencies"
npm ci --omit=dev || npm install --production
mkdir -p uploads && chmod 755 uploads

echo "[5/6] Installing nginx site (additive — does not touch other sites)"
if [[ "${SKIP_NGINX}" == "1" ]]; then
  echo "  SKIP_NGINX=1 — leaving nginx alone (e.g. CloudPanel will route to 127.0.0.1:${APP_PORT})."
else
NGINX_SITE="/etc/nginx/sites-available/${APP_NAME}"
if [[ ! -f "${NGINX_SITE}" ]]; then
  cat > "${NGINX_SITE}" <<NGINX
server {
    listen 80;
    server_name ${DOMAIN} www.${DOMAIN};

    client_max_body_size 10M;

    location / {
        proxy_pass http://127.0.0.1:${APP_PORT};
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
NGINX
  ln -sf "${NGINX_SITE}" "/etc/nginx/sites-enabled/${APP_NAME}"
  nginx -t && systemctl reload nginx
else
  echo "  nginx site '${APP_NAME}' already exists — leaving untouched."
fi
fi

echo "[6/6] Starting / reloading PM2 process '${APP_NAME}'"
# Delete any stale process entry first so we don't inherit a saved exec_mode (e.g. cluster) from a prior run.
pm2 delete "${APP_NAME}" >/dev/null 2>&1 || true
pm2 start ecosystem.config.js --only "${APP_NAME}"
pm2 save

echo ""
echo "=========================================="
echo "  CreviaBeauty deployed."
echo "=========================================="
echo "  App URL:  http://${DOMAIN}  (add HTTPS with certbot)"
echo "  PM2 name: ${APP_NAME}"
echo "  Port:     ${APP_PORT}"
echo ""
echo "  Next: install SSL"
echo "    apt install -y certbot python3-certbot-nginx"
echo "    certbot --nginx -d ${DOMAIN} -d www.${DOMAIN}"
