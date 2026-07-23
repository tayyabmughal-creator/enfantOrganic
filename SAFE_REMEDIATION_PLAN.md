# Enfant Organic — Safe Remediation Plan

Prepared: 2026-07-23

Status: proposal only; **nothing in this plan was implemented**

## Approval recommendation

Approve work in this order:

1. Emergency UAE payment diagnosis/correction with provider support and a region-scoped rollback.
2. Transaction/webhook reconciliation plus customer-email restoration.
3. Analytics baseline and client-error observability so changes can be measured safely.
4. Low-risk image and public-cache improvements.
5. Cart feedback/repricing improvements and broader architecture changes.

Do not bundle payment, analytics, and performance changes into one deployment. Each should have an independent rollback and verification window.

## Release safety gates

Every production change must satisfy these gates:

- named owner, change ticket, exact affected region(s), start/end time, and rollback decision-maker;
- fresh verified database backup plus proof of restore procedure for any stateful change;
- staging deployment from an immutable commit/SHA;
- secrets never printed to logs, shell history, issue trackers, or reports;
- no real customer card data in staging or automation;
- smoke tests for OM, AE, SA in English and Arabic where supported;
- compare error rate, checkout/order creation, payment initiation, and paid conversion before/after;
- rollback if acceptance thresholds fail; do not “fix forward” during a revenue incident without another approved plan.

## 1. Zero-code configuration and infrastructure improvements

### 1.1 P0 — Correct UAE Paymob account/integration routing

**Expected benefit:** restores UAE card/Apple Pay initiation and removes current HTTP 500s.

**Affected:** secret/config store used by `production`, AE Paymob account, `PAYMOB_*_AE` variables, Unified Checkout feature flag, GitHub Actions deployment environment. No other region should change.

**Risk:** high. Incorrect keys/integration IDs, account host, currency, or webhook URLs can block payments or misroute charges.

**Testing requirements:**

- With Paymob support, confirm the UAE account supports `/v1/intention/`, the secret/public keys belong to that account/host, and the card/Apple Pay integration IDs are valid for the same account and AED.
- Use Paymob sandbox or a provider-approved non-customer test. If Paymob requires a live verification transaction, obtain business/security approval and use a documented low-value test instrument; never use a real customer payment.
- Verify redirect allowlist, AED amount/minor units, callback/redirection URL, HMAC signature, idempotency, and one paid state transition.

**Staging:** mirror AE non-secret routing and use sandbox credentials in an isolated environment. Exercise initiate → hosted page → signed webhook → paid order exactly once.

**Production procedure:** snapshot current secret versions/metadata without revealing values; change only AE values or the explicitly approved AE routing flag; deploy immutable commit/config; run one authorized test; monitor `/api/payments/initiate/` and webhook outcomes.

**Rollback:** restore prior AE secret versions/config atomically and redeploy only if the approved rollback is safer than leaving online payment disabled. If no known-good AE configuration exists, the safer fallback may be to hide/disable AE online payment while preserving COD/other approved methods; this requires business approval.

**Verification:** zero AE intention 404/500, valid provider redirect, matching provider transaction, one local paid transaction/order, duplicate webhook returns idempotent success.

**Downtime:** no platform downtime expected; a brief AE online-payment maintenance window may be appropriate.

### 1.2 P1 — Restore transactional email

**Expected benefit:** delivers order confirmations, invoices/retry/recovery notifications, and operational email.

**Affected:** SMTP provider, Django email settings, DNS records for sender authentication, alerting.

**Risk:** medium; bad sender configuration can silently drop or spam-folder mail, and fail-closed startup can stop deployment.

**Testing:** staging inboxes, all templates/locales, link/token validity, SPF/DKIM/DMARC, bounce handling, rate limits, and secret masking.

**Staging:** configure a non-production sender/subdomain; verify delivery and retries; then enable `EMAIL_REQUIRE_SMTP=1` in staging.

**Rollback:** revert SMTP config to prior secret version; keep explicit alerting. Do not intentionally revert to console backend without an approved outage mode.

**Production verification:** send a controlled internal test and confirm provider delivery events; verify a sanctioned test order email without exposing customer data.

**Downtime:** none expected.

### 1.3 P1 — Reconcile provider and local payment states read-only

**Expected benefit:** identifies whether the 17 pending Paymob rows are placeholders, missed webhooks, retries, or mapping defects; restores trustworthy payment reporting.

**Affected:** Paymob dashboard/API read access, `store_order`, `store_paymenttransaction`, webhook logs.

**Risk:** low while read-only; high if later correcting state.

**Procedure:** export provider transaction status by merchant reference into an access-controlled workspace; join by hashed/reference-safe ID; classify unmatched, duplicated, pending, paid, failed, and settled. Produce an approved correction manifest—do not edit the database during reconciliation.

**Rollback:** not applicable for read-only work. Any later state correction must be a separate migration/runbook with snapshot, dry run, idempotency, row count, and reverse manifest.

**Verification:** every online order has one canonical latest attempt; provider paid/settled matches local paid; divergence alerts operate.

**Downtime:** none.

### 1.4 P2/P3 — Deployment provenance, backups, disk, and logging

**Expected benefit:** safer releases and incident recovery.

**Affected:** GitHub Actions, `/home/deploy`, backup scheduler/storage, monitoring, PostgreSQL logging.

**Changes:**

- Write deployed SHA/build metadata as a read-only artifact and expose it to health/admin diagnostics; stop relying on the empty/untracked host Git repository.
- Repair or remove the independently failing personal-VPS job so workflow status reflects the intended topology.
- Establish automated encrypted off-host backups with retention and quarterly restore tests; one local July 4 dump is insufficient proof.
- Alert at 80/85/90% disk; clean only with a separately reviewed retention policy.
- Enable bounded slow-query sampling (for example, a conservative duration threshold) and structured application error aggregation without request bodies/PII.

**Risk:** medium; logging can increase I/O and expose data if configured poorly.

**Rollback:** disable new log sampling/metadata endpoint, restore previous workflow, and retain backups rather than deleting them.

**Downtime:** none expected; restore testing occurs in isolation.

## 2. Low-risk frontend performance optimizations

### 2.1 P2 — Responsive image derivatives

**Expected benefit:** largest near-term byte/LCP reduction; mobile image transfer target <1.5 MiB and hero <80 KB subject to visual quality.

**Files/services:** `frontend/components/store/home/HomeClient.jsx`, product-card/product-gallery components, Next image configuration/media pipeline.

**Risk:** medium; wrong sizing/crop can degrade creative, and remote image policy can break rendering.

**Testing:** visual regression across 360/390/768/1440 widths, DPR 1–3, English/Arabic, slow 4G, cached/uncached, missing mobile image fallback, and browser matrix.

**Staging:** generate immutable variants; use `<picture>`/`srcset` or `next/image`; retain eager/high priority only for the actual LCP image; lazy-load hover and below-fold images.

**Rollback:** feature flag or revert to current raw-image component/assets. Keep original media.

**Production verification:** three non-overlapping Lighthouse runs; field RUM p75; transfer/request deltas; no image 404s.

**Downtime:** none.

### 2.2 P2 — Reduce homepage payload and render-blocking work

**Expected benefit:** faster parse/FCP/TTI and lower lower-fold image load.

**Files:** homepage server/client components, API serializers for home sections, CSS entry points, pixel loader.

**Risk:** medium; content/SEO or analytics events may disappear.

**Testing:** metadata/SEO snapshots, content parity, view-source/RSC payload size, navigation, consent modes, pixel diagnostics, no hydration errors.

**Staging:** cap initial product/section payload, defer below-fold content/hover assets, split non-critical CSS, and consolidate duplicate analytics loaders only after tag inventory approval.

**Rollback:** revert component/API field changes or disable lazy section flag.

**Verification:** lower HTML/RSC size, CSS blocking time, image bytes, and no conversion-event loss.

**Downtime:** none.

### 2.3 P2 — Remove external geolocation from the critical redirect path

**Expected benefit:** removes a possible 1.5 s timeout and makes first navigation deterministic.

**Files/services:** `frontend/middleware.js`, region selection UX, possibly a trusted edge-provided country header.

**Risk:** medium/high because wrong region changes currency, payment methods, shipping, and stock.

**Testing:** cookie/manual override precedence, VPN/unknown IP, crawlers, direct region host, `www`, all locales, no redirect loop.

**Staging:** use hostname/cookie first; make geolocation asynchronous or use a trusted proxy header; never override explicit user choice.

**Rollback:** restore existing middleware behavior behind a feature flag.

**Verification:** first-hop redirect latency, correct regional landing, zero loops/mispriced carts.

**Downtime:** none.

## 3. Low-risk backend and cache optimizations

### 3.1 P2 — Replace blanket `no-store` for public data

**Expected benefit:** enables Next revalidation and removes repeated public API/render work.

**Files:** `frontend/lib/api.js`, `frontend/app/[locale]/page.jsx`, page/data call sites.

**Risk:** high if personalized or region-sensitive content is cached under the wrong key.

**Testing:** inventory every call site; classify public/personalized; assert cache keys include locale/region/currency; test price/stock changes and invalidation; confirm cart/order/customer routes remain uncached.

**Staging:** introduce explicit request policies (`publicRevalidate`, `dynamicNoStore`) rather than changing the default globally. Start with navigation/home content.

**Rollback:** restore `no-store` at individual call sites.

**Verification:** repeat request cache/revalidation evidence, lower public TTFB, correct OM/AE/SA prices, no user data in cached responses.

**Downtime:** none.

### 3.2 P2/P3 — Move shared Django cache to Redis

**Expected benefit:** consistent cache across workers and better cold-request behavior.

**Files/services:** Django cache settings, Redis, cache-key/versioning, monitoring.

**Risk:** medium; stale/incorrect regional content or Redis failure can affect multiple workers.

**Testing:** key namespace, TTLs, serialization, failover, stampede behavior, invalidation after admin changes, regional isolation.

**Staging:** new namespaced cache alias; migrate one public endpoint; record hit ratio/latency; add fallback behavior.

**Rollback:** switch alias back to LocMem and invalidate only the new namespace.

**Verification:** cache hit ratio, p50/p95 API latency, Redis memory/eviction, correctness.

**Downtime:** none.

## 4. Cart and checkout correctness improvements

### 4.1 P2 — Add explicit add-to-cart acknowledgement and duplicate guard

**Expected benefit:** resolves perceived click uncertainty and prevents accidental duplicate quantities.

**Files:** `frontend/components/store/ProductCard.jsx`, product detail add handler, `StoreProvider.jsx`, accessibility styles/messages.

**Risk:** low/medium; an overlong lock can ignore intended rapid quantity changes.

**Testing:** single/double tap, keyboard/screen reader, out-of-stock, variant required, storage unavailable, iOS Safari, Android Chrome, slow device.

**Staging:** instant optimistic update plus short per-item guard, accessible “added” status, persistent cart-count change, explicit storage failure message.

**Rollback:** disable guard/notification feature flag.

**Verification:** synthetic UI tests and anonymous action→state confirmation telemetry; no duplicate line/quantity regressions.

**Downtime:** none.

### 4.2 P2 — Consolidate cart repricing and surface errors

**Expected benefit:** reduces item-by-item API fan-out and checkout blocking ambiguity.

**Files/services:** `StoreProvider.jsx`, a new/read-only pricing validation endpoint or existing checkout preview serializer.

**Risk:** medium; pricing and stock correctness are revenue-critical.

**Testing:** mixed variants, region switch, coupon/gift card, stock race, partial failure, stale local cart, all currencies.

**Staging:** batch SKUs/variants in one server-authoritative request; return per-line errors; keep current implementation as rollback path.

**Rollback:** feature flag back to existing concurrent product fetches.

**Verification:** request count, repricing time, mismatch/error rate, checkout completion.

**Downtime:** none.

## 5. Payment correctness improvements after P0 recovery

### 5.1 P1 — Canonical transaction-attempt model and webhook monitoring

**Expected benefit:** eliminates ambiguous pending/duplicate rows and detects provider delivery failures.

**Files:** payment initiation, webhook handling, transaction model/migrations, admin/reporting, alerting.

**Risk:** high; schema/state changes can corrupt payment history.

**Testing:** initiation placeholder, retry, timeout, failed/paid/refunded/cancelled, duplicate/out-of-order webhook, provider-reference changes, concurrent callbacks.

**Staging:** define immutable attempt ID plus canonical latest state; replay synthetic signed fixtures; run migration dry-run on a production snapshot.

**Rollback:** backward-compatible schema first; do not delete old rows; feature flag new state resolution.

**Verification:** provider/local reconciliation is zero-difference for test cases; duplicate webhook causes one business transition.

**Downtime:** avoid with additive migration; otherwise schedule a short maintenance window only after rehearsal.

### 5.2 P1 — Regional configuration validation at deploy/startup

**Expected benefit:** catches account-host/currency/integration inconsistencies before shoppers see a payment option.

**Files:** payment config/router, deployment smoke test, admin warnings.

**Risk:** medium; a fail-closed rule can disable valid payments if provider health is transient.

**Testing:** missing key, cross-account integration, disabled region, sandbox/live mismatch, provider outage, SA fallback.

**Staging:** non-secret structural validation at startup; provider capability check only in a controlled smoke job; storefront hides a provider when validation definitively fails.

**Rollback:** warning-only mode; restore provider visibility only with approval.

**Verification:** deliberate invalid staging configuration is detected before checkout.

**Downtime:** none.

## 6. Analytics reliability improvements

### 6.1 P1/P3 — Server-side canonical commerce events

**Expected benefit:** trustworthy order/payment conversion independent of consented ad scripts and thank-you-page completion.

**Files/services:** checkout/order/payment backend, analytics event schema, warehouse/reporting, optional Meta/TikTok/Snap server APIs.

**Risk:** high for privacy and double counting.

**Testing:** event IDs, idempotency, consent/legal basis, currency/value, refunds/cancellations, pixel+CAPI deduplication, retries, data minimization.

**Staging:** first emit internal `order_created`, `payment_initiated`, `payment_paid`, and `payment_failed` events to a controlled sink. Add ad-platform server APIs only after privacy/business approval.

**Rollback:** stop external forwarding while retaining internal audit events; event IDs prevent duplicates.

**Verification:** database order/payment counts reconcile daily to events and provider data; platform diagnostics confirm deduplication.

**Downtime:** none.

### 6.2 P3 — Restore GA4/GTM or choose an explicit alternative

**Expected benefit:** device/browser/Web Vitals and campaign analysis.

**Affected:** SiteSettings/environment, consent manager, `AnalyticsScripts.jsx`, tag governance.

**Risk:** privacy non-compliance, duplicate tags, performance regression.

**Testing:** consent denied/granted/revoked, SPA navigation, purchase deduplication, CSP, tag load cost, regional legal requirements.

**Staging:** choose either GTM or direct GA4 as the single loader; inventory tags; enforce consent; validate DebugView with synthetic events.

**Rollback:** remove ID/disable loader; server-side canonical commerce reporting remains intact.

**Verification:** no tag before consent where required; one page/purchase event; p75 performance within guardrail.

**Downtime:** none.

### 6.3 P3 — Data minimization and session definitions

**Expected benefit:** safer, more interpretable analytics.

**Changes:** stop retaining raw `_ip` unless documented and required; apply truncation/hashing/short retention; define timed sessions; add anonymous device class and bot filters; document source attribution.

**Risk:** medium; historical comparability changes.

**Staging/rollback:** version the metric definitions and retain aggregate old/new overlap; rollback event parsing without restoring unnecessary raw IP collection.

**Verification:** privacy review, retention job, metric reconciliation, bot-filter QA.

## 7. Larger architectural changes

Consider only after the preceding issues are stable:

- same-origin or CDN-backed media delivery with automatic variants;
- edge/region routing that avoids application middleware geolocation;
- a durable analytics/commerce event pipeline with warehouse models;
- a unified cart/pricing service if cross-device authenticated carts are a product requirement;
- deployment artifacts/images promoted by digest rather than SCP of an untracked directory.

These are multi-sprint initiatives. They need architecture review, load testing, migration plans, and parallel-run rollback—not incident-response changes.

## Approval checklist and first three change tickets

1. **AE-PAYMOB-P0:** provider-assisted AE Unified Checkout repair, region-scoped change, authorized end-to-end test, immediate rollback criteria.
2. **PAYMENT-RECON-EMAIL-P1:** read-only provider reconciliation and SMTP restoration as separate deployable items.
3. **MOBILE-IMAGE-P2:** responsive hero/product image pilot on Oman staging, followed by three-run lab and field verification.

Performance caching, cart changes, and analytics rollout should wait until these tickets establish a measurable, trustworthy baseline.
