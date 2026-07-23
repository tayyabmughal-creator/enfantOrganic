# Enfant Organic — Conversion Funnel Audit

Audit date: 2026-07-23

Launch/cutover date supplied by handoff: 2026-06-16

Primary comparison: two equal 18-full-day UTC windows, excluding launch day and the current partial day

## Decision

There is evidence of a real conversion problem, not merely analytics under-reporting. Tracked sessions rose 45%, but add-to-cart sessions, checkout sessions, orders, and paid online orders all fell. Database orders decreased only 8% (37 → 34), so the available post-launch data does **not** prove the client’s claimed “major” overall daily-order decline. It does prove severe deterioration in early-funnel participation and online-payment success.

The top measurable pattern is concentrated in Oman and coincides with a large traffic-source shift. Recent Google-attributed traffic grew sharply but almost never added to cart; however, rates also deteriorated within Direct and Instagram, so mix alone cannot explain the result. Mobile performance is a plausible contributor, and current UAE payment failure is a proven downstream cause.

## Data quality and definitions

### Sources used

- `store_analyticsevent`: aggregate first-party browser events.
- `store_order`: canonical order creation and order-level payment status.
- `store_paymenttransaction`: attempt/state aggregates.
- nginx/backend logs: endpoint error aggregates.

### Important limitations

- “Session” is a persistent localStorage `session_key`, not a 30-minute analytics session. It may represent a long-lived browser and may include bots.
- No `purchase` or `order_created` first-party events exist. Orders are therefore joined only at aggregate period/region/source level, not as a complete event-level funnel.
- GA4/GTM is not configured in active environment or SiteSettings. Meta/TikTok/Snapchat are browser-side only; no server-side conversion backup was found.
- Device, browser, unique user, new/returning, campaign cost, provider settlement, and pre-launch Shopify data were unavailable.
- COD and WhatsApp orders commonly remain `payment_status='unpaid'` while operationally valid; “paid revenue” is not total commercial revenue.
- Traffic source is self-reported browser attribution and can include hostnames/referrers and bot traffic.
- One synthetic audit `page_view` was emitted on 2026-07-23; the comparison ends before that date, so it does not affect the two-window result.

## Equal-period funnel comparison

Windows:

- Early post-launch: 2026-06-17 00:00 through 2026-07-05 00:00 UTC
- Recent full days: 2026-07-05 00:00 through 2026-07-23 00:00 UTC

| Metric | Early | Recent | Change |
|---|---:|---:|---:|
| Tracked sessions | 4,541 | 6,582 | +45.0% |
| Page-view events | 12,745 | 11,951 | -6.2% |
| Product-view events | 3,108 | 3,537 | +13.8% |
| Add-to-cart events | 848 | 450 | -46.9% |
| Add-to-cart sessions | 299 | 143 | -52.2% |
| Checkout events | 397 | 166 | -58.2% |
| Checkout sessions | 185 | 99 | -46.5% |
| Database orders | 37 | 34 | -8.1% |
| Online orders created | 6 | 4 | -33.3% |
| Online orders marked paid | 4 | 0 | -100% |
| Session → add to cart | 6.58% | 2.17% | -67.0% relative |
| Session → checkout | 4.07% | 1.50% | -63.1% relative |
| Session → order | 0.81% | 0.52% | -35.8% relative |

The increase in persistent session keys alongside lower page views suggests more shallow one-page visits, changed attribution/session behavior, or bots. That makes raw traffic growth less trustworthy, but it does not erase the decline in database online-payment success.

## Region analysis

| Region/period | Sessions | ATC sessions | Checkout sessions | Orders | Online created | Online paid | ATC rate | Checkout rate | Order rate |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| AE early | 1,802 | 123 | 69 | 15 | 1 | 1 | 6.83% | 3.83% | 0.83% |
| AE recent | 1,424 | 60 | 40 | 10 | 0 | 0 | 4.21% | 2.81% | 0.70% |
| OM early | 2,968 | 167 | 108 | 22 | 5 | 3 | 5.63% | 3.64% | 0.74% |
| OM recent | 5,372 | 83 | 59 | 24 | 4 | 0 | 1.55% | 1.10% | 0.45% |

Saudi volume is too small for meaningful inference. Since launch, database totals were AE 25 orders / 2 marked paid, OM 49 / 5 marked paid, and SA 1 / 0.

Oman is the central funnel anomaly: tracked sessions increased about 81%, yet ATC and checkout rates fell roughly 72% and 70% relative. UAE traffic fell, and its rates also declined, but recent UAE had no online order until the three current-day initiation failures outside the comparison window.

## Traffic-source analysis

Top sources by tracked sessions:

| Source | Early sessions | Early ATC rate | Early checkout rate | Recent sessions | Recent ATC rate | Recent checkout rate |
|---|---:|---:|---:|---:|---:|---:|
| Facebook | 2,342 | 5.12% | 2.39% | 618 | 3.56% | 2.27% |
| Direct | 1,046 | 8.51% | 6.12% | 1,226 | 0.90% | 1.22% |
| Instagram | 448 | 10.49% | 6.25% | 2,034 | 3.93% | 2.16% |
| Snapchat | 364 | 0.27% | 0.00% | 491 | 0.41% | 0.20% |
| TikTok | 236 | 3.39% | 1.69% | 666 | 2.40% | 1.80% |
| Google | 94 | 9.57% | 8.51% | 1,526 | 0.33% | 0.26% |

Interpretation:

- **CONFIRMED:** mix changed sharply—from Facebook dominance to Instagram/Google growth.
- **SUSPECTED:** recent Google traffic is low-intent, misattributed, or bot-contaminated; 1,526 session keys generated only five ATC sessions and four checkout sessions.
- **CONFIRMED:** mix is not the only issue. Within-source rates also fell sharply for Direct, Instagram, and Google.
- **UNKNOWN:** campaign quality, spend, placements, creative, landing pages, and bot filters were unavailable.

Order attribution also shifted. Recent orders were led by Instagram (14 orders, one marked paid), AE hostname/referrer (5/0), Direct (5/0), Facebook (4/0), and TikTok (3/0). Source attribution is not necessarily last-click and should not be used for ROAS without a defined model.

## Orders, payment, and revenue

### Launch-period database totals

- 77 orders since 2026-06-16.
- Sales channel: 72 online store, 3 draft order; two remaining rows were outside those grouped labels or not material to the reported aggregate.
- Payment methods/statuses include 49 COD rows, 10 online orders, 9 WhatsApp rows, and 6 bank-transfer rows; status combinations reflect operational/manual workflows.
- Ten online orders generated 17 Paymob transaction rows. All 17 transaction rows were still `pending`; four online orders were marked paid.
- Seven online orders had two Paymob transaction rows, consistent with retry/placeholder behavior but not sufficient to identify whether retries were customer-initiated or automatic.

### Paid-status revenue only

| Currency | Marked-paid orders | Recorded paid revenue | AOV |
|---|---:|---:|---:|
| AED | 2 | 628.700 AED | 314.350 AED |
| OMR | 5 | 91.120 OMR | 18.224 OMR |

This is not gross merchandise value. COD/WhatsApp/bank-transfer orders can be commercially valid while still marked unpaid, and currencies must not be summed.

### Weekly order trend

| Week starting | Orders | Marked paid | Online created | Online paid |
|---|---:|---:|---:|---:|
| 2026-06-15 | 6 | 1 | 1 | 0 |
| 2026-06-22 | 25 | 4 | 5 | 4 |
| 2026-06-29 | 12 | 2 | 0 | 0 |
| 2026-07-06 | 9 | 0 | 0 | 0 |
| 2026-07-13 | 13 | 0 | 1 | 0 |
| 2026-07-20 (partial) | 10 | 0 | 3 | 0 |

The series is low-volume and volatile. It supports a sustained absence of marked-paid orders after early July, not a statistically stable daily decline estimate.

## Cause classification

| Candidate | Evidence-based conclusion | Priority/confidence |
|---|---|---|
| A. Traffic decreased | **Not supported in first-party session keys;** they rose 45%. Quality/mix deteriorated and counts may include bots. | P1, medium |
| B. Conversion decreased | **Confirmed.** ATC, checkout, and order rates all fell. | P1, high |
| C. Checkout broke | **Broad outage not supported.** Orders continued; no repeated checkout-creation 5xx pattern. | Medium |
| D. Payment success fell | **Confirmed.** Online paid fell 4 → 0; UAE initiation currently fails. Oman cause unknown. | P0/P1, high |
| E. Analytics under-reported | **Confirmed limitation, not sole explanation.** Browser-only tracking and no purchase event; database order decline remains. | P3, high |
| F. Stock/region blocked purchases | **Broad blockage not supported.** 48/48 regional prices; 47/48 inventory eligible. | High |
| G. Performance increased abandonment | **Plausible and supported as poor UX, but causal magnitude unknown.** | P2, medium |
| H. Combination | **Best-supported conclusion.** Payment failure + weaker funnel/traffic quality + mobile performance + measurement gaps. | High |

## Analytics reliability audit

### CONFIRMED

- First-party counts since launch: 25,359 page views, 6,824 product views, 1,323 add-to-cart events, 581 checkout-initiated events; zero purchase/order-created event types.
- Event metadata includes landing/current page, region, source, session key, referral and campaign parameters. Device is absent.
- `_ip` is stored on 29,979 of 34,087 event rows. Retention, legal basis, access controls, and masking should be reviewed.
- Active production environment-name inspection found no `NEXT_PUBLIC_GTM_ID`; SiteSettings contained no GTM or GA ID. Meta, TikTok, and Snapchat IDs were present in SiteSettings.
- Ad pixels load browser-side; purchase tracking depends on the customer reaching the thank-you page and localStorage deduplication. No server-side CAPI/Events API implementation was found.

### Consequence

Ad platforms and internal analytics can undercount purchases lost to blocked scripts, consent, navigation failure, or thank-you-page abandonment. They can also disagree with database orders. Only server-side order/payment state should be canonical for commercial reporting.

## What must be measured next

1. Create a server-side canonical funnel table/event stream with anonymous event ID, release, region, device class, and timestamps for cart, checkout validation, order-created, payment-initiation, provider redirect, webhook, and paid.
2. Define a real session timeout and bot filtering; preserve raw and filtered metrics separately.
3. Reconcile every online order with provider transaction/settlement state read-only before any correction.
4. Import pre-launch Shopify orders/sessions using identical region/channel definitions if a true platform-migration comparison is required.
5. Add device/browser dimensions and field Web Vitals without storing raw IP longer than necessary.
6. Define COD/WhatsApp “commercially confirmed” and “collected” states so revenue reporting is not tied only to online `payment_status='paid'`.

## Top three root causes by business impact

1. **UAE Paymob initiation failure (P0):** proven current block at the provider intention endpoint.
2. **Early/mid-funnel deterioration and traffic-quality shift (P1):** especially Oman and recent Google/Direct traffic.
3. **Poor mobile delivery (P2):** 9.48 s median lab LCP and image-heavy payload, likely increasing abandonment.

Analytics gaps amplify uncertainty and can under-report conversions, but they are not the sole reason orders appear down.
