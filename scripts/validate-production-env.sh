#!/usr/bin/env bash
#
# validate-production-env.sh — pre-deploy guard for .env.production
#
# Fails (exit 1) if the production environment is misconfigured in ways that
# have previously broken the live site (wrong/typo domain in ALLOWED_HOSTS,
# missing Redis password, missing Paymob credentials, etc.). Run this BEFORE
# `docker compose ... up` so a bad env aborts the deploy instead of silently
# shipping a broken checkout / region-conversion flow.
#
# SECURITY: this script only ever prints whether a variable is PRESENT — never
# its value. Public, non-secret facts (the expected domain, the Paymob base
# URL) are printed because they are not secrets.
#
# Usage:  bash scripts/validate-production-env.sh [path-to-env-file]
#         VALIDATE_SKIP_PAYMOB=1 bash scripts/validate-production-env.sh   # skip Paymob block
#
set -euo pipefail

ENV_FILE="${1:-.env.production}"

# ── Known-good values for this deployment ──────────────────────────────────
DOMAIN="enfhantorganic.itwing.cloud"             # correct spelling (note the 'h')
TYPO_DOMAIN="enfantorganic.itwing.cloud"          # common typo — missing the 'h'
CSRF_ORIGIN="https://enfhantorganic.itwing.cloud"
PAYMOB_BASE_URL_EXPECTED="https://oman.paymob.com/api"

fail=0
pass() { printf '  \033[32mPASS\033[0m  %s\n' "$1"; }
bad()  { printf '  \033[31mFAIL\033[0m  %s\n' "$1"; fail=1; }

# Read one variable's value from the env file WITHOUT sourcing it (never execute
# file contents) and WITHOUT printing the value. Last assignment wins.
getval() {
  grep -E "^[[:space:]]*${1}=" "$ENV_FILE" 2>/dev/null | tail -n1 \
    | sed -E "s/^[[:space:]]*${1}=//; s/^[\"']//; s/[\"']\$//; s/\r\$//" || true
}

# Assert a variable is present (non-empty) — prints presence only, not value.
require_present() {
  local key="$1"
  if [ -n "$(getval "$key")" ]; then
    pass "$key is set"
  else
    bad "$key is empty or missing"
  fi
}

echo "==> Validating ${ENV_FILE}"

if [ ! -f "$ENV_FILE" ]; then
  bad "${ENV_FILE} does not exist"
  echo "Validation FAILED."
  exit 1
fi

# ── DJANGO_ALLOWED_HOSTS ────────────────────────────────────────────────────
allowed_hosts="$(getval DJANGO_ALLOWED_HOSTS)"
if [ -z "$allowed_hosts" ]; then
  bad "DJANGO_ALLOWED_HOSTS is empty or missing"
else
  if printf '%s' "$allowed_hosts" | grep -Fq "$DOMAIN"; then
    pass "DJANGO_ALLOWED_HOSTS contains ${DOMAIN}"
  else
    bad "DJANGO_ALLOWED_HOSTS is missing ${DOMAIN}"
  fi
  if printf '%s' "$allowed_hosts" | grep -Fq "$TYPO_DOMAIN"; then
    bad "DJANGO_ALLOWED_HOSTS contains the TYPO domain ${TYPO_DOMAIN} (missing the 'h')"
  else
    pass "DJANGO_ALLOWED_HOSTS has no typo domain"
  fi
fi

# ── DJANGO_CSRF_TRUSTED_ORIGINS ─────────────────────────────────────────────
csrf="$(getval DJANGO_CSRF_TRUSTED_ORIGINS)"
if printf '%s' "$csrf" | grep -Fq "$CSRF_ORIGIN"; then
  pass "DJANGO_CSRF_TRUSTED_ORIGINS contains ${CSRF_ORIGIN}"
else
  bad "DJANGO_CSRF_TRUSTED_ORIGINS is missing ${CSRF_ORIGIN}"
fi

# ── Infra secrets (presence only) ───────────────────────────────────────────
require_present REDIS_PASSWORD
require_present NEXT_PUBLIC_API_BASE_URL

# NEXT_PUBLIC_API_BASE_URL should not point at the typo domain either.
next_api="$(getval NEXT_PUBLIC_API_BASE_URL)"
if [ -n "$next_api" ] && printf '%s' "$next_api" | grep -Fq "$TYPO_DOMAIN"; then
  bad "NEXT_PUBLIC_API_BASE_URL contains the TYPO domain ${TYPO_DOMAIN}"
fi

# ── Paymob (Oman test setup) ────────────────────────────────────────────────
if [ "${VALIDATE_SKIP_PAYMOB:-0}" = "1" ]; then
  echo "  (skipping Paymob checks: VALIDATE_SKIP_PAYMOB=1)"
else
  require_present PAYMOB_API_KEY
  require_present PAYMOB_INTEGRATION_ID
  require_present PAYMOB_IFRAME_ID
  require_present PAYMOB_HMAC_SECRET

  paymob_base="$(getval PAYMOB_BASE_URL)"
  if [ "$paymob_base" = "$PAYMOB_BASE_URL_EXPECTED" ]; then
    pass "PAYMOB_BASE_URL is ${PAYMOB_BASE_URL_EXPECTED}"
  else
    bad "PAYMOB_BASE_URL must be ${PAYMOB_BASE_URL_EXPECTED} for the Oman setup"
  fi
fi

echo
if [ "$fail" -ne 0 ]; then
  echo "==> Validation FAILED — fix .env.production before deploying."
  exit 1
fi
echo "==> Validation PASSED."
