# Environment Variables Reference

This is the full environment variable catalog for ENFANT ORGANIC.

Guidelines:

- Do not commit real secret values.
- Use `.env.production` on servers and keep it outside git.
- `Required` means:
  - `Yes`: required for normal production runtime
  - `Conditional`: required only when the related module/provider is enabled
  - `Optional`: safe default exists

Owner labels:

- `DevOps`: hosting/deployment engineer
- `Backend`: backend engineering
- `Frontend`: frontend engineering
- `Merchant/Ops`: business owner or operations team
- `Provider`: third-party account owner (payment/SMS/WhatsApp/carrier)
- `Marketing`: analytics/marketing owner

---

## 1) Core App, Security, and Runtime

| Variable | Required | Example | Where used | Who provides it |
|---|---|---|---|---|
| `COMPOSE_PROJECT_NAME` | Optional | `enfhantorganic` | `docker-compose*.yml`, deploy workflow | DevOps |
| `HTTP_PORT` | Optional | `80` | `docker-compose.prod.yml` | DevOps |
| `DJANGO_SECRET_KEY` | Yes | `replace-with-long-random` | `backend/enfant_backend/settings.py` | DevOps |
| `DJANGO_DEBUG` | Yes | `0` | `backend/enfant_backend/settings.py` | DevOps |
| `DJANGO_ALLOWED_HOSTS` | Yes | `enfantorganic.itwing.cloud,www.enfantorganic.itwing.cloud` | `backend/enfant_backend/settings.py` | DevOps |
| `DJANGO_CORS_ALLOWED_ORIGINS` | Yes | `https://enfantorganic.itwing.cloud` | `backend/enfant_backend/settings.py` | DevOps |
| `DJANGO_CSRF_TRUSTED_ORIGINS` | Yes | `https://enfantorganic.itwing.cloud` | `backend/enfant_backend/settings.py` | DevOps |
| `DJANGO_SECURE_SSL_REDIRECT` | Yes | `1` | `backend/enfant_backend/settings.py` | DevOps |
| `DJANGO_SESSION_COOKIE_SECURE` | Yes | `1` | `backend/enfant_backend/settings.py` | DevOps |
| `DJANGO_CSRF_COOKIE_SECURE` | Yes | `1` | `backend/enfant_backend/settings.py` | DevOps |
| `DJANGO_SESSION_COOKIE_HTTPONLY` | Yes | `1` | `backend/enfant_backend/settings.py` | DevOps |
| `DJANGO_CSRF_COOKIE_HTTPONLY` | Yes | `1` | `backend/enfant_backend/settings.py` | DevOps |
| `DJANGO_SESSION_COOKIE_SAMESITE` | Yes | `Lax` | `backend/enfant_backend/settings.py` | DevOps |
| `DJANGO_CSRF_COOKIE_SAMESITE` | Yes | `Lax` | `backend/enfant_backend/settings.py` | DevOps |
| `DJANGO_SECURE_CONTENT_TYPE_NOSNIFF` | Yes | `1` | `backend/enfant_backend/settings.py` | DevOps |
| `DJANGO_SECURE_REFERRER_POLICY` | Yes | `strict-origin-when-cross-origin` | `backend/enfant_backend/settings.py` | DevOps |
| `DJANGO_X_FRAME_OPTIONS` | Yes | `DENY` | `backend/enfant_backend/settings.py` | DevOps |
| `DJANGO_SECURE_HSTS_SECONDS` | Yes | `31536000` | `backend/enfant_backend/settings.py` | DevOps |
| `DJANGO_SECURE_HSTS_INCLUDE_SUBDOMAINS` | Yes | `1` | `backend/enfant_backend/settings.py` | DevOps |
| `DJANGO_SECURE_HSTS_PRELOAD` | Yes | `1` | `backend/enfant_backend/settings.py` | DevOps |
| `API_VERSION` | Optional | `1.0.0` | `backend/enfant_backend/settings.py` | Backend |

## 2) Database

| Variable | Required | Example | Where used | Who provides it |
|---|---|---|---|---|
| `POSTGRES_DB` | Yes (prod) | `enfantorganic` | `backend/enfant_backend/settings.py`, compose | DevOps |
| `POSTGRES_USER` | Yes (prod) | `enfantorganic` | `backend/enfant_backend/settings.py`, compose | DevOps |
| `POSTGRES_PASSWORD` | Yes (prod) | `strong-password` | `backend/enfant_backend/settings.py`, compose | DevOps |
| `POSTGRES_HOST` | Yes (prod) | `db` | `backend/enfant_backend/settings.py`, compose | DevOps |
| `POSTGRES_PORT` | Optional | `5432` | `backend/enfant_backend/settings.py`, compose | DevOps |
| `POSTGRES_CONN_MAX_AGE` | Optional | `60` | `backend/enfant_backend/settings.py` | Backend/DevOps |

## 3) API Throttling and JWT

| Variable | Required | Example | Where used | Who provides it |
|---|---|---|---|---|
| `DRF_ANON_RATE` | Optional | `120/min` | `backend/enfant_backend/settings.py` | Backend |
| `DRF_USER_RATE` | Optional | `600/min` | `backend/enfant_backend/settings.py` | Backend |
| `DRF_AUTH_RATE` | Yes | `20/min` | `backend/enfant_backend/settings.py` | Backend |
| `DRF_CHECKOUT_RATE` | Yes | `30/hour` | `backend/enfant_backend/settings.py` | Backend |
| `DRF_PAYMENT_RATE` | Yes | `60/hour` | `backend/enfant_backend/settings.py` | Backend |
| `JWT_ACCESS_MINUTES` | Optional | `15` | `backend/enfant_backend/settings.py` | Backend |
| `JWT_REFRESH_DAYS` | Optional | `7` | `backend/enfant_backend/settings.py` | Backend |

## 4) Email

| Variable | Required | Example | Where used | Who provides it |
|---|---|---|---|---|
| `DEFAULT_FROM_EMAIL` | Yes | `no-reply@your-domain.com` | `backend/enfant_backend/settings.py` | DevOps/Ops |
| `EMAIL_BACKEND` | Yes | `django.core.mail.backends.smtp.EmailBackend` | `backend/enfant_backend/settings.py` | Backend/DevOps |
| `EMAIL_HOST` | Conditional | `smtp.mailgun.org` | `backend/enfant_backend/settings.py` | Provider/DevOps |
| `EMAIL_PORT` | Conditional | `587` | `backend/enfant_backend/settings.py` | Provider/DevOps |
| `EMAIL_HOST_USER` | Conditional | `postmaster@...` | `backend/enfant_backend/settings.py` | Provider/Ops |
| `EMAIL_HOST_PASSWORD` | Conditional | `app-password` | `backend/enfant_backend/settings.py` | Provider/Ops |
| `EMAIL_USE_TLS` | Conditional | `True` | `backend/enfant_backend/settings.py` | DevOps |

## 5) Frontend, URLs, and Public Keys

| Variable | Required | Example | Where used | Who provides it |
|---|---|---|---|---|
| `NEXT_PUBLIC_API_BASE_URL` | Yes | `https://enfantorganic.itwing.cloud/api` | frontend clients + build args | DevOps/Frontend |
| `API_INTERNAL_BASE_URL` | Yes (SSR/docker) | `http://backend:8000/api` | `frontend/lib/api.js`, compose | DevOps |
| `NEXT_PUBLIC_APP_URL` | Recommended | `https://enfantorganic.itwing.cloud` | `frontend/lib/seo.js` | DevOps/Frontend |
| `NEXT_PUBLIC_SITE_URL` | Optional fallback | `https://enfantorganic.itwing.cloud` | `frontend/lib/seo.js` | DevOps/Frontend |
| `NEXT_PUBLIC_WHATSAPP_PHONE` | Optional | `9665XXXXXXX` | storefront WhatsApp CTA | Merchant/Ops |
| `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` | Conditional | `AIza...` | checkout map picker | Provider/Frontend |
| `NEXT_PUBLIC_GTM_ID` | Conditional | `GTM-XXXXXXX` | analytics scripts | Marketing |
| `NEXT_PUBLIC_GA4_ID` | Optional | `G-XXXXXXXXXX` | analytics scripts | Marketing |
| `NEXT_PUBLIC_META_PIXEL_ID` | Optional | `1234567890` | analytics scripts | Marketing |
| `EXPO_PUBLIC_API_BASE_URL` | Conditional (mobile app) | `https://enfantorganic.itwing.cloud/api` | `admin-mobile/App.js` | DevOps/Mobile |
| `EXPO_PUSH_ENDPOINT` | Optional | `https://exp.host/--/api/v2/push/send` | `backend/enfant_backend/settings.py` | Backend |

## 6) Payments (Paymob, PayTabs, GCC Placeholders)

### Paymob

| Variable | Required | Example | Where used | Who provides it |
|---|---|---|---|---|
| `PAYMOB_API_KEY` | Conditional | `paymob-api-key` | `settings.py`, `services/paymob.py` | Provider/Ops |
| `PAYMOB_INTEGRATION_ID` | Conditional | `123456` | `settings.py`, `services/paymob.py` | Provider/Ops |
| `PAYMOB_IFRAME_ID` | Conditional | `987654` | `settings.py`, `services/paymob.py` | Provider/Ops |
| `PAYMOB_HMAC_SECRET` | Conditional | `hmac-secret` | `settings.py`, `services/paymob.py` | Provider/Ops |
| `PAYMOB_CURRENCY` | Optional | `SAR` | `settings.py`, `services/paymob.py` | Ops |
| `PAYMOB_BASE_URL` | Optional | `https://accept.paymob.com/api` | `settings.py`, `services/paymob.py` | Backend |

### PayTabs

| Variable | Required | Example | Where used | Who provides it |
|---|---|---|---|---|
| `PAYTABS_PROFILE_ID` | Optional fallback | `12345` | `settings.py`, `services/paytabs.py` | Provider/Ops |
| `PAYTABS_SERVER_KEY` | Optional fallback | `server-key` | `settings.py`, `services/paytabs.py` | Provider/Ops |
| `PAYTABS_CLIENT_KEY` | Optional | `client-key` | `settings.py` | Provider/Ops |
| `PAYTABS_BASE_URL` | Optional fallback | `https://secure.paytabs.sa` | `settings.py` | Backend |
| `PAYTABS_RETURN_BASE_URL` | Conditional | `https://enfantorganic.itwing.cloud` | `settings.py`, `services/paytabs.py` | DevOps |
| `PAYTABS_CALLBACK_BASE_URL` | Conditional | `https://enfantorganic.itwing.cloud` | `settings.py`, `services/paytabs.py` | DevOps |
| `PAYTABS_PROFILE_ID_OM` | Conditional | `om-profile-id` | `settings.py`, `services/paytabs.py` | Provider/Ops |
| `PAYTABS_SERVER_KEY_OM` | Conditional | `om-server-key` | `settings.py`, `services/paytabs.py` | Provider/Ops |
| `PAYTABS_REGION_OM` | Optional | `https://secure-oman.paytabs.com` | `settings.py`, `services/paytabs.py` | Backend |
| `PAYTABS_PROFILE_ID_AE` | Conditional | `ae-profile-id` | `settings.py`, `services/paytabs.py` | Provider/Ops |
| `PAYTABS_SERVER_KEY_AE` | Conditional | `ae-server-key` | `settings.py`, `services/paytabs.py` | Provider/Ops |
| `PAYTABS_REGION_AE` | Optional | `https://secure.paytabs.com` | `settings.py`, `services/paytabs.py` | Backend |
| `PAYTABS_PROFILE_ID_SA` | Conditional | `sa-profile-id` | `settings.py`, `services/paytabs.py` | Provider/Ops |
| `PAYTABS_SERVER_KEY_SA` | Conditional | `sa-server-key` | `settings.py`, `services/paytabs.py` | Provider/Ops |
| `PAYTABS_REGION_SA` | Optional | `https://secure.paytabs.sa` | `settings.py`, `services/paytabs.py` | Backend |

### HyperPay / Telr placeholders

| Variable | Required | Example | Where used | Who provides it |
|---|---|---|---|---|
| `HYPERPAY_ENTITY_ID` | Conditional | `entity-id` | `settings.py`, payment router placeholder | Provider/Ops |
| `HYPERPAY_ACCESS_TOKEN` | Conditional | `token` | `settings.py`, payment router placeholder | Provider/Ops |
| `HYPERPAY_BASE_URL` | Optional | `https://eu-prod.oppwa.com` | `settings.py` | Backend |
| `TELR_STORE_ID` | Conditional | `store-id` | `settings.py`, payment router placeholder | Provider/Ops |
| `TELR_AUTH_KEY` | Conditional | `auth-key` | `settings.py`, payment router placeholder | Provider/Ops |
| `TELR_BASE_URL` | Optional | `https://secure.telr.com` | `settings.py` | Backend |

### Thawani / OmanNet scaffolding

| Variable | Required | Example | Where used | Who provides it |
|---|---|---|---|---|
| `THAWANI_PUBLISHABLE_KEY` | Conditional | `pk_test...` | `settings.py`, `services/thawani.py` | Provider/Ops |
| `THAWANI_SECRET_KEY` | Conditional | `sk_test...` | `settings.py`, `services/thawani.py` | Provider/Ops |
| `THAWANI_BASE_URL` | Optional | `https://uatcheckout.thawani.om/api/v1` | `settings.py`, `services/thawani.py` | Backend |
| `THAWANI_WEBHOOK_SECRET` | Recommended | `webhook-secret` | `settings.py`, `services/thawani.py` | Provider/Ops |
| `THAWANI_ENABLE_REAL_API` | Conditional | `0` or `1` | `settings.py`, `services/thawani.py` | Backend/Ops |
| `THAWANI_CREATE_SESSION_PATH` | Optional | `/api/v1/checkout/session` | `settings.py`, `services/thawani.py` | Backend |
| `OMANNET_MERCHANT_ID` | Conditional | `merchant-id` | `settings.py`, `services/omannet.py` | Provider/Ops |
| `OMANNET_ACCESS_CODE` | Conditional | `access-code` | `settings.py`, `services/omannet.py` | Provider/Ops |
| `OMANNET_SHA_REQUEST` | Conditional | `sha-request` | `settings.py`, `services/omannet.py` | Provider/Ops |
| `OMANNET_SHA_RESPONSE` | Optional | `sha-response` | `settings.py`, `services/omannet.py` | Provider/Ops |
| `OMANNET_BASE_URL` | Conditional | `https://omanet.om` | `settings.py`, `services/omannet.py` | Provider/Ops |
| `OMANNET_WEBHOOK_SECRET` | Recommended | `webhook-secret` | `settings.py`, `services/omannet.py` | Provider/Ops |

## 7) Carriers and Shipping Integrations

### Aramex

| Variable | Required | Example | Where used | Who provides it |
|---|---|---|---|---|
| `ARAMEX_USERNAME` | Conditional | `api-user` | `settings.py`, carrier adapters | Provider/Logistics |
| `ARAMEX_PASSWORD` | Conditional | `api-pass` | `settings.py`, carrier adapters | Provider/Logistics |
| `ARAMEX_ACCOUNT_NUMBER` | Conditional | `123456` | `settings.py`, carrier adapters | Provider/Logistics |
| `ARAMEX_ACCOUNT_PIN` | Conditional | `pin` | `settings.py`, carrier adapters | Provider/Logistics |
| `ARAMEX_ACCOUNT_ENTITY` | Conditional | `RUH` | `settings.py`, carrier adapters | Provider/Logistics |
| `ARAMEX_ACCOUNT_COUNTRY_CODE` | Conditional | `SA` | `settings.py`, carrier adapters | Provider/Logistics |
| `ARAMEX_BASE_URL` | Optional | `https://ws.aramex.net` | `settings.py`, carrier adapters | Backend |
| `ARAMEX_ENABLE_REAL_API` | Conditional | `0` or `1` | `settings.py`, carrier adapters | Ops |
| `ARAMEX_TRACKING_BASE_URL` | Optional | `https://www.aramex.com/us/en/track/results` | `settings.py`, carrier adapters | Backend |

### SMSA / Fetchr

| Variable | Required | Example | Where used | Who provides it |
|---|---|---|---|---|
| `SMSA_API_KEY` | Conditional | `smsa-api-key` | `settings.py`, carrier adapters | Provider/Logistics |
| `SMSA_ACCOUNT_NUMBER` | Conditional | `account-number` | `settings.py`, carrier adapters | Provider/Logistics |
| `SMSA_BASE_URL` | Optional | `https://api.smsaexpress.com` | `settings.py`, carrier adapters | Backend |
| `SMSA_ENABLE_REAL_API` | Conditional | `0` or `1` | `settings.py`, carrier adapters | Ops |
| `SMSA_TRACKING_BASE_URL` | Optional | `https://www.smsaexpress.com/trackingdetails` | `settings.py`, carrier adapters | Backend |
| `FETCHR_API_KEY` | Conditional | `fetchr-key` | `settings.py`, carrier adapters | Provider/Logistics |
| `FETCHR_BASE_URL` | Optional | `https://api.fetchr.us` | `settings.py`, carrier adapters | Backend |

## 8) SMS Configuration

| Variable | Required | Example | Where used | Who provides it |
|---|---|---|---|---|
| `SMS_DEFAULT_PROVIDER` | Optional | `unifonic` | `settings.py`, `services/sms_router.py` | Backend/Ops |
| `SMS_ENABLE_MOCK` | Optional | `1` | `settings.py`, `services/sms_router.py` | Backend |
| `SMS_REQUEST_TIMEOUT` | Optional | `15` | `settings.py`, `services/sms_router.py` | Backend |
| `UNIFONIC_BASE_URL` | Optional | `https://el.cloud.unifonic.com/rest/SMS/messages` | `settings.py`, `services/sms_router.py` | Backend |
| `UNIFONIC_APP_SID` | Conditional | `app-sid` | `settings.py`, `services/sms_router.py` | Provider/Ops |
| `UNIFONIC_SENDER_ID` | Conditional | `ENFANT` | `settings.py`, `services/sms_router.py` | Provider/Ops |
| `UNIFONIC_AUTH_TOKEN` | Conditional | `auth-token` | `settings.py`, `services/sms_router.py` | Provider/Ops |
| `TWILIO_ACCOUNT_SID` | Conditional | `ACxxxxxxxx` | `settings.py`, `services/sms_router.py` | Provider/Ops |
| `TWILIO_AUTH_TOKEN` | Conditional | `twilio-token` | `settings.py`, `services/sms_router.py` | Provider/Ops |
| `TWILIO_FROM_NUMBER` | Conditional | `+12025550100` | `settings.py`, `services/sms_router.py` | Provider/Ops |
| `TWILIO_MESSAGING_SERVICE_SID` | Conditional | `MGxxxxxxxx` | `settings.py`, `services/sms_router.py` | Provider/Ops |
| `TWILIO_BASE_URL` | Optional | `https://api.twilio.com` | `settings.py`, `services/sms_router.py` | Backend |

## 9) WhatsApp Cloud API

| Variable | Required | Example | Where used | Who provides it |
|---|---|---|---|---|
| `WHATSAPP_PHONE_NUMBER_ID` | Conditional | `123456789012345` | `settings.py`, `services/whatsapp_cloud.py` | Provider/Ops |
| `WHATSAPP_ACCESS_TOKEN` | Conditional | `EAAB...` | `settings.py`, `services/whatsapp_cloud.py` | Provider/Ops |
| `WHATSAPP_VERIFY_TOKEN` | Conditional | `verify-token` | `settings.py`, `services/whatsapp_cloud.py` | Ops |
| `WHATSAPP_BUSINESS_ACCOUNT_ID` | Conditional | `123456789012345` | `settings.py`, `services/whatsapp_cloud.py` | Provider/Ops |
| `WHATSAPP_GRAPH_API_BASE_URL` | Optional | `https://graph.facebook.com/v21.0` | `settings.py`, `services/whatsapp_cloud.py` | Backend |
| `WHATSAPP_APP_SECRET` | Recommended | `meta-app-secret` | `settings.py`, `services/whatsapp_cloud.py` | Provider/Ops |
| `WHATSAPP_REQUEST_TIMEOUT` | Optional | `20` | `settings.py`, `services/whatsapp_cloud.py` | Backend |
| `WHATSAPP_TEMPLATE_ORDER_CONFIRMED` | Conditional | `order_confirmed_en` | `settings.py`, `services/whatsapp_cloud.py` | Ops/Marketing |
| `WHATSAPP_TEMPLATE_ORDER_SHIPPED` | Conditional | `order_shipped_en` | `settings.py`, `services/whatsapp_cloud.py` | Ops/Marketing |
| `WHATSAPP_TEMPLATE_ORDER_DELIVERED` | Conditional | `order_delivered_en` | `settings.py`, `services/whatsapp_cloud.py` | Ops/Marketing |
| `WHATSAPP_TEMPLATE_REFUND_PROCESSED` | Conditional | `refund_processed_en` | `settings.py`, `services/whatsapp_cloud.py` | Ops/Marketing |

## 10) Backup and Restore

| Variable | Required | Example | Where used | Who provides it |
|---|---|---|---|---|
| `BACKUP_DESTINATION` | Yes | `/home/deploy/enfhantOrganic/backups` | `scripts/backup_now.sh` | DevOps |
| `BACKUP_ENCRYPTION_KEY` | Recommended | `strong-passphrase` | `scripts/backup_now.sh`, `scripts/restore_backup.sh` | DevOps/Security |
| `S3_BUCKET` | Conditional | `enfantorganic-backups` | `scripts/backup_now.sh` | DevOps |
| `S3_ACCESS_KEY` | Conditional | `AKIA...` | `scripts/backup_now.sh` | DevOps |
| `S3_SECRET_KEY` | Conditional | `secret` | `scripts/backup_now.sh` | DevOps |
| `S3_ENDPOINT` | Optional | `https://s3.me-central-1.amazonaws.com` | `scripts/backup_now.sh` | DevOps |
| `S3_REGION` | Optional | `me-central-1` | `scripts/backup_now.sh` | DevOps |
| `S3_PREFIX` | Optional | `enfantorganic/backups` | `scripts/backup_now.sh` | DevOps |

## 11) Script-Level Runtime Overrides

Used for maintenance scripts and not normally persisted in app config:

| Variable | Required | Example | Where used | Who provides it |
|---|---|---|---|---|
| `ENV_FILE` | Optional | `.env.production` | backup/restore scripts | DevOps |
| `COMPOSE_FILE` | Optional | `docker-compose.prod.yml` | backup/restore scripts | DevOps |
| `AWS_ACCESS_KEY_ID` | Optional fallback | `AKIA...` | `scripts/backup_now.sh` (AWS CLI fallback) | DevOps |
| `AWS_SECRET_ACCESS_KEY` | Optional fallback | `secret` | `scripts/backup_now.sh` (AWS CLI fallback) | DevOps |
| `AWS_DEFAULT_REGION` | Optional fallback | `me-central-1` | `scripts/backup_now.sh` (AWS CLI fallback) | DevOps |

---

## 12) Third-Party Provisioning Checklist

Before go-live, confirm ownership and credential handover for:

1. Payment gateways: Paymob, PayTabs (plus Apple Pay / Google Pay / Mada profile-side enablement), Thawani/OmanNet if used.
2. Shipping carriers: Aramex/SMSA/Fetchr credentials and contracts.
3. Messaging: SMTP, Unifonic/Twilio, WhatsApp Cloud API.
4. Maps and analytics: Google Maps API key, GTM/GA4/Meta IDs.
5. Backup destination: local path permissions and optional S3 bucket policy.

Keep credential rotation history in operations records, not in git.
