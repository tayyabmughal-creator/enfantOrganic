# Payment Provider Setup (GCC + Oman-Friendly)

This project uses a provider-router architecture for online payments.

## Supported Provider Keys

- `paymob`
- `paytabs`
- `thawani` (adapter scaffolded, can run in placeholder mode)
- `omannet` (adapter scaffolded placeholder)

## Region Configuration Fields

Each region can control:

- `payment_enabled_providers` (JSON list)
- `default_payment_provider`
- `payment_supported_methods` (JSON for badges/method hints)
- `payment_mode` (`sandbox` or `live`)

Admin/API returns provider capability warnings so teams can detect enabled-but-misconfigured providers quickly.

## Required Environment Variables

### Paymob

- `PAYMOB_API_KEY`
- `PAYMOB_INTEGRATION_ID`
- `PAYMOB_IFRAME_ID`
- `PAYMOB_HMAC_SECRET`

### PayTabs (region scoped)

- `PAYTABS_PROFILE_ID_OM`
- `PAYTABS_SERVER_KEY_OM`
- `PAYTABS_REGION_OM`
- `PAYTABS_PROFILE_ID_AE`
- `PAYTABS_SERVER_KEY_AE`
- `PAYTABS_REGION_AE`
- `PAYTABS_PROFILE_ID_SA`
- `PAYTABS_SERVER_KEY_SA`
- `PAYTABS_REGION_SA`
- `PAYTABS_RETURN_BASE_URL`
- `PAYTABS_CALLBACK_BASE_URL`

### Thawani (scaffold)

- `THAWANI_PUBLISHABLE_KEY`
- `THAWANI_SECRET_KEY`
- `THAWANI_BASE_URL`
- `THAWANI_WEBHOOK_SECRET` (optional but recommended)
- `THAWANI_ENABLE_REAL_API` (`0`/`1`)
- `THAWANI_CREATE_SESSION_PATH` (default: `/api/v1/checkout/session`)

When `THAWANI_ENABLE_REAL_API=0`, initiation/refund/status stay in controlled placeholder mode and return safe service errors.

### OmanNet (scaffold placeholder)

- `OMANNET_MERCHANT_ID`
- `OMANNET_ACCESS_CODE`
- `OMANNET_SHA_REQUEST`
- `OMANNET_SHA_RESPONSE` (optional now, reserved for contract flow)
- `OMANNET_BASE_URL`
- `OMANNET_WEBHOOK_SECRET` (optional verification hook)

OmanNet direct request/response mapping depends on acquiring bank contract docs. Until those details are finalized, adapter methods return safe placeholder responses.

## Webhook Notes

- Paymob: HMAC verification via existing Paymob flow.
- PayTabs: signature + query verification already enforced.
- Thawani/OmanNet: verification structure is present (signature hooks), but exact production signature contracts must match provider documentation.

## Expected Behavior

- Checkout only surfaces online providers that are both enabled and configured for the selected region.
- Enabled but missing credentials providers produce warnings in region admin payloads and Django admin list display.
- Payment initiation on misconfigured providers returns controlled non-500 error responses.
