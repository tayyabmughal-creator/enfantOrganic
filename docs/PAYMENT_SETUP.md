# Payment Setup Guide (GCC + Oman)

This project uses a provider-router architecture so payment providers can be enabled per region without breaking checkout when a provider is not configured.

## 1) Architecture Summary

Backend service layer:

- Router: `backend/store/services/payment_router.py`
- Providers:
  - Paymob: `backend/store/services/paymob.py`
  - PayTabs: `backend/store/services/paytabs.py`
  - Thawani scaffold: `backend/store/services/thawani.py`
  - OmanNet scaffold: `backend/store/services/omannet.py`
  - HyperPay/Telr placeholders through router stubs

API endpoints:

- Initiate: `POST /api/payments/initiate/`
- Retry: `POST /api/payments/retry/`
- Status: `GET /api/payments/status/<order_number>/`
- Webhooks:
  - Paymob: `POST /api/payments/webhook/`
  - PayTabs: `POST /api/payments/webhook/paytabs/`
  - Thawani: `POST /api/payments/webhook/thawani/`
  - OmanNet: `POST /api/payments/webhook/omannet/`

## 2) Region Configuration (Admin)

Per region, set these fields (via admin region API/UI):

- `payment_enabled_providers` (JSON list)
- `default_payment_provider`
- `payment_supported_methods` (JSON)
- `payment_mode` (`sandbox` or `live`)

Recommended base config:

- Oman (`om`): `["paytabs","paymob","thawani","omannet"]`
- UAE (`ae`): `["paytabs","paymob"]`
- KSA (`sa`): `["paytabs","paymob"]`

Example `payment_supported_methods`:

```json
{
  "badges": {
    "visa": true,
    "mastercard": true,
    "mada": true,
    "apple_pay": false,
    "google_pay": false
  },
  "wallets": ["apple_pay", "google_pay"],
  "local": ["mada"],
  "paytabs_payment_methods": ["creditcard", "mada", "applepay"]
}
```

Notes:

- Checkout only shows providers that are both enabled and configured.
- Misconfigured providers return controlled API errors (no checkout 500).

## 3) Paymob Setup

Required environment variables:

- `PAYMOB_API_KEY`
- `PAYMOB_INTEGRATION_ID`
- `PAYMOB_IFRAME_ID`
- `PAYMOB_HMAC_SECRET`
- Optional: `PAYMOB_CURRENCY`, `PAYMOB_BASE_URL`

Webhook:

- URL: `https://<your-domain>/api/payments/webhook/`
- Verification: HMAC signature validation in backend

Operational behavior:

- Existing Paymob flow is backward compatible with old frontend initiation expectations.

## 4) PayTabs Setup (Primary GCC Gateway)

Required environment variables (region-specific recommended):

- `PAYTABS_PROFILE_ID_OM`, `PAYTABS_SERVER_KEY_OM`, `PAYTABS_REGION_OM`
- `PAYTABS_PROFILE_ID_AE`, `PAYTABS_SERVER_KEY_AE`, `PAYTABS_REGION_AE`
- `PAYTABS_PROFILE_ID_SA`, `PAYTABS_SERVER_KEY_SA`, `PAYTABS_REGION_SA`
- `PAYTABS_RETURN_BASE_URL`
- `PAYTABS_CALLBACK_BASE_URL`

Optional global fallback:

- `PAYTABS_PROFILE_ID`, `PAYTABS_SERVER_KEY`, `PAYTABS_CLIENT_KEY`, `PAYTABS_BASE_URL`

Webhook:

- URL: `https://<your-domain>/api/payments/webhook/paytabs/`
- Verification in code:
  - Request signature (`Signature` header, HMAC-SHA256 with region server key)
  - Transaction query validation by `tran_ref`
  - Cart/order reference match
  - Idempotent duplicate handling

Required public routes for redirect flow:

- `/<locale>/payment/success?region=<region>&order_number=<order>`
- `/<locale>/payment/failed?...`
- `/<locale>/payment/pending?...`

## 5) Apple Pay / Google Pay / Mada

Code support is implemented, but live availability depends on provider-side approvals.

### Apple Pay

- Requires PayTabs merchant profile activation and Apple onboarding requirements.
- Only enable UI badges/method hints when provider confirms activation.

### Google Pay

- Requires PayTabs/acquirer support for your merchant profile.
- Keep badge disabled until provider confirms.

### Mada (KSA)

- Requires KSA merchant profile with Mada enabled in gateway/acquirer.
- Usually shown only for KSA (`sa`) region when enabled.

Important:

- Do not mark Apple Pay, Google Pay, or Mada as live in production until real transactions are validated with approved credentials.

## 6) Thawani and OmanNet (Oman-friendly scaffolding)

### Thawani

Configured adapter with safe disabled behavior when real API mode is off.

Variables:

- `THAWANI_PUBLISHABLE_KEY`
- `THAWANI_SECRET_KEY`
- `THAWANI_BASE_URL`
- `THAWANI_WEBHOOK_SECRET` (recommended)
- `THAWANI_ENABLE_REAL_API` (`0`/`1`)
- `THAWANI_CREATE_SESSION_PATH`

Webhook URL:

- `https://<your-domain>/api/payments/webhook/thawani/`

### OmanNet

Adapter scaffold is implemented with signature verification structure and safe placeholder status/refund/initiate responses until final acquiring contract/API mapping is available.

Variables:

- `OMANNET_MERCHANT_ID`
- `OMANNET_ACCESS_CODE`
- `OMANNET_SHA_REQUEST`
- `OMANNET_SHA_RESPONSE` (reserved/future)
- `OMANNET_BASE_URL`
- `OMANNET_WEBHOOK_SECRET` (recommended)

Webhook URL:

- `https://<your-domain>/api/payments/webhook/omannet/`

## 7) Sandbox-to-Live Checklist

1. Add credentials to `.env.production` (never commit secrets).
2. Confirm region provider settings in admin.
3. Confirm callback URLs are publicly reachable.
4. Run one successful and one failed sandbox transaction per region.
5. Verify:
   - order payment status updates correctly
   - transaction reference saved on `PaymentTransaction`
   - duplicate webhook does not duplicate updates
   - forged webhook signatures are rejected
6. Enable live mode only after provider confirmation.

## 8) Third-Party Requirements to Collect

- Merchant account credentials per provider/region.
- Webhook signing/secret details from each provider.
- Approval status for Apple Pay, Google Pay, Mada.
- Acquirer contract API docs for OmanNet before real integration mode.

Without these approvals/credentials, code remains safely operational with provider disabled states and no server crash behavior.
