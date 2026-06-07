#!/usr/bin/env bash
#
# deploy-production.sh — safe, validated production deploy for Enfhant Organic.
#
# Always deploy with this script (or at least with the exact compose command it
# uses). It:
#   1. validates .env.production (aborts on a wrong/typo domain, missing
#      secrets, etc.) BEFORE touching the running stack;
#   2. builds & starts the stack with the REQUIRED --env-file flag;
#   3. verifies DJANGO_ALLOWED_HOSTS actually reached the backend container;
#   4. runs public API smoke tests so a broken region/checkout flow is caught
#      immediately instead of being discovered by a customer.
#
# Usage:  bash scripts/deploy-production.sh
#
set -euo pipefail

# Run from the repo root (where docker-compose.prod.yml lives), regardless of
# the caller's working directory.
cd "$(dirname "$0")/.."

DOMAIN="${EXPECTED_DOMAIN:-enfhantorganic.itwing.cloud}"
COMPOSE_FILE="docker-compose.prod.yml"
ENV_FILE=".env.production"

# The one true compose invocation. NEVER drop --env-file: without it Compose
# misses interpolation vars (REDIS_PASSWORD, NEXT_PUBLIC_API_BASE_URL, ...) and
# Redis/backend can fail to start.
COMPOSE=(docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE")

echo "==> [1/4] Validating ${ENV_FILE}"
EXPECTED_DOMAIN="$DOMAIN" bash scripts/validate-production-env.sh "$ENV_FILE"

echo
echo "==> [2/4] Building & starting the stack"
"${COMPOSE[@]}" up -d --build --remove-orphans
"${COMPOSE[@]}" ps

echo
echo "==> [3/4] Verifying DJANGO_ALLOWED_HOSTS inside the backend container"
if "${COMPOSE[@]}" exec -T backend printenv DJANGO_ALLOWED_HOSTS | grep -Fq "$DOMAIN"; then
  printf '  \033[32mPASS\033[0m  backend DJANGO_ALLOWED_HOSTS contains %s\n' "$DOMAIN"
else
  printf '  \033[31mFAIL\033[0m  backend DJANGO_ALLOWED_HOSTS is missing %s\n' "$DOMAIN"
  echo "==> Deploy verification FAILED."
  exit 1
fi

echo
echo "==> [4/5] Importing client catalog media if source files are present"
if [ -f "products_export_1.csv" ] && [ -d "Images" ]; then
  "${COMPOSE[@]}" exec -T backend \
    python manage.py import_client_catalog \
      --products-csv /import-data/products_export_1.csv \
      --images-dir /import-data/Images
  printf '  \033[32mPASS\033[0m  catalog import completed\n'
else
  printf '  \033[33mWARN\033[0m  products_export_1.csv or Images/ missing; skipped catalog import\n'
fi

echo
echo "==> [5/5] Public API smoke tests (expect: 200 application/json)"
smoke_fail=0
smoke() {
  local url="$1" result code ctype
  result="$(curl -sS -o /dev/null -w '%{http_code} %{content_type}' --max-time 25 "$url" 2>/dev/null || echo '000 none')"
  code="${result%% *}"
  ctype="${result#* }"
  if [ "$code" = "200" ] && printf '%s' "$ctype" | grep -q 'application/json'; then
    printf '  \033[32mPASS\033[0m  %s -> %s\n' "$url" "$result"
  else
    printf '  \033[31mFAIL\033[0m  %s -> %s\n' "$url" "$result"
    smoke_fail=1
  fi
}
smoke "https://${DOMAIN}/api/navigation/"
smoke "https://${DOMAIN}/api/products/"
smoke "https://${DOMAIN}/api/products/?region=sa"
smoke "https://${DOMAIN}/api/products/?region=ae"

echo
if [ "$smoke_fail" -ne 0 ]; then
  echo "==> Smoke tests FAILED — the deploy is up but the public API is not"
  echo "    returning JSON. Check DJANGO_ALLOWED_HOSTS / nginx before announcing."
  exit 1
fi
echo "==> Deploy verified OK ✅"
