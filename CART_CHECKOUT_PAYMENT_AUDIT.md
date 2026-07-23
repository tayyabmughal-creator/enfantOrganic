# Enfant Organic — Cart, Checkout, and Payment Audit

Audit date: 2026-07-23

Safety: source tracing, aggregate database queries, redacted logs, and a non-interactive mobile page inspection only; no cart mutation, order creation, or payment attempt

## Executive finding

A platform-wide add-to-cart code failure is **not confirmed**. Guest add-to-cart is an immediate browser-local state operation, not an API call, and live mobile product buttons were present. The more serious confirmed defect is downstream: UAE Paymob Unified Checkout initiation currently returns provider HTTP 404. The first-party funnel also records a large decline before checkout, but present instrumentation cannot tell whether this is UI friction, traffic quality, browser/storage behavior, or missing events.

## End-to-end flow

```text
Product button
  → StoreProvider.addItem()
  → React cart state + localStorage guest cart
  → fly-to-cart + browser pixels + fire-and-forget first-party event
  → cart page reprices products from API
  → checkout validates address/currency/coupon
  → POST /api/checkout/ creates order
  → POST /api/payments/initiate/ for online payment
  → provider hosted page
  → signed webhook
  → transaction/order update, inventory commit, cart recovery, invoice task
```

## Add-to-cart findings

### CONFIRMED — guest cart is client-local

- `frontend/components/store/StoreProvider.jsx` stores guest cart under `enfant-organics-cart` in localStorage.
- `addItem` updates local state synchronously. It does not call a cart backend or write the database.
- Product pricing is refreshed later through multiple product API requests; a timestamp cache-buster is used for Safari.
- `ProductCard` calls `addItem` and the fly-to-cart animation immediately. Product-detail add uses the same provider.

This means the requested “cart API → backend validation → database persistence” chain does not exist for guest add-to-cart. Backend/CSRF/CORS failures cannot directly explain the initial click, although API/repricing failures can affect subsequent cart/checkout behavior.

### CONFIRMED — limited click-state protection and feedback

- The product-card button is disabled for out-of-stock state, not while an add is processing.
- There is no duplicate-click lock or spinner around the synchronous add.
- Feedback is primarily animation/cart-count change; there is no durable success message or accessible live-region confirmation in the traced handler.
- First-party tracking is fire-and-forget and silently discards fetch errors (`frontend/lib/eventTracking.js:202-227`).

These are UX and observability weaknesses, not proof that the click fails.

### SUSPECTED — mobile/localStorage and repricing edge cases

- Cart hydration depends on client mount and localStorage availability. Private browsing, storage clearing, cross-subdomain navigation, or browser restrictions can lose or delay a guest cart; no production exception telemetry exists to quantify this.
- Region changes trigger repricing across items. Checkout blocks while currency mismatches or repricing is in flight and asks the shopper to retry. Slow or failed product calls can therefore feel like checkout friction.
- Multiple cart item product fetches run concurrently with `Promise.all`, but a large cart can still create an API fan-out.
- No error telemetry links cart hydration/repricing failures to a session or release.

### Production evidence

- 48 products were published; all 48 had regional prices in AE, OM, and SA. In each region, 47 were inventory-eligible and one was not.
- No exact CSRF, CORS, or frontend `ECONNREFUSED`/`ETIMEDOUT` pattern established a cart outage in seven-day logs.
- A read-only mobile DOM inspection showed visible add-to-cart buttons on Oman product cards. A locator runtime error prevented a reliable enabled-state assertion. No button was clicked.
- Add-to-cart session rate nevertheless fell from 6.58% to 2.17% between equal periods. This validates a funnel problem, not a mechanical button defect.

### Unknown

- Authenticated cart behavior was not separately exercised; no test account was used.
- Safari/iOS, Android Chrome, low-memory devices, and slow-network interactions were not safely exercised end-to-end in production.
- No client exception service/session replay was available.
- Variant-selection failures were not observed in logs and were not mutated in production.

## Checkout findings

### CONFIRMED — checkout has explicit validation and recovery behavior

`frontend/components/store/checkout/CheckoutClient.jsx`:

- blocks an empty cart;
- requires map pin or typed address when configured;
- blocks submission during currency mismatch/repricing and triggers refresh;
- validates coupon/pricing before creating the order;
- sends region, locale, customer/address, payment method, items, and attribution to `/api/checkout/`;
- displays DRF validation detail or a generic error;
- disables submit while submitting, cart-empty, currency-mismatched, or repricing;
- saves the returned order lookup token;
- for online payments, creates the order first and then calls `/api/payments/initiate/`;
- on initiation failure, retains order context and displays a retry-payment path.

This design avoids losing the order when the payment provider is unavailable, but it also means failed payment starts remain as unpaid orders/transactions and must be measured separately from successful checkout.

### CONFIRMED — no broad checkout API outage

Seven-day nginx aggregates showed only three 500 responses for `/api/payments/initiate/`; checkout creation itself did not emerge as a repeated 5xx route. There were 77 orders in the launch-period database, including 34 during the recent equal-period window. This rules out a total order-creation outage.

### SUSPECTED — order and abandoned-cart metrics changed semantics during the period

The current code captures abandoned carts immediately before order/payment redirect and only marks unpaid-online carts recovered after paid webhook. A deployment on 2026-07-23 also changed contact gating. Historical rows were created under older behavior, so the 66 “recovered” of 93 abandoned carts are not a clean conversion rate and should not be used for trend claims without version-aware reprocessing.

## Paymob regional configuration

No secret values were printed. The table reflects public/boolean configuration only.

| Region | Storefront provider row | Administrative mode | Resolved provider shape | Result |
|---|---|---|---|---|
| AE | Paymob enabled; card + Apple Pay advertised | `sandbox` | UAE host, AED, all legacy fields present, secret/public/Apple Pay present, Unified enabled | **CONFIRMED broken:** three intention HTTP 404s after latest deployment |
| OM | Paymob enabled; card + Apple Pay advertised | `sandbox` | Oman host, OMR, all legacy and Unified fields present | No current initiation exception observed; recent payment success is still zero and requires provider reconciliation |
| SA | Enabled provider list empty | `sandbox` | Resolver returns a complete Oman/OMR Unified shape, but region row prevents storefront provider availability | No production online attempts in dataset; resolver fallback deserves staging review |

The `payment_mode` row is not used as sufficient evidence of the actual external account mode. It says `sandbox` for all three regions while resolved hosts/credentials and live traffic indicate environment-driven routing. Treat the discrepancy as configuration hygiene/UX risk.

No `PaymobRegionConfig` database rows exist; production payment configuration falls back to environment/SiteSettings resolution.

## UAE failure trace — CONFIRMED P0

Timeline in UTC:

| Time | Event |
|---|---|
| 06:42–06:44 | GitHub Actions client-Hostinger deployment of `56b293e` completed successfully |
| 07:03:48 | `POST` to Paymob UAE `/v1/intention/` returned HTTP 404; application logged unexpected initiation error |
| 07:19:16 | Same failure |
| 12:09:46 | Same failure |

Code selection:

1. `get_paymob_config("ae")` resolves secret and public keys.
2. `_unified_checkout_enabled()` returns true when the global flag and those keys are present.
3. `_unified_payment_method_ids()` sends card and Apple Pay integration IDs.
4. `initiate_unified_checkout()` posts the intention to the UAE root host.
5. `raise_for_status()` raises on 404; the API catches the unexpected exception and returns HTTP 500.
6. Frontend shows “unable to start payment,” retains the saved order, and exposes retry.

The handoff hypothesis of a key/integration/account mismatch is consistent with this behavior but remains **SUSPECTED**, because the provider error body and dashboard were not inspected and no secret values were compared. What is confirmed is that the currently resolved combination is rejected at the intention endpoint.

## Webhook, signature, idempotency, and duplicate protection

### CONFIRMED in source

- Webhook endpoint is `/api/payments/webhook/`; Unified initiation also supplies a notification URL based on the configured public base.
- Provider verification occurs before update through `verify_webhook()`.
- Customer-facing initiate/retry/status access requires order ownership or a constant-time lookup-token comparison.
- Webhook updates execute against `select_for_update()` order lookup.
- A final transaction with the same provider/reference is treated idempotently and returns `already_processed`.
- Paid webhook updates the order, recovers its abandoned cart, commits reserved inventory, finalizes pending gift card redemption, and queues invoice generation.
- Failed/cancelled/refunded outcomes restore or release relevant state.
- Initiation refuses non-online, paid, or cancelled orders. Retry can re-reserve released inventory.

### Production evidence and gap

- No exact invalid-HMAC or `already_processed` log matches were found in seven days.
- All 17 Paymob transaction rows since launch were still `pending`; four online orders were marked paid. Seven of ten online orders had two transaction rows. This is a **CONFIRMED data inconsistency/observability gap**, not proof that every webhook failed: paid order state could have been set manually or by older code, and placeholder/retry rows can coexist.
- Provider dashboard delivery, callback response codes, provider transaction status, settlement, and raw provider error categories were unavailable. Webhook health is therefore **UNKNOWN** until reconciled read-only against Paymob.

## Failure-mode matrix

| Failure mode | Frontend behavior | API/log evidence | Persisted state | Classification |
|---|---|---|---|---|
| UAE intention 404 | order saved; error + retry shown; no redirect | 3× provider 404 and API 500 | unpaid order; attempted transaction state may remain pending | CONFIRMED P0 |
| Coupon/pricing invalid | validation message; submission stops | not elevated in logs | no new order at that branch | Code-confirmed, production incidence UNKNOWN |
| Currency mismatch/repricing | submit disabled/message; refresh invoked | no aggregate error dimension | cart remains local | Code-confirmed; incidence UNKNOWN |
| Webhook invalid signature | provider error response | 0 exact log matches in 7 days | no payment-state update | Not observed; health UNKNOWN |
| Duplicate final webhook | returns `already_processed` | 0 exact log matches in 7 days | unchanged final transaction | Protection code-confirmed |
| Duplicate payment initiation | paid/cancelled orders rejected; retries allowed | 7 of 10 online orders have 2 transaction rows | multiple pending attempts possible | CONFIRMED data pattern; intent UNKNOWN |
| Payment timeout/provider network error | generic initiation failure + retry | only UAE 404 proven | saved unpaid order | Handling code-confirmed |
| Stock/variant issue | backend validation error | one product ineligible per region; no outage pattern | no/failed order depending branch | Broad outage not supported |

## Required fixes and verification order

1. **P0:** provider-assisted UAE configuration validation and staging/approved end-to-end test; fix only the AE route/config.
2. **P1:** read-only reconciliation of all online orders/transactions with provider results; define canonical state and alert on divergence. Do not replay webhooks or edit states in this audit.
3. **P1:** make customer email operational so saved-order/retry/confirmation messages arrive.
4. **P2:** add client exception and cart-action telemetry with anonymous event IDs; add accessible success feedback and a brief duplicate-click guard.
5. **P2:** consolidate cart repricing into one server request or bounded batch and surface failures clearly.
6. **P3:** add automated synthetic checkout in provider sandbox for AE/OM, never production card data.

Each change requires staging, region-specific regression coverage, a rollback plan, and explicit approval. No fix was implemented in this run.

## Safety note

Opening the Oman storefront for DOM inspection automatically sent one synthetic `page_view` to the first-party analytics endpoint. This was the only known production write, carried no customer/order/payment data, and was stopped before any add-to-cart interaction.
