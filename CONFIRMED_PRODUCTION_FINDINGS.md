# Enfant Organic — Confirmed Production Findings

Audit date: 2026-07-23

Production data cutoff: 2026-07-23 (UTC; current day excluded from equal-period funnel comparisons)

Mode: read-only investigation; no fixes, deployments, restarts, migrations, configuration changes, or payment attempts

## Executive determination

The storefront has a genuine mobile-performance problem and a current UAE online-payment failure. Performance is material, but it is not sufficient by itself to explain the conversion deterioration. The most direct revenue failure is UAE Paymob Unified Checkout: three live initiation attempts after the latest successful client deployment returned HTTP 404 from `https://uae.paymob.com/v1/intention/`. At the same time, the first-party funnel shows substantially lower add-to-cart and checkout participation despite higher tracked traffic, especially in Oman. Analytics is incomplete and partially contaminated by traffic quality/bots, but database order counts also fell modestly in the equal-period comparison, and online paid orders fell from four to zero.

## Final decisions

| Question | Determination | Confidence |
|---|---|---:|
| Is website performance genuinely poor? | **Yes.** Clean median mobile Lighthouse performance was 61, LCP 9.48 s, FCP 3.09 s, TTI 18.55 s, with 3.13 MiB of images. | High |
| Is “11.5 seconds” indexing time? | **No.** It refers to Lighthouse **Speed Index**, a visual-progress metric, not search-engine indexing. This audit's clean median was 5.17 s, with substantial run-to-run variance. | High |
| Can performance explain the full order decline? | **No.** It is a plausible abandonment contributor, but current payment failures, funnel deterioration, and traffic-mix/quality changes are more direct and measurable. | High |
| Is add-to-cart technically failing? | **Not confirmed.** The handler is immediate, client-local, and live buttons were present; no cart API exists to fail. However, add-to-cart session rate fell 67%, and the UI lacks a loading/duplicate-click guard. | Medium |
| Is there checkout/payment failure? | **Yes for UAE payment initiation.** Three post-deploy requests returned provider HTTP 404 and the API returned 500. A broader checkout outage was not observed. | High |
| Is UAE payment configuration revenue-impacting? | **Yes.** AE exposes Paymob, resolves Unified Checkout, and real initiation attempts fail before redirect. | High |
| Is analytics merely under-reporting? | **No.** Tracking is incomplete, but database orders also fell from 37 to 34 in equal 18-day periods and online paid orders fell 4 to 0. | High |

## Priority findings

### P0 — CONFIRMED: UAE Paymob Unified Checkout cannot initiate payments

- **Evidence:** after client deployment `56b293e` succeeded at 06:44 UTC, backend logs recorded Paymob intention HTTP 404 at 07:03, 07:19, and 12:09 UTC. The affected URL was `https://uae.paymob.com/v1/intention/`; `/api/payments/initiate/` produced three HTTP 500 responses in the seven-day nginx aggregate.
- **Configuration shape:** AE is active, enables `paymob`, exposes card and Apple Pay, and resolves all legacy and Unified credential fields as present. Unified Checkout is therefore selected. No credential values were read or printed.
- **Customer outcome:** checkout first creates/saves the order, payment initiation then fails, and the UI offers a retry link. The shopper cannot reach the hosted payment page.
- **Business impact:** blocks online Paymob conversion for UAE attempts; at least three failures are proven after the current deployment.
- **Affected scope:** UAE card and potentially Apple Pay through the same Unified intention path.
- **Exact sources:** `backend/store/services/paymob.py:237-355`; `backend/store/api_views/payments.py:210-294`; `frontend/components/store/checkout/CheckoutClient.jsx:1407-1455`.
- **Recommended action:** validate the UAE Paymob account/key/integration association with Paymob using a non-production or provider-approved diagnostic, then stage a configuration-only correction or explicitly controlled legacy-flow fallback. Do not rotate or change live credentials without a rollback-ready change window.
- **Change risk / rollback:** high because payment credentials and routing are revenue-critical; capture current secret versions without exposing them, change one region only, and roll back to the prior secret/config version if a synthetic sandbox/low-value approved test fails.
- **Verification:** provider intention creation succeeds, redirect host is allowlisted, one authorized UAE end-to-end test reaches success, webhook verifies, one transaction and order converge to paid exactly once.

### P1 — CONFIRMED: online payment success deteriorated to zero in the recent comparison period

- **Evidence:** 2026-06-17–07-04 had 6 online orders and 4 marked paid; 2026-07-05–07-22 had 4 online orders and 0 marked paid. Across the launch period, 17 Paymob transaction rows remain `pending`, including rows associated with four orders marked paid.
- **Impact:** loss of online-payment revenue and unreliable payment reconciliation/reporting.
- **Scope:** UAE initiation failure is proven. Oman had recent online attempts but no recent paid online order; the cause for Oman is **UNKNOWN** because no corresponding provider failure was observed.
- **Sources:** `backend/store/api_views/payments.py:85-207`, `:210-294`; `backend/store/services/payment_router.py`; `backend/store/services/paymob.py`.
- **Recommended action:** first repair/verify UAE initiation; separately reconcile Paymob provider records against aggregate local transaction states and audit webhook delivery/status mapping.
- **Risk / rollback:** read-only reconciliation is low risk; any replay or state correction is high risk and requires an approved runbook, idempotency proof, backups, and a dry run.

### P1 — CONFIRMED: conversion funnel deteriorated while tracked sessions increased

- **Evidence:** between equal 18-full-day periods, tracked sessions increased 45% (4,541 → 6,582), but add-to-cart sessions fell 52% (299 → 143), checkout sessions fell 46% (185 → 99), orders fell 8% (37 → 34), and online paid orders fell 100% (4 → 0). Session-to-add-to-cart rate fell 6.58% → 2.17%; session-to-checkout fell 4.07% → 1.50%.
- **Impact:** the largest measured loss occurs before checkout, with an additional payment-stage loss.
- **Scope:** strongest in Oman: tracked sessions +81%, add-to-cart rate 5.63% → 1.55%, checkout rate 3.64% → 1.10%, order rate 0.74% → 0.45%.
- **Confidence:** high for stored aggregates; medium for interpreting “session” because it is a persistent client session key rather than a standards-based analytics session.
- **Recommended action:** repair measurement, segment bot/low-intent traffic, add a server-recorded order-created/purchase funnel endpoint, then reassess each stage.

### P1 — CONFIRMED: production customer email delivery is disabled

- **Evidence:** every Django shell invocation emits: production `EMAIL_BACKEND` is console/dummy/locmem and customer emails are not delivered; `EMAIL_REQUIRE_SMTP=1` is not active.
- **Impact:** order confirmation, recovery, and operational emails may not reach customers, harming trust and recovery.
- **Scope:** all regions and email workflows using Django email.
- **Sources:** `backend/enfant_backend/settings.py:295` in the deployed container; local settings equivalent.
- **Recommended action:** configure and verify SMTP in staging, enable fail-closed production enforcement, then test transactional delivery, SPF/DKIM/DMARC alignment, bounces, and alerting.

### P2 — CONFIRMED: mobile page delivery is image-heavy and slow

- **Evidence:** clean median mobile Lighthouse: score 61, FCP 3.09 s, LCP 9.48 s, TBT 254 ms, TTI 18.55 s, 103 requests, 3.93 MiB total transfer, 3.13 MiB images. Mobile LCP was the primary hero image. In the observed trace its chain was: HTML TTFB 931 ms, resource-load delay 72 ms, image load 2.19 s, render delay 40 ms; 224,512-byte image rendered near 380×231.
- **Impact:** slower discovery and interaction on mobile, likely increasing early-stage abandonment.
- **Scope:** mobile; desktop median score was also only 69 but LCP was much better at 2.84 s.
- **Sources:** `frontend/components/store/home/HomeClient.jsx` (hero); `frontend/app/[locale]/page.jsx`; `frontend/lib/api.js`.
- **Recommended action:** responsive image derivatives with `next/image` or equivalent sizing, preserve high priority for only the LCP asset, reduce product-image payloads, and verify with three clean runs.

### P2 — CONFIRMED: homepage is dynamically served despite `revalidate=120`

- **Evidence:** `frontend/lib/api.js:165-227` sets `cache: "no-store"` on shared data fetches. The homepage declares `revalidate=120`, but live HTML returns `Cache-Control: private, no-cache, no-store, max-age=0, must-revalidate` with no `x-nextjs-cache` hit. Uncompressed HTML is 295,604 bytes.
- **Impact:** prevents shared HTML caching and adds avoidable server/network work. It contributes to TTFB but warm origin tests show the application itself can respond quickly.
- **Scope:** pages using the shared request wrapper, including home/navigation/category/product data; correctness constraints around region/currency must be preserved.
- **Recommended action:** classify public vs personalized fetches and use bounded revalidation for public content; keep cart/customer/order data uncached.

### P2 — CONFIRMED: redirect, cross-origin media, and third parties add mobile cost

- `www` redirects to a regional hostname and added a median ~0.72 s before following the redirect in this audit.
- DNS resolves directly to the VPS and responses identify nginx; no CDN edge behavior was observed.
- The LCP asset is fetched from `app.enfantorganic.com`, requiring another origin connection.
- The representative mobile trace attributed about 374 KiB transfer and ~182 ms main-thread work to Meta, TikTok, and Snapchat; boot-up tasks for their scripts were larger than the summarized third-party main-thread estimate.

### P2 — CONFIRMED: add-to-cart observability is insufficient

- Guest cart persistence is localStorage (`enfant-organics-cart`); adding an item performs a synchronous local state update and browser-only analytics. There is no cart API, backend validation, or database persistence at click time.
- The button is disabled only for stock state, with no add-in-progress state or duplicate-click guard. A fly-to-cart effect is the principal confirmation.
- First-party tracking is fire-and-forget and suppresses errors, so event absence cannot distinguish a shopper action from blocked/failed tracking.
- **Conclusion:** a widespread functional failure is not proven; a UX/measurement problem remains **SUSPECTED**.

### P3 — CONFIRMED: analytics cannot produce a reliable canonical funnel

- First-party events contain only page view, product view, add-to-cart, and checkout initiated; no purchase/order-created event exists.
- GA4/GTM identifiers are absent in the active environment and absent from SiteSettings. Meta, TikTok, and Snapchat browser pixels are configured.
- Purchase pixels execute client-side on the thank-you flow with localStorage deduplication; no server-side conversion backup/CAPI was found.
- Device and new-vs-returning dimensions are unavailable. The “session key” persists in localStorage and is not a standard timed session. Metadata stores `_ip` for most events, creating a privacy/retention concern.

### P3 — CONFIRMED: operational observability and provenance gaps

- Django uses per-process `LocMemCache`, not Redis, even though Redis is deployed.
- PostgreSQL slow-query logging is disabled (`log_min_duration_statement=-1`).
- `/home/deploy` is an initialized repository with no commits and all deployment files untracked, so the deployed commit cannot be proven from host Git. GitHub Actions does prove the client deployment of `56b293e` succeeded.
- Only one database dump was found under the checked deployment path: 2026-07-04, 1.58 MB. Automated backup cadence and off-host recovery are **UNKNOWN**.
- Root disk is 81% used; CPU, RAM, load, and container limits were healthy during the audit.
- Compose warns that SMS-related variables are unset. The runtime impact is **UNKNOWN**.

## Architecture and environment verified

- Next.js 15.5.15 / React 19.2.5 frontend; Django 4.2.16 / Python 3.12.13 backend.
- PostgreSQL, Redis, backend, frontend, Docker nginx, Celery worker, and Celery beat were running; all seven containers were healthy/up.
- Host nginx terminates TLS and forwards to Docker nginx on `127.0.0.1:8082`; database and Redis were not publicly published.
- GitHub Actions deploys the client Hostinger target on pushes to `main`; a second personal-VPS job is independently failing during upload.
- Store migrations through `store.0066` were applied.
- Host resources were not saturated: load 0.14/0.11/0.09, 13 GiB RAM available, containers below 1% CPU during the snapshot.

## Safety and limitations

- No secrets or row-level customer/order data were selected or reported.
- No payment, order, cart, deployment, restart, migration, or configuration write was attempted.
- One live storefront page was opened for mobile DOM inspection. Page load automatically emitted one synthetic first-party `page_view` AnalyticsEvent. This was an unintended, non-customer analytics write; the browser test was stopped before clicking add-to-cart or entering checkout.
- No pre-launch Shopify analytics/order export was available. Therefore the audit cannot prove the magnitude of decline versus the former Shopify site; it can only compare post-launch production periods.
- Provider dashboard data, bank settlement data, device breakdown, unique users, and new/returning user status were unavailable.
- The graphify report was reviewed first, but its analyzed head (`238de3e`) lagged current HEAD (`56b293e`) even though its stale flag was false. Architecture conclusions were verified against current source and production rather than trusting semantic results.
