#!/usr/bin/env bash
# Run ONCE on VPS as root after DNS has propagated (all three subdomains resolve).
# Usage: sudo bash /home/deploy/scripts/setup-subdomain-ssl.sh
#
# What this does:
#   1. Adds om/ae/sa as temporary nginx server blocks so certbot can validate them
#   2. Expands the existing Let's Encrypt cert to cover all region subdomains
#   3. Installs the production nginx config from the repo
#   4. Reloads nginx (zero-downtime)

set -euo pipefail

DEPLOY_PATH="${1:-/home/deploy}"
NGINX_CONF="/etc/nginx/sites-available/enfantorganic"
TEMP_SITE="/etc/nginx/sites-available/enfantorganic-acme-tmp"
WEBROOT="/var/www/html"

# ── Pre-flight ───────────────────────────────────────────────────────────────
command -v certbot >/dev/null 2>&1 || { echo "ERROR: certbot not found. Install with: apt install certbot python3-certbot-nginx"; exit 1; }
[ -f "$NGINX_CONF" ] || { echo "ERROR: $NGINX_CONF not found."; exit 1; }
[ -d "${DEPLOY_PATH}/deploy/nginx" ] || { echo "ERROR: deploy path ${DEPLOY_PATH} missing."; exit 1; }

echo ""
echo "=== Enfant Organic — Region Subdomain SSL Setup ==="
echo ""

# ── Step 1: Temp nginx block for certbot ACME webroot challenge ──────────────
echo "[1/5] Adding temporary nginx block for ACME challenge..."
mkdir -p "$WEBROOT"
cat > "$TEMP_SITE" << 'EOF'
server {
    listen 80;
    server_name om.enfantorganic.com ae.enfantorganic.com sa.enfantorganic.com;
    location ^~ /.well-known/acme-challenge/ {
        root /var/www/html;
        default_type "text/plain";
    }
    location / { return 444; }
}
EOF
ln -sf "$TEMP_SITE" /etc/nginx/sites-enabled/enfantorganic-acme-tmp
nginx -t
nginx -s reload
echo "    Temp block active — nginx reloaded."

# ── Step 2: Backup existing config ──────────────────────────────────────────
echo "[2/5] Backing up current nginx config..."
BACKUP="${NGINX_CONF}.bak.$(date +%Y%m%d%H%M%S)"
cp "$NGINX_CONF" "$BACKUP"
echo "    Backup: $BACKUP"

# ── Step 3: Expand SSL cert ──────────────────────────────────────────────────
echo "[3/5] Expanding Let's Encrypt cert for region subdomains..."
certbot certonly --webroot \
  -w "$WEBROOT" \
  --non-interactive \
  --agree-tos \
  --expand \
  -d www.enfantorganic.com \
  -d app.enfantorganic.com \
  -d enfantorganic.com \
  -d om.enfantorganic.com \
  -d ae.enfantorganic.com \
  -d sa.enfantorganic.com
echo "    Cert expanded."

# ── Step 4: Remove temp block, install production nginx config ───────────────
echo "[4/5] Installing production nginx config..."
rm -f /etc/nginx/sites-enabled/enfantorganic-acme-tmp "$TEMP_SITE"
cp "${DEPLOY_PATH}/deploy/nginx/host-reverse-proxy.conf" "$NGINX_CONF"
nginx -t
echo "    Config OK."

# ── Step 5: Reload nginx ─────────────────────────────────────────────────────
echo "[5/5] Reloading nginx (zero-downtime)..."
nginx -s reload

echo ""
echo "=== Done! Verifying HTTPS on region subdomains ==="
sleep 3
for sub in om ae sa; do
  printf "  https://${sub}.enfantorganic.com/ → "
  curl -sIL --max-time 12 "https://${sub}.enfantorganic.com/" 2>/dev/null \
    | grep -E "^HTTP/" | tail -1 \
    || echo "TIMEOUT (check DNS propagation)"
done
echo ""
echo "Next steps:"
echo "  1. Update GitHub Secrets (see below) and push code to deploy."
echo "  2. GitHub Secrets to update:"
echo "     DJANGO_ALLOWED_HOSTS       → add: om.enfantorganic.com ae.enfantorganic.com sa.enfantorganic.com"
echo "     DJANGO_CORS_ALLOWED_ORIGINS → add: https://om.enfantorganic.com https://ae.enfantorganic.com https://sa.enfantorganic.com"
echo "     DJANGO_CSRF_TRUSTED_ORIGINS → add: https://om.enfantorganic.com https://ae.enfantorganic.com https://sa.enfantorganic.com"
