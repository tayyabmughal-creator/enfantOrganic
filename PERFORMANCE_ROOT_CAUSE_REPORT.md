# Enfant Organic — Performance Root-Cause Report

Audit date: 2026-07-23

Target: `https://om.enfantorganic.com/en` unless noted

Method: three clean sequential Lighthouse 13.4.1 runs per form factor in Chrome 150, plus five-sample curl probes and five-sample warm origin probes

## Answer first

Mobile performance is genuinely poor. The clean median mobile score was **61** and simulated LCP was **9.48 seconds**. The largest cost is image delivery, followed by uncached/dynamic HTML, redirect and cross-origin connection cost, and browser-side third-party/JavaScript work. The host was not resource constrained, and warm origin responses were fast; adding server capacity is therefore unlikely to solve the main problem.

The reported “11.5 seconds” is Lighthouse **Speed Index**, not search-engine indexing time. This audit did not reproduce 11.5 s: clean Speed Index samples were 5.12 s, 5.17 s, and 7.87 s (median 5.17 s). Lighthouse lab metrics vary with network and server conditions, so the earlier result remains plausible but should not be treated as a constant.

## Test conditions and medians

Lighthouse used default simulated throttling, performance-only category, headless Chrome, and sequential runs. An earlier overlapping mobile batch was discarded because two Lighthouse processes overlapped and contaminated results.

| Metric | Mobile median | Desktop median | Interpretation |
|---|---:|---:|---|
| Performance score | 61 | 69 | Poor on both; worse on mobile |
| FCP | 3.092 s | 2.028 s | Slow first content on mobile |
| LCP | 9.480 s | 2.836 s | Poor mobile LCP; acceptable-to-needs-improvement desktop |
| Speed Index | 5.166 s | 3.035 s | Visual completion is slow; not “indexing” |
| CLS | 0 | 0.0005 | Layout stability is good |
| TBT | 254 ms | 1 ms | Moderate blocking on mobile |
| TTI | 18.546 s | 5.990 s | Mobile interactivity is very late in the lab model |
| Requests | 103 | 138 | High request volume |
| Transfer | 3.93 MiB | 7.73 MiB | Excessive, especially images |
| JavaScript | 0.502 MiB | 0.502 MiB | Material but not the largest byte category |
| CSS | 0.050 MiB | 0.050 MiB | Four render-blocking stylesheets |
| Images | 3.13 MiB | 6.93 MiB | Dominant root cause |

## LCP element and complete loading chain

The mobile LCP element was:

```text
div.offers-main > a.offer-primary > picture > img.offer-primary-img
```

It resolved to the mobile hero `Banner-Mobile.jpg.webp` on `app.enfantorganic.com`.

Observed trace from clean mobile sample 2:

| Stage | Duration / fact |
|---|---:|
| Document TTFB component | 931 ms |
| Resource load delay after HTML | 72 ms |
| Image transfer duration | 2,192 ms |
| Element render delay | 40 ms |
| Image request start → end | 1.003 s → 3.195 s |
| Transfer size | 225,439 bytes on the trace; file payload 224,512 bytes |
| Intrinsic dimensions | 1583×960 |
| Approximate rendered size | 380×231 |
| Priority | High |
| Protocol | HTTP/1.1 |
| Cache status in trace | no cache hit |
| Explicit preload | none observed |
| Discovery | initial HTML `<picture>`; `eager` + `fetchPriority="high"` |

The Lighthouse score’s 9.68 s simulated LCP for that sample is a Lantern model result; the observed trace breakdown totals about 3.24 s. They are different measurement models and should not be added together. The insight estimated ~184 KB could be saved on the mobile hero by right-sizing/compressing it.

The in-page trace reused browser connections and therefore could not cleanly assign a fresh DNS/TLS cost to the image itself. A separate five-sample cold-command probe of the exact mobile asset had medians of: DNS 3 ms, TCP connect 223 ms cumulative, TLS 462 ms cumulative, TTFB 864 ms, and total 1.485 s. The first sample had a 241 ms cold DNS lookup; the remaining lookups were cached. These direct-asset timings describe connection/origin behavior, not the full in-page LCP sequence.

## Root causes

### 1. CONFIRMED P2 — oversized and insufficiently responsive imagery

Images account for 3.13 MiB of the median mobile transfer. Lighthouse identified multiple large product assets, including a 4000×4000 hover image transferring ~584 KB while displayed near 320×320, with ~580 KB estimated waste. Several 1000×1000 assets transfer 140–180 KB each.

The hero does have a mobile `<source>`—the earlier handoff assumption that it had no responsive source is incorrect—but it still sends a 224 KB, 1583×960 image to a ~380-pixel viewport. The implementation uses raw `<img>` elements rather than an optimizer that generates width-specific derivatives.

Source: `frontend/components/store/home/HomeClient.jsx:154-165` and product-card image components.

### 2. CONFIRMED P2 — dynamic/no-store homepage defeats `revalidate=120`

`frontend/app/[locale]/page.jsx:4` declares `revalidate = 120`, but `frontend/lib/api.js:193` applies `cache: "no-store"` in the shared request helper. Live HTML proves the result:

```text
Cache-Control: private, no-cache, no-store, max-age=0, must-revalidate
x-nextjs-cache: absent
```

The homepage requests navigation and home data concurrently with `Promise.all`, so those two primary render fetches are not serialized. `generateMetadata` also calls home data separately; because the fetch wrapper opts out of cache, duplicate work is **SUSPECTED** but was not instrumented at request identity level.

The wrapper affects public homepage/navigation/category/product data as well as region-sensitive content. A safe fix must preserve regional price/currency correctness and avoid caching personalized endpoints.

### 3. CONFIRMED P2 — excessive HTML/RSC payload

The uncompressed homepage response is **295,604 bytes** and compressed transfer is approximately 38 KB. Compression is functioning, so wire bytes are modest, but the browser must parse a large HTML/RSC payload. Source and response inspection show substantial serialized homepage/catalog content. Exact duplicate-field attribution inside the RSC stream was not quantified; “excessive repeated data” is therefore **SUSPECTED**, while the payload size is confirmed.

### 4. CONFIRMED P2 — redirect and connection topology

- Direct `www` responses redirect to the regional hostname with median TTFB ~0.716 s before the redirected page is fetched.
- Region middleware may call external `ip-api.com` with a 1.5 s timeout when no region is known (`frontend/middleware.js:19-33`), then redirects/re-writes (`:60-93`). This external lookup is a **SUSPECTED** contributor to cold first visits; this audit did not isolate it in server traces.
- Media/API live on `app.enfantorganic.com`, so the hero needs a second origin connection.
- DNS pointed directly to `147.93.110.232`; nginx headers and lack of cache/age behavior showed no CDN edge in the tested path.

### 5. CONFIRMED P2 — third-party and JavaScript overhead

Representative mobile sample 2 transferred approximately:

| Origin/group | Requests | Transfer |
|---|---:|---:|
| `app.enfantorganic.com` | 18 | 2.51 MiB |
| `om.enfantorganic.com` | 54 | 1.07 MiB |
| TikTok | 19+ | ~171 KiB plus auxiliary requests |
| Meta | 3 | ~166 KiB |
| Snapchat | ~5 | ~26 KiB |

Lighthouse’s third-party insight attributed ~182 ms of main-thread work to Meta/TikTok/Snapchat. Boot-up auditing separately showed larger script tasks (TikTok ~317 ms, Meta events ~231 ms plus config ~111 ms, Snapchat ~97 ms). Unused JavaScript was estimated at ~147 KB with ~410 ms simulated LCP savings. Third parties matter, but image bytes and LCP delivery are larger causes.

### 6. CONFIRMED P2 — render-blocking CSS

Four stylesheets totaling ~51 KB were render-blocking, with individual observed durations of roughly 373–1,403 ms in the representative run. CSS bytes are small, but delivery sequencing affects FCP/LCP.

### 7. NOT A CURRENT BOTTLENECK — CPU, RAM, database, and warm app execution

The host snapshot showed 4 CPUs, 13 GiB available RAM, low load (0.14/0.11/0.09), and all containers well below limits. Warm internal probes through Docker nginx were:

| Endpoint | Five-sample warm range / median |
|---|---:|
| Navigation API | ~2.3–4.8 ms |
| Home API | ~2.6–3.5 ms |
| Next homepage | ~44–159 ms; median ~101 ms |

Public API medians were much higher: navigation ~704 ms, home ~655 ms, products ~770 ms. This gap points to public network/TLS/proxy variance plus cold/process-cache behavior, rather than sustained database or compute saturation.

The active Django cache is per-process `LocMemCache`, not Redis. That makes cache warmth inconsistent across backend workers and is an observability/scalability gap, but the warm API measurements do not identify backend compute as the dominant current LCP cause.

## Caching, compression, and headers

| Resource | Observed behavior |
|---|---|
| Next HTML | gzip; private/no-cache/no-store; no `x-nextjs-cache` |
| Navigation API | gzip; `max-age=180` |
| Hashed Next JS | gzip; `max-age=31536000, immutable` |
| Hero image | long browser cache (~30 days); no content encoding, appropriate for WebP |

## Recommended remediation sequence

1. **Right-size images without changing content semantics.** Generate mobile/tablet/desktop variants; use `next/image` or a controlled image loader; cap source dimensions near rendered requirements; retain high priority only for the LCP asset. Expected largest immediate LCP/transfer benefit.
2. **Separate public cacheable data from personalized data.** Remove blanket `no-store` only from public home/navigation/catalog requests, use short bounded revalidation, and validate every region/currency combination.
3. **Remove avoidable first-visit redirect work.** Prefer deterministic region selection from hostname/cookie and move best-effort geolocation off the critical path. Preserve explicit user region choice.
4. **Reduce homepage payload.** Send only fields and item counts needed above the fold; lazy-load lower sections/product hover imagery.
5. **Defer/consent-gate third parties consistently and remove redundant loaders.** Verify business attribution before eliminating tags.
6. **Move shared Django caching to Redis and add cache metrics.** Treat as a backend consistency/latency improvement, not a substitute for image work.
7. **Add field monitoring.** Capture Core Web Vitals by region/device/release with no PII and alert on p75 LCP/INP/CLS regressions.

## Acceptance criteria

- Three clean mobile runs, no overlap: median score ≥80 initially; LCP <4.0 s as an interim target, then p75 field LCP ≤2.5 s.
- Mobile image transfer <1.5 MiB initially; hero derivative close to rendered width and <80 KB subject to visual QA.
- No region/currency/stock regression across OM, AE, and SA.
- Cacheable public HTML/API responses demonstrate repeatable hit/revalidation behavior; personalized endpoints remain uncached.
- No increase in checkout/payment errors, and analytics event counts are reconciled after tag changes.

## Unknowns

- Field p75 Core Web Vitals by real device/network are unavailable because GA4/GTM/RUM is not active.
- INP is unavailable from Lighthouse lab data; TBT is used as the laboratory proxy.
- CDN provider dashboard, origin timing headers, and proxy hop timings were unavailable.
- The exact portion of HTML attributable to repeated RSC data was not computed.
