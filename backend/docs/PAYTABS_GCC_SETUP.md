# PayTabs GCC Gateway Setup

This project supports PayTabs as the primary GCC online gateway with region-scoped credentials for Oman, UAE, and KSA.

## 1) Required Environment Variables

Set these in backend environment:

- `PAYTABS_PROFILE_ID_OM`
- `PAYTABS_SERVER_KEY_OM`
- `PAYTABS_PROFILE_ID_AE`
- `PAYTABS_SERVER_KEY_AE`
- `PAYTABS_PROFILE_ID_SA`
- `PAYTABS_SERVER_KEY_SA`
- `PAYTABS_REGION_OM` (example: `https://secure-oman.paytabs.com`)
- `PAYTABS_REGION_AE` (example: `https://secure.paytabs.com`)
- `PAYTABS_REGION_SA` (example: `https://secure.paytabs.sa`)
- `PAYTABS_RETURN_BASE_URL` (storefront host used for customer redirects)
- `PAYTABS_CALLBACK_BASE_URL` (backend/public host used by PayTabs callback)

## 2) Region Configuration

Each active region can define:

- `payment_enabled_providers` (JSON array)
- `default_payment_provider`
- `payment_supported_methods` (JSON; used for checkout badges and PayTabs method hints)
- `payment_mode` (`sandbox` / `live`)

Recommended GCC defaults:

- Oman: `["paytabs", "paymob", "thawani", "omannet"]`
- UAE: `["paytabs", "paymob"]`
- KSA: `["paytabs", "paymob"]`

## 3) Callback/Webhook Security

PayTabs callback verification is enforced using:

1. HMAC signature check on raw request body (`Signature` header, SHA-256 using region server key).
2. Transaction query validation (`/payment/query`) using `tran_ref`.
3. Cart/order reference match (`cart_id` vs local order number).

Forged callbacks are rejected with `invalid_signature`.
Duplicate callbacks are idempotent and return `already_processed`.

## 4) Apple Pay / Google Pay / Mada Activation Notes

The codebase can display these methods and pass configured PayTabs method hints, but activation depends on PayTabs merchant profile and acquirer approvals.

- `Mada` (KSA): requires profile-side enablement for eligible KSA merchant profile.
- `Apple Pay`: requires PayTabs + merchant profile enablement and Apple-domain onboarding requirements.
- `Google Pay`: requires profile-side support and eligible configuration from PayTabs/acquirer.

Do not mark these methods as live unless profile approval and real transaction validation are complete in the target region.

## 5) Go-Live Checklist

1. Confirm each region uses matching profile/server key and matching PayTabs region endpoint.
2. Switch `payment_mode` to `live` for production region configs.
3. Validate callback URL reachability from PayTabs.
4. Run sandbox transactions per region and verify:
   - order status update
   - transaction reference persistence
   - retry flow
   - invoice generation on paid orders
5. Validate method badges against actual profile-enabled methods before release.
