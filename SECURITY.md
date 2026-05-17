# Security Hardening Guide

This repository powers Enfant Organic storefront + admin APIs. Use this guide as the minimum production baseline.

## 1) Production Django Security Baseline

Set these environment variables in production:

- `DJANGO_DEBUG=0`
- `DJANGO_ALLOWED_HOSTS=<public domains>`
- `DJANGO_CORS_ALLOWED_ORIGINS=https://<public frontend domains>`
- `DJANGO_CSRF_TRUSTED_ORIGINS=https://<public frontend domains>`
- `DJANGO_SECURE_SSL_REDIRECT=1`
- `DJANGO_SESSION_COOKIE_SECURE=1`
- `DJANGO_CSRF_COOKIE_SECURE=1`
- `DJANGO_SESSION_COOKIE_HTTPONLY=1`
- `DJANGO_CSRF_COOKIE_HTTPONLY=1`
- `DJANGO_SECURE_CONTENT_TYPE_NOSNIFF=1`
- `DJANGO_X_FRAME_OPTIONS=DENY`
- `DJANGO_SECURE_REFERRER_POLICY=strict-origin-when-cross-origin`
- `DJANGO_SECURE_HSTS_SECONDS=31536000`
- `DJANGO_SECURE_HSTS_INCLUDE_SUBDOMAINS=1`
- `DJANGO_SECURE_HSTS_PRELOAD=1`

## 2) API Rate Limiting

Configured DRF scoped throttles:

- `auth` scope: JWT + auth endpoints
- `checkout` scope: checkout creation + coupon preview
- `payment` scope: payment initiate/retry/status
- `order_lookup` scope: guest order lookup and track-order detail

Tunable env vars:

- `DRF_AUTH_RATE` (default `20/min`)
- `DRF_CHECKOUT_RATE` (default `30/hour`)
- `DRF_PAYMENT_RATE` (default `60/hour`)
- `DRF_ORDER_LOOKUP_RATE` (default `10/hour`)

## 3) Admin API Access Control

- Admin endpoints require authenticated staff users.
- Granular capability checks are enforced via role/capability permissions (Owner, Manager, Finance, etc.).
- Unauthorized admin requests return HTTP `403`.

## 4) Webhook Signature Verification

All payment/webhook handlers are designed to reject forged payloads:

- Paymob: HMAC verification (`PAYMOB_HMAC_SECRET`)
- PayTabs: `Signature` verification + provider query verification
- Thawani: HMAC verification when `THAWANI_WEBHOOK_SECRET` is configured
- OmanNet: HMAC verification when `OMANNET_WEBHOOK_SECRET` is configured
- WhatsApp Cloud: verify token challenge + optional `X-Hub-Signature-256` verification when `WHATSAPP_APP_SECRET` is configured

## 5) Secret Management

- Set `REVALIDATION_SECRET` in production for Next.js cache revalidation (`/api/revalidate` and Celery `trigger_frontend_revalidate_async`). There is no insecure default in production builds.
- Never commit real credentials or tokens.
- Keep secrets only in runtime env files on server/VPS.
- Rotate any credential immediately if exposed.
- Ensure `.env`, database files, and media uploads remain ignored by git.

## 6) Deployment Validation

Run before release:

```bash
python3 backend/manage.py check --deploy
python3 backend/manage.py test backend/store/tests/test_checkout_and_perms.py
```

`check --deploy` warnings must be reviewed and addressed for the production environment values in use.

## 7) Incident Response

If abuse/suspicious traffic is detected:

1. Rotate affected keys/secrets.
2. Revoke compromised sessions/tokens.
3. Raise rate limits only temporarily for trusted systems; tighten again after incident.
4. Export logs (webhook requests, payment logs, audit logs) for post-incident review.
