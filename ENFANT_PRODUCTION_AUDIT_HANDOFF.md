# ENFANT ORGANIC — PRODUCTION AUDIT HANDOFF

> Prepared for the next senior engineering agent tasked with auditing and optimizing the live Enfant Organic e-commerce platform.
> **This document is information-only. No production system, source file, database, DNS, or running service was modified while producing it.**
>
> Evidence legend used throughout:
> - **[CONFIRMED]** — verified directly from repo source or a read-only live probe during this handoff.
> - **[SUSPECT]** — strong hypothesis with partial evidence; must be measured before acting.
> - **[UNKNOWN]** — not verifiable from the repo/read-only access; the next agent must confirm on the server.
>
> Repo snapshot: branch `main`, latest commit `56b293e66ae8b4b45607d565e613176a4bed7334` ("fix(checkout): enable Paymob online payment for UAE region"), working tree **clean** (no uncommitted changes). Local repo path: `/Users/user/Desktop/enfhantOrganic`.

---

## 1. EXECUTIVE SUMMARY

**Architecture [CONFIRMED]**
- Frontend: **Next.js 15** (App Router) + **React 19**. Very lean dependency set (`next`, `react`, `react-dom`, `@ducanh2912/next-pwa`). PWA/service worker enabled.
- Backend: **Django + Django REST Framework**, single app `store`, JWT auth (`rest_framework_simplejwt`), `drf-spectacular` for schema.
- Database: **PostgreSQL 16** (Alpine container).
- **Redis 7** (broker/result backend for Celery; **not** used as Django cache — see below).
- **Celery** worker + beat (2 scheduled tasks).
- Reverse proxy: **two-layer nginx** (host nginx :443 TLS → docker nginx :8082 → frontend :3000 / backend :8000).

**Deployment topology [CONFIRMED]**
- Runs as Docker Compose (`docker-compose.prod.yml`) on a Hostinger VPS.
- **Region subdomains**: `om.enfantorganic.com`, `ae.enfantorganic.com`, `sa.enfantorganic.com`. `www`/apex/`app` redirect (301/302) to the resolved region subdomain.
- `app.enfantorganic.com` also serves `/media/` and `/api/` (Django) and is the image host referenced by `next/image`.
- CI/CD: **GitHub Actions** on push to `main`, two jobs — `production` (a "personal VPS") and `enfantSecrets` (the **client** Hostinger live site). Secrets injected into `.env.production` at deploy time.

**Current production status [CONFIRMED]**
- Storefront live and serving (HTTP 200 on region subdomains).
- Oman (OM) Paymob is LIVE (Unified Checkout).
- **UAE (AE) online payment is BROKEN** as of this handoff: the checkout option now renders, but payment initiation fails with "unexpected error". Root cause proven below (§10).

**Known issues already identified**
- **[CONFIRMED] UAE Paymob broken** — the UAE Unified Checkout `secret_key`/`public_key` belong to a **different Paymob profile** than the account (MID 79577) that holds the UAE integration IDs (118534 card / 118806 Apple Pay). Live intention probe returns `404 "Integration ID does not exist"`. The api_key + integration IDs themselves are valid (legacy Accept flow + iframe render both succeed).
- **[SUSPECT] Performance** — storefront pages render **dynamically per request** (`fetch` uses `cache: "no-store"` even though pages declare `revalidate = 120`), so every page load waits on the Django API. Live homepage TTFB measured ~1.6s; navigation API TTFB ~0.9s. Hero LCP image is a raw `<img>` (no `next/image` responsive srcset) served cross-origin from `app.enfantorganic.com`.
- **[CONFIRMED] Django cache is `LocMemCache`** (per-process), not Redis — no cross-worker/shared cache.
- **[CONFIRMED] Analytics/pixels are browser-side only** — no server-side Conversions API. Events lost to ad-blockers/ITP are unrecovered (relevant to "declining orders / tracking" complaint).
- **[CONFIRMED, historical, fixed this session] Abandoned-cart capture was near-zero** vs Shopify — capture was gated on a valid email/phone, and unpaid online orders instantly marked carts "recovered". Fixed in commits `9e7c817` (contact-optional capture + converted-order recovery). Verify it is deployed.
- **[CONFIRMED, historical] Out-of-stock products vanish from listings** when `track_inventory=True` and warehouse/`stock_quantity` is 0 (detail page still 200s). Data/config issue, not a code bug.
- **[SUSPECT, from prior perf note] nginx does not appear to cache pages; no CDN/Cloudflare in front; images are raw and served without an image CDN.**

**Risks already identified**
- Personal-VPS deploy job repeatedly fails on an `scp`/`tar: Cannot utime: Operation not permitted` ownership error; the **client Hostinger job succeeds**. Deploy monitoring must check *per-job* conclusions, not just the overall run.
- Region-subdomain redirect + dynamic SSR + a possible IP-geolocation lookup in middleware add serial latency on first paint.

---

## 2. REPOSITORY MAP

| Item | Path | Notes |
|---|---|---|
| Repo root | `/Users/user/Desktop/enfhantOrganic` | Git repo, branch `main` |
| Frontend | `frontend/` | Next.js 15 App Router |
| Backend | `backend/` | Django project `enfant_backend`, app `store` |
| Backend settings | `backend/enfant_backend/settings.py` | env-driven |
| Backend Dockerfile | `backend/Dockerfile` | |
| Frontend Dockerfile | `frontend/Dockerfile` | |
| Prod compose | `docker-compose.prod.yml` | 6 services |
| Dev compose | `docker-compose.yml` | |
| nginx (docker, in-container) | `deploy/nginx/default.conf` | upstreams `frontend_app`, `backend_app`; gzip; `/media` `/static` `expires 30d` |
| nginx (host reverse proxy) | `deploy/nginx/host-reverse-proxy.conf` | TLS (Let's Encrypt), 443, region/domain redirects → `127.0.0.1:8082` |
| Env example (dev) | `.env.example`, `.env` | |
| Env example (prod) | `.env.production.example` | authoritative list of prod vars |
| Deploy workflow | `.github/workflows/deploy-hostinger.yml` | 2 jobs; writes `.env.production` from secrets |
| CI workflow | `.github/workflows/ci.yml` | |
| Celery config | `backend/enfant_backend/settings.py` (`CELERY_*`, `CELERY_BEAT_SCHEDULE`), `backend/enfant_backend/celery.py` | |
| Domain models | `backend/store/domain_models/{catalog,commerce,base}.py` | re-exported by `backend/store/models.py` |
| API views | `backend/store/api_views/*.py` (`storefront.py`, `checkout.py`, `payments.py`, `admin_ops.py`, `context.py`, `regions.py`, `account.py`, `orders.py`, `whatsapp.py`) | |
| Serializers | `backend/store/api_serializers/*.py` | |
| Payment services | `backend/store/services/{payment_router,payment_config,paymob,paytabs,thawani,omannet}.py` | |
| Region seed | `backend/store/sample_data.py` (`REGIONS`, `SITE_SETTINGS`) + `manage.py seed_regions` | **re-applied on every deploy** |
| Frontend API client | `frontend/lib/api.js` | all fetches `cache: "no-store"` |
| Frontend homepage | `frontend/app/[locale]/page.jsx` | `revalidate = 120` |
| Frontend layout | `frontend/app/layout.jsx` | fonts, GTM, providers |
| Middleware (region redirect) | `frontend/middleware.js` | www→subdomain, subdomain→rewrite `?region=` |
| Cart store | `frontend/components/store/cart/StoreProvider.jsx` | localStorage guest cart |
| Checkout | `frontend/components/store/checkout/CheckoutClient.jsx` | |
| Next config | `frontend/next.config.mjs` | `next-pwa`, image config |
| Static/media storage | Docker volumes `static-data` (`/app/staticfiles`, WhiteNoise) and `media-data` (`/app/media`) | |
| Deployment scripts | `scripts/deploy-production.sh`, `scripts/validate-production-env.sh` | |
| Existing docs | `CODEX_HANDOFF.md` (gitignored), `DEPLOYMENT.md`, `AUDIT_REPORT.md`, `ADMIN_GUIDE.md`, `CONTEXT.md`, `docs/` | read these before starting |

Branch: `main`. Latest commit: `56b293e`. Uncommitted changes: **none**.

---

## 3. PRODUCTION INFRASTRUCTURE

- **Hostinger VPS** — IP `147.93.110.232`. SSH alias `enfant-vps` (also referenced as `personalVps` in some config). Real client deploy path: `/home/deploy/...` (NOT `/home/tayyab`). Hostinger MCP VM id `1683732`. **[CONFIRMED via prior session notes; re-verify on server.]**
- **Two live server targets exist** and must not be confused:
  - `enfantSecrets` GitHub environment → **client Hostinger** live site (`www.enfantorganic.com` / `app.enfantorganic.com` / region subdomains). **This is production.**
  - `production` GitHub environment → a **personal VPS** kept on test/sandbox payment creds (its deploy job currently fails on an ownership error; not customer-facing).
- **OS**: Ubuntu (host nginx banner `nginx/1.24.0 (Ubuntu)`). Kernel/version **[UNKNOWN — confirm with `uname -a`]**.
- **CPU / RAM / disk usage**: **[UNKNOWN]** — must measure on server (`free -h`, `df -h`, `nproc`, `docker stats`). Prior note: server was not resource-starved, but re-measure.
- **Docker / Compose versions**: **[UNKNOWN — `docker version`, `docker compose version`]**. Compose file is v2 syntax (`docker compose`, healthchecks, `deploy.resources.limits`).
- **Running containers [CONFIRMED from compose]**: `db` (postgres:16-alpine), `redis` (redis:7-alpine), `backend` (gunicorn), `celery_worker`, `celery_beat`, `frontend` (next start), `nginx` (nginx:1.27-alpine). Verify actual running set with `docker compose ps`.
- **Ports / internal mapping [CONFIRMED]**:
  - Docker `nginx` publishes `127.0.0.1:${HTTP_PORT:-8082}:80` (loopback only).
  - `backend` exposes `8000` (internal), `frontend` exposes `3000` (internal).
  - Docker nginx upstreams: `frontend_app` → frontend:3000, `backend_app` → backend:8000.
  - Host nginx (system, port 443/80) reverse-proxies to `127.0.0.1:8082`.
- **Reverse proxy [CONFIRMED]**: host nginx terminates TLS and proxies to docker nginx; docker nginx routes `/api/` + `/django-admin/` → backend, `/media/` + `/static/` (expires 30d) locally, everything else → frontend.
- **SSL/domains [CONFIRMED]**: Let's Encrypt cert at `/etc/letsencrypt/live/www.enfantorganic.com/`. Host nginx: HTTP→HTTPS 301; apex `enfantorganic.com` → `www`; `www`/`app`/region subdomains served. Backend trusts `X-Forwarded-Proto` (`SECURE_PROXY_SSL_HEADER`).
- **CDN / Cloudflare**: **[SUSPECT: none]** — server banner is raw nginx, images served directly from `app.enfantorganic.com/media`. Confirm DNS/`whatsmydns` and response headers for any proxy layer.
- **Production domains [CONFIRMED]**: `www.enfantorganic.com` (primary), `enfantorganic.com` (apex→www), `app.enfantorganic.com` (api/media/admin + 301→www for pages), region subdomains `om./ae./sa.enfantorganic.com`.
- **Staging domains**: `enfhantorganic.itwing.cloud` appears as the personal-VPS `PRODUCTION_DOMAIN` default. Treat as **non-client staging/test [UNKNOWN — confirm]**.

---

## 4. DEPLOYMENT PROCESS

**Trigger [CONFIRMED]**: push to `main` runs `.github/workflows/deploy-hostinger.yml` (two jobs). No manual `workflow_dispatch` observed.

**Per-job flow [CONFIRMED]** (`appleboy/ssh-action` runs on the target server):
1. `cd` to deploy path; `rm -f .env.production` (avoids root-owned file blocking the heredoc).
2. Write `.env.production` from GitHub environment secrets (heredoc).
3. `chmod 600 .env.production`.
4. `bash scripts/validate-production-env.sh .env.production` (guards required vars / expected domain).
5. `docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build --remove-orphans`.
6. `docker compose ... restart nginx`.
7. `docker compose ... ps` + `logs nginx --tail=100`.
8. `docker compose ... exec -T backend python manage.py check`.
9. `docker compose ... exec -T backend python manage.py seed_regions` — **re-applies region config on every deploy** (blank/empty fields overwritten from `sample_data.py`; non-empty existing fields preserved unless `--force`).
10. Assert `DJANGO_ALLOWED_HOSTS` contains the domain; `nginx -t`.
11. Post-deploy: verify public site + API steps.

**Migrations / static / seed [CONFIRMED]** happen inside the **backend container start command** (`docker-compose.prod.yml`):
```
python manage.py migrate &&
python manage.py collectstatic --noinput &&
python manage.py ensure_hero_promo_cards &&
python manage.py update_hero_promo_images_v2 &&
python manage.py ensure_regional_product_prices &&
gunicorn enfant_backend.wsgi:application --bind 0.0.0.0:8000 --workers ${GUNICORN_WORKERS:-3} --timeout ${GUNICORN_TIMEOUT:-60}
```
So **migrations auto-run on every container (re)start** — no manual migration gate.

**Frontend build [CONFIRMED]**: `frontend/Dockerfile` builds with `next build` during `docker compose up --build`; served by `next start` (standalone/`.next`).

**Static collection [CONFIRMED]**: `collectstatic` → WhiteNoise (`CompressedManifestStaticFilesStorage`) into the `static-data` volume; nginx serves `/static/` and `/media/` with `expires 30d`.

**Rollback procedure**: **[UNKNOWN / none codified]** — no blue-green or tagged-image rollback in the workflow. Rollback today = revert the git commit and redeploy, or `docker compose up` a prior image (images are rebuilt, not tagged/pinned). **Flag as a gap.**

**Backups**: **[UNKNOWN]** — no automated DB backup step in the workflow. `prod_db.dump` / `prod_data.json` exist in the repo root (one-off snapshots, dated 2026-06-14). Confirm whether Hostinger snapshot backups or a cron `pg_dump` exist.

**Zero-downtime**: **[CONFIRMED: NO]** — `docker compose up -d --build` rebuilds and recreates containers; backend runs migrations on start. Brief downtime/ററ during recreate is expected.

**Dangerous / manual steps**:
- `up -d --build` rebuilds images in-place on the production host (no staging image promotion).
- `migrate` runs unconditionally at container start (an unreviewed migration ships automatically with a push).
- `seed_regions` can overwrite region config from `sample_data.py` — a raw DB edit to region config is reverted on next deploy.
- `.env.production` is regenerated entirely from secrets each deploy — a manually-set var on the server that is not in the workflow will be lost.

---

## 5. ENVIRONMENT VARIABLES (names + purpose only — no values)

Sources: `backend/enfant_backend/settings.py`, `.env.production.example`, and the deploy workflow heredoc. **Location column**: `enfantSecrets` = GitHub environment secret store for the client production site; `.env.production` = the generated on-server file; `next build args` = baked into the frontend image at build.

### Django
| Var | Purpose | Location |
|---|---|---|
| `DJANGO_SECRET_KEY` | Django secret | enfantSecrets → .env.production |
| `DJANGO_DEBUG` | debug flag (`0` in prod) | .env.production (hardcoded 0) |
| `DJANGO_ALLOWED_HOSTS` | allowed hosts | enfantSecrets |
| `DJANGO_CORS_ALLOWED_ORIGINS` | CORS allowlist | enfantSecrets |
| `DJANGO_CSRF_TRUSTED_ORIGINS` | CSRF trusted origins | enfantSecrets |
| `DJANGO_SECURE_SSL_REDIRECT`, `DJANGO_SESSION_COOKIE_SECURE`, `DJANGO_CSRF_COOKIE_SECURE`, `DJANGO_SECURE_HSTS_SECONDS`, `DJANGO_SECURE_HSTS_INCLUDE_SUBDOMAINS`, `DJANGO_SECURE_HSTS_PRELOAD`, `DJANGO_SESSION_COOKIE_SAMESITE`, `DJANGO_SECURE_REFERRER_POLICY` | security hardening toggles | .env.production / defaults |
| `GUNICORN_WORKERS`, `GUNICORN_TIMEOUT`, `BACKEND_MEMORY_LIMIT`, `BACKEND_CPU_LIMIT` | runtime tuning | compose / .env.production |

### PostgreSQL
`POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_HOST` (=`db`), `POSTGRES_PORT`, `POSTGRES_CONN_MAX_AGE` — DB connection. Location: enfantSecrets → .env.production (host/port set by compose).

### Redis
`REDIS_HOST` (=`redis`), `REDIS_PORT`, `REDIS_PASSWORD` — Redis connection. Location: compose env + enfantSecrets.

### Celery
`CELERY_BROKER_URL` (default `redis://…/0`), `CELERY_RESULT_BACKEND` (default `…/1`), `CELERY_CONCURRENCY`, `CELERY_MEMORY_LIMIT`, `CELERY_CPU_LIMIT`. Location: settings defaults + compose.

### Next.js (frontend)
`NEXT_PUBLIC_API_BASE_URL` (browser→API), `API_INTERNAL_BASE_URL` (server→`http://backend:8000/api`), `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`, `NEXT_OUTPUT_FILE_TRACING_ROOT`, `HTTP_PORT` (docker nginx publish port), `COMPOSE_PROJECT_NAME`. Location: enfantSecrets → .env.production + next build args.

### Payments
- Global/Oman: `PAYMOB_API_KEY`, `PAYMOB_INTEGRATION_ID`, `PAYMOB_IFRAME_ID`, `PAYMOB_HMAC_SECRET`, `PAYMOB_BASE_URL`, `PAYMOB_CURRENCY`, `PAYMOB_SECRET_KEY`, `PAYMOB_PUBLIC_KEY`, `PAYMOB_USE_UNIFIED_CHECKOUT`, `PAYMOB_APPLE_PAY_INTEGRATION_ID`, `PAYMOB_APPLE_PAY_IFRAME_ID`, `PAYMOB_SHARED_ACCOUNT`, `PAYMOB_PUBLIC_BASE_URL`, `NEXT_PUBLIC_PAYMOB_APPLE_PAY_INTEGRATION_ID`.
- Per-region (suffix `_OM` / `_SA` / `_AE`): `PAYMOB_API_KEY_*`, `PAYMOB_INTEGRATION_ID_*`, `PAYMOB_IFRAME_ID_*`, `PAYMOB_HMAC_SECRET_*`, `PAYMOB_BASE_URL_*`, `PAYMOB_CURRENCY_*`, `PAYMOB_SECRET_KEY_*`, `PAYMOB_PUBLIC_KEY_*`, `PAYMOB_APPLE_PAY_INTEGRATION_ID_*`.
- Other providers (mostly placeholder/disabled): `PAYTABS_*`, `THAWANI_*`, `HYPERPAY_*`, `TELR_*`, `OMANNET_*`.
- Location: enfantSecrets → .env.production. **Note:** the deploy heredoc currently writes only a subset of AE vars — verify all needed `_AE` vars are wired (this was recently expanded).

### Email
`DEFAULT_FROM_EMAIL`, `EMAIL_BACKEND`, `EMAIL_HOST`, `EMAIL_PORT`, `EMAIL_HOST_USER`, `EMAIL_HOST_PASSWORD`, `EMAIL_USE_TLS`, `EMAIL_REQUIRE_SMTP`. Location: enfantSecrets → .env.production. (SMTP historically not fully configured → email/SMS gated by `EMAIL_REQUIRE_SMTP`.)

### SMS
`SMS_DEFAULT_PROVIDER`, `SMS_ENABLE_MOCK`, `UNIFONIC_APP_SID`, `UNIFONIC_SENDER_ID`, `UNIFONIC_AUTH_TOKEN`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER`, `TWILIO_MESSAGING_SERVICE_SID`. Location: compose env + enfantSecrets.

### Analytics (GA/GTM)
`NEXT_PUBLIC_GTM_ID` (GTM/GA4 loader), plus GA4/Ads IDs stored in **SiteSettings DB** and surfaced via `/api/navigation/` (`ga4_measurement_id`, `gtm_container_id`, `google_ads_conversion_id`). Location: next build arg + admin DB.

### Meta Pixel
Pixel ID is **admin-managed in DB** (SiteSettings/Navigation), surfaced via `/api/navigation/`, plus `NEXT_PUBLIC_META_PIXEL_ID` build arg. Location: enfantSecrets/build arg + admin DB.

### Snapchat
`NEXT_PUBLIC_SNAPCHAT_PIXEL_ID` + admin DB. Location: build arg + admin DB.

### TikTok
`NEXT_PUBLIC_TIKTOK_PIXEL_ID` + admin DB (client must set the TikTok ID in admin per prior notes). Location: build arg + admin DB.

### Storage / CDN
`NEXT_PUBLIC_APP_URL` / image host `app.enfantorganic.com` (in `next.config.mjs` `remotePatterns`). Cloudinary vars exist in SiteSettings (`cloudinary_*`) but storage backend is **local FileSystemStorage** (`STORAGES.default`). No CDN configured in code.

### Security
Covered under Django (HSTS, cookie flags, CORS, CSRF). CSP is enforced by **nginx** (`$csp_default` in `deploy/nginx/default.conf`), not Django.

### Region configuration
Region behavior (currencies, `fx_rate`, `payment_enabled_providers`, `payment_supported_methods`, seller/legal fields) is seeded from `backend/store/sample_data.py` (`REGIONS`) via `seed_regions`; the `PAYMOB_*_{OM,SA,AE}` env vars supply per-region gateway creds. `PAYMOB_SHARED_ACCOUNT` toggles the OMR fallback mode.

---

## 6. APPLICATION ARCHITECTURE

### Backend [CONFIRMED]
- **Django apps**: one first-party app `store` (plus DRF, simplejwt token_blacklist, django_filters, drf_spectacular, corsheaders, whitenoise).
- **Models** (`store/domain_models/{catalog,commerce}.py`, ~38 model classes): 
  - Catalog: `Product`, `Category`, `Tag`, `ProductGalleryImage`, `ProductPrice`, `ProductStock`, `Warehouse`, `Region`, `SiteSettings`, `PaymobRegionConfig`, `TaxRate`/`TaxRule`, `HeroPromoCard`, `InstagramPost`, `BlogPost`, `CmsPage`, `Testimonial`, `Coupon`, `GiftCard`.
  - Commerce: `Order`, `OrderItem`, `OrderStatusHistory`, `PaymentTransaction`, `AbandonedCart`, `CustomerAddress`, `Review`, `NewsletterSubscription`, `ReturnRequest`, `WishlistItem`, `CartMilestone`, `NotificationLog`, `WhatsAppLog`, `AnalyticsEvent`, `AdminAuditLog`, `PushDevice`, `ShippingRule`, `BackInStockRequest`, `GiftCardRedemption`.
- **Storefront APIs** (`store/urls.py`, `api_views/storefront.py`):
  - Homepage: `GET /api/home/` (`HomePageView`) + `GET /api/navigation/` (`NavigationView`).
  - Products: `GET /api/products/`, `GET /api/products/<slug>/`, `GET /api/catalog/`, `GET /api/search/suggestions/`.
  - Cart: no server cart — cart is client-side (see frontend). Pricing/repricing via product/catalog endpoints + coupon validate.
  - Checkout: `POST /api/checkout/` (`CheckoutView` → `api_serializers/checkout.py`).
  - Payments: `POST /api/payments/initiate/`, `POST /api/payments/retry/`, `POST /api/payments/webhook/` (+ per-provider), `GET /api/payments/status/<order_number>/`.
- **Product visibility gates** (`api_views/context.py::product_queryset` + `services/stock.py`): `is_published=True` AND a `ProductPrice` for the region AND (if `track_inventory`) available warehouse stock. (This is why zero-stock tracked products disappear from lists.)
- **Auth**: JWT (`rest_framework_simplejwt`) with token blacklist; admin capabilities via role groups (`services/admin_roles.py`, `HasAdminCapability`).
- **Region/currency**: `Region` model with `fx_rate`; `ProductPrice` per region; middleware + `resolveServerRegion` pick region; shared-account Paymob converts to OMR when a region borrows Oman.
- **Inventory**: `Warehouse` + `ProductStock` (per-region), `Product.track_inventory`/`stock_quantity`; `services/stock.py` for fulfillability + reservation/deduction.
- **Payment gateways**: `services/payment_router.py` (registry) → Paymob (active), PayTabs/Thawani/Telr/OmanNet/HyperPay (placeholder/disabled). Config resolution in `services/payment_config.py` (per-region).
- **Background jobs (Celery)**: notifications/emails, invoice generation (`generate_order_invoice_async`), inventory health email, session cleanup. Beat: `clear_expired_sessions` (00:00), `send_daily_inventory_health_email` (09:00).
- **Caching**: `CACHES = LocMemCache` (per-process, **not** Redis) — no shared cache. API responses set `Cache-Control: max-age=180` on some endpoints (nginx/DRF), but Django-side object caching is minimal.
- **Logging/monitoring**: **no `LOGGING` dict, no Sentry/APM configured** in settings — relies on default Django logging → stdout → Docker logs. **[Observability gap.]**

### Frontend [CONFIRMED]
- **Next.js 15**, **App Router** (`frontend/app/`, `[locale]` segment for `en`/`ar`).
- **Rendering strategy**:
  - Homepage/product/category/collections/blog: `export const revalidate = 120` (declares ISR) **but** all data fetches use `fetch(..., { cache: "no-store" })` in `lib/api.js` → **effectively dynamic SSR per request** (revalidate is overridden). No `x-nextjs-cache` HIT observed on live.
  - Thank-you page: explicit `cache: "no-store"`.
  - Checkout/cart/account: client components (CSR for interactivity) inside a server shell.
- **API client**: `frontend/lib/api.js` — server-side uses `API_INTERNAL_BASE_URL` (`http://backend:8000/api`), browser uses `NEXT_PUBLIC_API_BASE_URL`; `AbortController` timeout; `no-store`.
- **State management**: React Context (`StoreProvider` split into STATE/ACTIONS contexts) + `LocaleProvider`. Cart persisted in **localStorage** (`CART_STORAGE_KEY`), guest-first.
- **Image handling**: `next/image` via wrapper `components/ui/SiteImage.jsx` (optimizes only `app.enfantorganic.com`/localhost hosts); **homepage hero uses a raw `<img>`** with `loading="eager" fetchPriority="high"` (not `next/image`). Formats `avif`/`webp`; `deviceSizes`/`imageSizes` configured.
- **Fonts**: `next/font/google` `Noto_Sans_Arabic` (self-hosted by Next font pipeline) — good (no render-blocking external font CSS for Arabic). Latin font source **[UNKNOWN — confirm in `globals.css`/layout]**.
- **Third-party scripts**: GTM/GA4 (`GtmScript`, injected client-side if `NEXT_PUBLIC_GTM_ID`), Meta/TikTok/Snapchat pixels (loaded client-side, IDs from `/api/navigation/`), Google Maps JS (checkout address). WhatsApp floating button.
- **Cookie/consent**: region cookie `enfant-region`; consent gating referenced in `ProductDetailClient` (pixels respect a consent state). Exact consent banner/CMP **[UNKNOWN — confirm]**.
- **PWA**: `@ducanh2912/next-pwa` service worker; navigation + sensitive routes forced `NetworkOnly`. **Known gotcha**: stale service workers have caused admin "Failed to fetch"; SW must be *unregistered* (cache-clear insufficient).
- **Bundle-heavy deps**: dependency list is minimal (no chart/moment/lodash bloat). Main weight is app code + pixels. Confirm with a real bundle analysis.

---

## 7. PERFORMANCE-CRITICAL CODE PATHS

| Path | File | Purpose | Blocks render? | Server/Client | Concern |
|---|---|---|---|---|---|
| Homepage render | `frontend/app/[locale]/page.jsx` | SSR homepage; `Promise.all(getNavigation, getHome)` | Yes (server awaits API) | Server | `no-store` → dynamic every request; TTFB tied to API |
| Hero/banner | `page.jsx` L149-210 (`<img src={heroPrimary.image} eager fetchPriority=high>`) | LCP element | Yes (LCP) | Server-rendered `<img>` | **Raw `<img>`, no `next/image` responsive srcset**; cross-origin `app.enfantorganic.com`; desktop banner may be served to mobile unless `image_mobile` `<source>` present |
| Above-the-fold | `page.jsx` hero section + `StorefrontShell` | header + hero | Yes | Server | fine structurally; depends on hero image + API |
| Header/nav | `frontend/components/layout/StorefrontShell.jsx` + `NavigationView` data | nav, region, cart icon | Yes | Server shell + client cart | nav data from `/api/navigation/` (~0.9s TTFB); prior note: nav N+1 (~68 queries) |
| Product listing | `frontend/components/store/catalog/ProductCollectionClient.jsx`, `ProductRail.jsx`, `cards/ProductCard.jsx` | grids/rails | Partly | Server data + client interactivity | image count; stock gating |
| Product image | `components/ui/SiteImage.jsx` | `next/image` | Lazy below fold | Client-hydrated | OK; but rail images may be many |
| Region detection | `frontend/middleware.js` | www→subdomain 302; IP-geo fallback | Yes (redirect hop) | Edge/server middleware | first-visit IP geolocation lookup adds latency; extra redirect hop |
| Currency loading | `Region` + `ProductPrice` via `/api/navigation` + `/api/home` | prices per region | Yes | Server | part of the API payload latency |
| Cart init | `frontend/components/store/cart/StoreProvider.jsx` | hydrate cart from localStorage | No (post-hydration) | Client | fine; guest cart local |
| Session/user init | JWT in localStorage; `StoreProvider`/account context | auth state | No | Client | fine |
| Analytics scripts | `components/store/analytics/GtmScript.jsx` + pixel loaders | GTM/GA/pixels | No (async) | Client | 3–4 third-party scripts; main-thread cost on mobile |
| Initial-load API calls | `lib/api.js` (`getNavigationData`, `getHomePageData`) | homepage data | Yes | Server | two parallel calls, each ~0.9–1.0s; `no-store` |

---

## 8. LIGHTHOUSE AND CORE WEB VITALS

Client-reported: Performance ≈ 64, Speed Index ≈ 11.5s, LCP ≈ 8.3s (mobile).

**Confirmed findings (repo + read-only live probes):**
- **Dynamic SSR on every request.** `lib/api.js` forces `cache: "no-store"`; pages' `revalidate = 120` is therefore not honored (no ISR HIT header seen). Every page load blocks on the Django API. Live: `www/en` → 302 → `om.enfantorganic.com/en` with final **TTFB ≈ 1.6s**, HTML document **≈ 296 KB**.
- **Navigation/home API latency.** `/api/navigation/` **TTFB ≈ 0.9s** (`Cache-Control: max-age=180`). Two such calls gate the homepage.
- **Region redirect hop.** `www`→region-subdomain **302** on entry; measured 0.7–1.7s for the redirect leg alone. Adds a full round-trip before the page even starts.
- **Hero LCP is a raw `<img>`** (not `next/image`): no automatic responsive `srcset`, served from a **different origin** (`app.enfantorganic.com`) than the page origin (`om.enfantorganic.com`) → extra connection setup. Measured hero: `Banner-WEB.jpg.webp`, **165 KB webp**, image TTFB ≈ 0.98s.
- **Django cache = LocMemCache** (not shared) — repeated identical API renders are not cheaply cached across workers.
- **Analytics/pixels are client-side** (GTM + Meta/TikTok/Snapchat) — main-thread + network cost on mobile.

**Strong suspects (measure to confirm):**
- LCP ≈ 8.3s is most plausibly: redirect hop + dynamic SSR waiting on ~0.9–1.6s API + cross-origin non-`next/image` hero, compounded on throttled mobile/3G.
- Speed Index ≈ 11.5s: heavy above-the-fold HTML (~296 KB) + third-party scripts + late hero paint.
- No CDN in front of HTML or media (raw nginx) → all bytes from the origin VPS.
- `gzip` is on in docker nginx (`gzip_comp_level 5`), but **brotli not configured**; confirm `Content-Encoding` actually applied at the host-nginx edge for HTML (the earlier `curl -I` did not show `content-encoding` on the 302 — re-check on the 200 page).

**Unknowns requiring measurement:**
- Real Lighthouse trace (LCP element, TBT, unused JS/CSS, main-thread time).
- Whether the hero `image_mobile` `<source>` is populated for the live banners (if not, desktop banner ships to mobile).
- JS bundle size per route (`next build` output / analyzer).
- Backend query profile for `/api/home` and `/api/navigation` (N+1?), DB timing.
- Host-nginx cache headers on `_next/static/*` (immutable caching?), and whether static assets get long `max-age`.
- Server CPU/RAM under load (could inflate API TTFB).

Do **not** assert a single root cause — the LCP is a chain (redirect → dynamic SSR → API wait → cross-origin hero). Fix candidates should be measured individually.

---

## 9. CART AND CHECKOUT FLOW

**Cart [CONFIRMED]**
- Storage: **client-side localStorage** (`StoreProvider.jsx`, `CART_STORAGE_KEY`); guest-first, no server cart model. Auth state (JWT) is separate; cart persists across guest/auth.
- Add-to-cart: `components/cards/ProductCard.jsx`, `components/store/product/QuickViewModal.jsx`, `ProductDetailClient.jsx` → `StoreProvider` actions. Stock respected (post out-of-stock fix).
- Repricing: cart re-fetches prices per region (`repricingInFlight`) to keep currency correct.

**Region/shipping/coupon/tax [CONFIRMED]**
- Region: middleware + `resolveServerRegion` / `enfant-region` cookie / subdomain.
- Shipping: `ShippingRule` + `services/carrier_router.py`; region `shipping_fee`/`shipping_threshold`.
- Coupon: `POST /api/coupons/validate/` (`CouponValidationView`); gift cards `POST /api/gift-cards/validate/`.
- Tax: `TaxRate`/`TaxRule` per region (VAT), applied in checkout serializer.

**Checkout → payment [CONFIRMED]**
- `POST /api/checkout/` → `api_serializers/checkout.py::create` builds the `Order` + `OrderItem`s, computes totals, reserves stock, records `conversion_session_key` (from client `getOrCreateSessionKey()` localStorage UUID), and — **only for a converted order** (paid, or offline COD/WhatsApp/bank) — marks matching `AbandonedCart`s recovered (`services/abandoned_carts.recover_carts_for_order`).
- Online orders are created **UNPAID/pending** first, then payment is initiated.
- Payment initiation: `services/payment_router.initiate_payment` → Paymob. If `PAYMOB_USE_UNIFIED_CHECKOUT` + secret/public keys present → `paymob.initiate_unified_checkout` (`POST {root}/v1/intention/`, returns hosted `redirect_url`). Else legacy Accept flow → `/acceptance/iframes/<iframe_id>?payment_token=…`.
- Frontend (`CheckoutClient.jsx`) submits, then follows `redirect_url`/`iframe_url`.

**Callback / confirmation / failure / recovery [CONFIRMED]**
- Webhook: `POST /api/payments/webhook/` (`PaymobWebhookView`, `api_views/payments.py`) verifies HMAC (per-region secret), marks `payment_status=paid` + transitions `Order.status`, commits reserved inventory, generates invoice (async), and now recovers the abandoned cart on paid.
- Confirmation: `GET /api/orders/<order_number>/`, thank-you page (`app/[locale]/thank-you/[orderNumber]/page.jsx`, `no-store`), `PurchaseEventTracker` fires Purchase.
- Failure: webhook `failed/cancelled` → `Order.status = FAILED`; `POST /api/payments/retry/` supports retry ("Retry payment for this order" UI).
- Abandoned recovery: `AbandonedCartCreateView` (`POST /api/abandoned-carts/`) + `AdminAbandonedCartListView` reconciliation, both gated on the converted-order predicate.

**Files/endpoints/models/services**: `CheckoutClient.jsx`, `checkout.py` (view + serializer), `payments.py`, `services/{payment_router,payment_config,paymob,abandoned_carts,stock}.py`; models `Order`, `OrderItem`, `PaymentTransaction`, `AbandonedCart`, `ProductStock`, `Coupon`, `TaxRate`.

---

## 10. PAYMENT INTEGRATIONS

**Registry**: `backend/store/services/payment_router.py` (`PROVIDER_REGISTRY`). Active provider: **Paymob**. `PayTabs`, `Thawani`, `Telr`, `OmanNet`, `HyperPay` are placeholder/disabled.

### Paymob (OM, AE; SA borrows OM in shared mode)
- **Files**: `services/paymob.py` (auth/order/payment_key, unified checkout, apple pay), `services/payment_config.py` (per-region cred resolution), `api_views/payments.py` (initiate/retry/webhook), `PaymobPaymentProvider` in `payment_router.py`.
- **Frontend initiation**: `CheckoutClient.jsx` (`applePayExpress` path sets `payment_type: "apple_pay"`; card path uses default online provider).
- **Backend logic**: Unified Checkout Intention API (`POST {root}/v1/intention/` with `Authorization: Token <secret_key>`, `payment_methods=[card_integration, apple_pay_integration]`) when enabled; else legacy Accept iframe.
- **Callback/Webhook URL**: `https://app.enfantorganic.com/api/payments/webhook/` (processed/transaction); response/return: `https://app.enfantorganic.com/checkout/return`. These must be set on each **integration** in the Paymob dashboard.
- **Signature verification**: HMAC per-region (`PAYMOB_HMAC_SECRET[_AE/_SA]`), verified in `PaymobWebhookView`.
- **Idempotency / duplicate protection**: webhook checks existing `PaymentTransaction` for the reference before re-processing ("already_processed"); `Order.status` transitions guarded by `can_transition_to`.
- **Logging**: `logger.info/exception` in `paymob.py`/`payments.py` → Docker logs (no external sink).
- **Production config status [CONFIRMED]**:
  - **OM**: LIVE, Unified Checkout, account MID 60800, `oman.paymob.com`, integrations 70097 (card) / 70096 (Apple Pay), iframe 60088, global `PAYMOB_SECRET_KEY`/`PUBLIC_KEY` = `omn_*`.
  - **AE**: **BROKEN.** Account MID 79577, `uae.paymob.com`, integrations 118534 (card) / 118806 (Apple Pay), iframe 43861. `api_key` (JWT profile_pk 79577) + integration IDs are **valid** (legacy Accept flow created order 25211617 + payment_key; iframe 43861 renders HTTP 200). **The Unified Checkout `secret_key`/`public_key` (`are_sk_live_aa1485…` / `are_pk_live_bklYmt…`) belong to a different Paymob profile** → intention API returns `404 "Integration ID does not exist"`. **Fix = obtain the correct secret+public keys from the MID 79577 account, OR switch AE to the (working) legacy iframe flow.** Callbacks for 118534/118806 must also be repointed in the UAE dashboard.
  - **SA**: no own creds; borrows OM in shared-account mode (charges converted to OMR) OR shown as COD-only depending on `payment_enabled_providers`.
- **Known issues**: MIGS integrations don't render in the legacy embeddable iframe **for Oman** (they 302 to a malformed URL) — hence Unified Checkout; **for UAE the legacy iframe DID render 200** (viable fallback). Apple Pay via legacy needs a per-account `apple_pay_iframe_id` (currently resolved account-global — a gap for a second account).

### PayTabs / Thawani / Telr / OmanNet / HyperPay
- Files present (`services/paytabs.py`, `services/thawani.py`, `services/omannet.py`; Telr/HyperPay placeholders). Webhooks wired (`/api/payments/webhook/{paytabs,thawani,omannet}/`). **Not enabled in production** (no creds / `payment_enabled_providers` excludes them). Treat as inactive.

### Apple Pay
- Delivered through Paymob (Unified Checkout hosted page presents it, or legacy `initiate_apple_pay_payment`). Frontend Apple Pay express button only renders on Apple devices (`window.ApplePaySession`). Badge shown when `NEXT_PUBLIC_PAYMOB_APPLE_PAY_INTEGRATION_ID` is set (global build arg).

---

## 11. ANALYTICS AND CONVERSION TRACKING

**Setup [CONFIRMED]**
- **GA4 / GTM**: `components/store/analytics/GtmScript.jsx` (loads `gtm.js` if `NEXT_PUBLIC_GTM_ID`); dataLayer events pushed via `pushDataLayerEvent`.
- **Meta Pixel** (`fbqTrack`), **TikTok Pixel** (`ttqTrack`), **Snapchat Pixel** (`snaptr`): loaded client-side; IDs are **admin-managed in DB** and surfaced via `/api/navigation/` (plus `NEXT_PUBLIC_*_PIXEL_ID` build args). TikTok ID historically pending client entry in admin.
- All tracking is **browser-side only — no server-side Conversions API / CAPI**. [CONFIRMED]

**Event logic (files) [CONFIRMED]**
| Event | File | Trigger |
|---|---|---|
| ViewContent | `components/store/product/ProductDetailClient.jsx` (~L380) | product page view (Meta/TikTok/Snap) |
| AddToCart | `components/store/product/QuickViewModal.jsx`, `cards/ProductCard.jsx`, `ProductDetailClient.jsx` | add-to-cart |
| InitiateCheckout / begin_checkout | `components/store/checkout/CheckoutClient.jsx` (~L1229–1250) | checkout mount |
| AddPaymentInfo | `CheckoutClient.jsx` (~L1361–1385) | on submit (payment method chosen) |
| Purchase | `components/store/analytics/PurchaseEventTracker.jsx` | thank-you page, once per order |

**Deduplication / guards [CONFIRMED]**
- Purchase dedup: `markPurchaseEventFired`/`hasPurchaseEventFired` keyed by `order_number` + a `firedRef`; `isPurchaseTrackable(order)` blocks Purchase for failed orders (purchase-guard).
- Storefront pageview tracker (`StorefrontPageViewTracker`) uses `buildPageViewTrackingKey` to avoid duplicate pageviews.

**Consent / region behavior**
- Region cookie drives region; pixels respect a consent state (referenced in `ProductDetailClient`). Exact CMP/consent banner and default (opt-in vs opt-out) **[UNKNOWN — confirm]**.

**Risks [SUSPECT — highly relevant to "declining orders" complaint]**
- **No server-side CAPI** → Purchase/AddToCart events suppressed by ad-blockers, iOS ITP, or consent-declined are permanently lost → **under-reported conversions** in Meta/TikTok, which can (a) mislead the client into thinking orders dropped more than they did, and (b) starve ad-optimization signals → fewer conversions over time.
- **Client-side Purchase only** fires on the thank-you page; if users abandon on the Paymob hosted page (or the redirect back fails), Purchase never fires even for paid orders → measure webhook-paid vs Purchase-fired counts.
- Duplicate-event risk is mitigated by order-keyed dedup, but re-visiting the thank-you URL / multiple pixels loaded twice should be checked.
- **Missing-event risk**: if pixel IDs aren't set in admin for a region, no events fire there.

---

## 12. ORDER-DECLINE INVESTIGATION DATA

**Available comparison data**
- **Orders / revenue / payment-status trends**: in Postgres (`Order`, `PaymentTransaction`) — queryable as safe aggregates.
- **Checkout funnel**: `AbandonedCart` (now capturing contact-optional post-fix), `AnalyticsEvent` model, GA4/GTM + pixel dashboards.
- **Add-to-cart / initiate-checkout / view-content rates**: from GA4 + Meta/TikTok dashboards (client-side only — under-counts).
- **Payment success/failure**: `Order.payment_status` + `PaymentTransaction.status` + `OrderStatusHistory`.
- **Device / country / source breakdown**: GA4 (and `AnalyticsEvent` if it records UA/region).
- **Page speed by device**: Lighthouse / CrUX / GA4 (needs live runs).
- **Error logs**: Docker logs (Django/gunicorn, celery, nginx) — no aggregated store.
- **Pre-launch (Shopify) vs post-launch**: **[UNKNOWN in this system]** — Shopify order history lives in Shopify, not this DB. The client must export Shopify order/traffic history for a true before/after.

**Safe aggregate SQL (read-only; run with a read-only role if possible). Never SELECT customer PII columns.**
```sql
-- Orders per day (last 60 days)
SELECT date_trunc('day', created_at) AS day, COUNT(*) AS orders
FROM store_order
WHERE created_at >= now() - interval '60 days'
GROUP BY 1 ORDER BY 1;

-- Revenue per day (paid only)
SELECT date_trunc('day', created_at) AS day,
       SUM(grand_total) AS revenue, currency_code
FROM store_order
WHERE payment_status = 'paid' AND created_at >= now() - interval '60 days'
GROUP BY 1, currency_code ORDER BY 1;

-- Payment status counts (last 30 days)
SELECT payment_status, status, COUNT(*)
FROM store_order
WHERE created_at >= now() - interval '30 days'
GROUP BY 1, 2 ORDER BY 3 DESC;

-- Payment method / provider split
SELECT payment_method, COUNT(*)
FROM store_order
WHERE created_at >= now() - interval '30 days'
GROUP BY 1 ORDER BY 2 DESC;

-- Region breakdown
SELECT r.code, COUNT(*) AS orders, SUM(o.grand_total) AS revenue
FROM store_order o JOIN store_region r ON r.id = o.region_id
WHERE o.created_at >= now() - interval '30 days'
GROUP BY 1 ORDER BY 2 DESC;

-- Checkout conversion proxy: paid vs created online orders
SELECT date_trunc('day', created_at) AS day,
       COUNT(*) FILTER (WHERE payment_method='online') AS online_created,
       COUNT(*) FILTER (WHERE payment_method='online' AND payment_status='paid') AS online_paid
FROM store_order
WHERE created_at >= now() - interval '30 days'
GROUP BY 1 ORDER BY 1;

-- Abandoned carts per day (post-fix capture)
SELECT date_trunc('day', abandoned_at) AS day, COUNT(*),
       COUNT(*) FILTER (WHERE customer_email <> '' OR customer_phone <> '') AS with_contact
FROM store_abandonedcart
WHERE abandoned_at >= now() - interval '30 days'
GROUP BY 1 ORDER BY 1;

-- Failed/pending online orders (stuck at payment)
SELECT COUNT(*) FROM store_order
WHERE payment_method='online' AND payment_status <> 'paid'
  AND created_at >= now() - interval '30 days';
```
(Confirm exact table names with `\dt store_*`; Django default is `store_<model>`.)

**Do not** run UPDATE/DELETE/DDL. Prefer a read-only DB user.

---

## 13. LOGGING AND OBSERVABILITY

- **Django/gunicorn**: stdout → `docker compose logs backend`. No `LOGGING` dict, **no Sentry/APM** → no error aggregation, no alerting. **[Gap]**
- **Celery**: `docker compose logs celery_worker` / `celery_beat`.
- **nginx (docker)**: `docker compose logs nginx`; access/error logs inside the nginx container. **Host nginx** logs at `/var/log/nginx/` on the VPS.
- **Payment logs**: `logger` calls in `paymob.py`/`payments.py` → backend Docker logs (grep `Paymob`).
- **Frontend**: `next start` stdout → `docker compose logs frontend`; browser console for client errors. No client error reporting service.
- **Error monitoring tools**: **none configured** — recommend adding Sentry (backend + frontend) as a low-risk observability win.
- **Analytics dashboards**: GA4, Meta Events Manager, TikTok, Snapchat, plus in-app admin analytics (`AdminAnalyticsView`, `AnalyticsEvent`).
- **Log retention**: Docker default json-file driver **[UNKNOWN rotation/limits — confirm `docker info` logging driver + `/etc/docker/daemon.json`]**.

**Safe log commands** (read-only; run on the VPS in the deploy dir):
```bash
docker compose -f docker-compose.prod.yml --env-file .env.production ps
docker compose -f docker-compose.prod.yml --env-file .env.production logs --tail=200 backend
docker compose -f docker-compose.prod.yml --env-file .env.production logs --tail=200 nginx
docker compose -f docker-compose.prod.yml --env-file .env.production logs --since=1h backend | grep -i -E "error|traceback|paymob|webhook"
sudo tail -n 200 /var/log/nginx/access.log     # host nginx
sudo tail -n 200 /var/log/nginx/error.log
```

**Observability gaps**: no APM, no error aggregation, no uptime/synthetic monitoring, no structured logs, no payment-webhook success/failure dashboard.

---

## 14. DATABASE

- **PostgreSQL 16** (`postgres:16-alpine`). [CONFIRMED from compose]
- **Key tables** (Django `store_*`): `store_product`, `store_productprice`, `store_productstock`, `store_warehouse`, `store_category`, `store_region`, `store_order`, `store_orderitem`, `store_paymenttransaction`, `store_abandonedcart`, `store_coupon`, `store_giftcard`, `store_customeraddress`, `store_review`, `store_sitesettings`, `store_paymobregionconfig`.
- **Indexes**: `session_token` on `AbandonedCart` (db_index), `conversion_session_key` on `Order` (db_index), unique `session_token`-style keys, `ProductStock` unique_together `(product, warehouse)`, slug unique on `Product`. Full index inventory **[UNKNOWN — run `\di`]**.
- **Table sizes / row counts**: **[UNKNOWN — measure]** (`SELECT relname, n_live_tup FROM pg_stat_user_tables ORDER BY n_live_tup DESC;`).
- **Slow-query logging**: **[UNKNOWN]** — check `log_min_duration_statement`; likely default (off).
- **Connection settings**: `CONN_MAX_AGE` default 60s (`POSTGRES_CONN_MAX_AGE`). No external pooler (PgBouncer) in compose — Django persistent connections only. **[Confirm]**
- **Pooling**: none beyond Django `CONN_MAX_AGE`. **[Gap/consideration for load]**
- **Backups**: **[UNKNOWN]** — no automated `pg_dump` in the workflow; `prod_db.dump`/`prod_data.json` in repo are stale one-offs. **Confirm Hostinger snapshot cadence before ANY change.**
- **Migration status**: migrations auto-run at backend container start; latest is `store/migrations/0066_*` (per-region Paymob fields). Verify with `showmigrations`.

Never SELECT or export customer PII (names, emails, phones, addresses) beyond aggregate counts.

---

## 15. SECURITY AND CHANGE-SAFETY

- **AuthN/AuthZ [CONFIRMED]**: JWT (simplejwt) + token blacklist; admin capability groups (`HasAdminCapability`, roles). Django admin at `/django-admin/`.
- **CSRF [CONFIRMED]**: `CSRF_TRUSTED_ORIGINS` set; CSRF cookie secure/httponly in prod.
- **CORS [CONFIRMED]**: `CORS_ALLOWED_ORIGINS` allowlist; `CORS_ALLOW_ALL_ORIGINS` only in DEBUG.
- **CSP [CONFIRMED]**: enforced by nginx (`$csp_default`, `add_header Content-Security-Policy`). Review the actual policy string in `deploy/nginx/default.conf` for pixel/GTM allowances.
- **HSTS [CONFIRMED]**: `max-age=31536000; includeSubDomains; preload` (Django + nginx + Next headers).
- **Secret management [CONFIRMED]**: GitHub environment secrets (`enfantSecrets` for client), written to `.env.production` (chmod 600) at deploy. No secrets in git (`.env.production.example` has names only). `.env`/`prod_db.dump` in the working tree are local dev artifacts — confirm they are gitignored / not pushed.
- **Payment signature verification [CONFIRMED]**: HMAC per provider/region in webhook views; idempotency via `PaymentTransaction` lookup.
- **Admin exposure**: `/django-admin/` and the custom admin (`/admin` Next.js) are internet-facing — ensure strong creds + rate limiting; admin auth cannot be self-provisioned in this environment.
- **DB exposure [CONFIRMED]**: Postgres is a compose-internal service (no host port publish in the excerpt) — verify no `5432` published to the host.
- **SSH access model**: key-based (`HOSTINGER_SSH_KEY`); alias `enfant-vps`. Deploy user owns `/home/deploy` tree; a prior root-owned `.env.production` caused deploy failures (now `rm -f` first).
- **Backups/rollback readiness**: **weak** — no automated DB backup or image rollback. **Create a DB dump + snapshot before any change.**
- **Production-change risks**: `seed_regions` overwrites region config; auto-migrate on deploy; full `.env` regeneration; no zero-downtime; single VPS (no HA).

---

## 16. MCP AND TOOL ACCESS (for the next agent)

| Tool / connection | Purpose | Scope | R/W |
|---|---|---|---|
| **Git (local repo)** | Full source at `/Users/user/Desktop/enfhantOrganic` | Repo read/write locally | RW (local) |
| **GitHub (`gh` CLI)** | Repo `tayyabmughal-creator/enfantOrganic`, Actions, environment secrets (`enfantSecrets`, `production`) | Repo + CI + secret store | RW — **secret writes are guarded/blocked in auto-mode without explicit user direction** |
| **SSH `enfant-vps` (147.93.110.232)** | Client production VPS shell | Server, deploy dir `/home/deploy/...` | Interactive; **prod `manage.py`/DB reads are gated by the harness classifier** — expect prompts, run read-only first |
| **`hostinger-vps` MCP** | VPS lifecycle (VM 1683732): metrics, firewall, snapshots, restart, backups | Hostinger account (ENFANT token) | RW — **destructive ops (restart/recreate/firewall) must not be used during audit** |
| **`hostinger-ecommerce` MCP** | Hostinger-native store APIs | Hostinger stores | RW — likely **not** the app's data store; verify relevance |
| **`hostinger-reach` MCP** | Email contacts/segments | Hostinger Reach | RW — marketing only |
| **`claude-in-chrome` (browser MCP)** | Drive Chrome for live UI/perf/checkout inspection, read console/network, Lighthouse-style checks | Browser tabs (site-permission gated) | RW on browser; **read-only for the site** — do not place real orders |
| **Deployment (GitHub Actions)** | Push-to-`main` deploy to client + personal VPS | CI | Triggered by commits — **do not push to `main` during read-only phase** |
| **Database** | Postgres in the `db` container | via SSH + `docker compose exec` | **No direct MCP**; access only through SSH (gated). Use read-only queries |
| **Analytics** | GA4 / Meta / TikTok / Snapchat dashboards | External accounts | **No MCP** — client must grant dashboard access |

Limitations: no direct DB MCP; production shell reads are classifier-gated (expect denials on `manage.py shell`/DB queries without explicit approval); secret-store writes are blocked without explicit user direction; do not reveal any secret values.

---

## 17. SAFE AUDIT COMMANDS

**Local (repo) — safe:**
```bash
git -C /Users/user/Desktop/enfhantOrganic log --oneline -15
git -C /Users/user/Desktop/enfhantOrganic status
cd frontend && npm ci && npx next build   # inspect bundle output (local only; does NOT touch prod)
```

**Live HTTP — safe (read-only):**
```bash
# TTFB + redirects
curl -s -L -o /dev/null -w "http=%{http_code} redirects=%{num_redirects} ttfb=%{time_starttransfer}s total=%{time_total}s size=%{size_download}\n" https://www.enfantorganic.com/en
# headers / cache
curl -sI https://om.enfantorganic.com/en | grep -iE "cache-control|content-encoding|x-nextjs-cache|age|server"
curl -sI "https://www.enfantorganic.com/api/navigation/?region=om" | grep -iE "cache-control|content-encoding|content-type"
# API health
curl -s -o /dev/null -w "%{http_code} %{time_starttransfer}s\n" "https://www.enfantorganic.com/api/products/?region=om"
```

**On the VPS (via SSH `enfant-vps`) — read-only:**
```bash
cd <deploy_path>            # e.g. /home/deploy/enfhantOrganic
docker compose -f docker-compose.prod.yml --env-file .env.production ps
docker compose ... logs --tail=200 backend
docker stats --no-stream
free -h; df -h; nproc; uname -a
docker version; docker compose version
sudo nginx -t                      # host nginx config test (read-only)
# migration state (read-only)
docker compose ... exec -T backend python manage.py showmigrations store | tail -30
```

**⚠️ SIDE-EFFECT commands — DO NOT run during the read-only phase:**
```bash
# ⚠️ recreates containers + runs migrations (DEPLOY)
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build
# ⚠️ restarts services (downtime)
docker compose ... restart <svc>
# ⚠️ overwrites region config from sample_data.py
docker compose ... exec -T backend python manage.py seed_regions
# ⚠️ runs schema migrations
docker compose ... exec -T backend python manage.py migrate
```

**DB backup (⚠️ writes a dump file; safe for data but do it deliberately, store off-host):**
```bash
docker compose -f docker-compose.prod.yml --env-file .env.production exec -T db \
  pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB" | gzip > backup_$(date +%F_%H%M).sql.gz
```

**Lighthouse (read-only, run against live from your machine):**
```bash
npx lighthouse https://om.enfantorganic.com/en --preset=perf --form-factor=mobile \
  --screenEmulation.mobile --output=json --output-path=./lh-mobile.json --quiet
```

---

## 18. PRODUCTION SAFETY RULES (mandatory for the next agent)

1. **Back up first.** Take a `pg_dump` + a Hostinger VPS snapshot before ANY change. No backup → no change.
2. **Read-only first.** Complete Phases 1–7 (investigation) before touching anything.
3. **Do not restart services** unless required, and only after a snapshot; expect brief downtime (no zero-downtime deploy exists).
4. **Do not run migrations blindly.** Inspect `showmigrations` + the migration diff; migrations auto-run on deploy, so review before pushing to `main`.
5. **Do not change env vars blindly.** `.env.production` is regenerated from `enfantSecrets` each deploy; change the GitHub secret, not the on-server file, and know `seed_regions` will re-apply region config.
6. **Never expose or log secrets.** Only variable names.
7. **Never test payments with real customer orders.** Use Paymob test cards / sandbox; verify webhooks in logs, not by charging real cards.
8. **Do not delete** containers, named volumes (`postgres-data`, `media-data`, `static-data`), media, or the database. Admin actively uploads product images — never bulk-delete/re-import media without confirming no recent admin changes.
9. **Do not change DNS** or the region-subdomain setup without an explicit rollback plan.
10. **Do not alter live checkout/payment** without a tested rollback (git revert + redeploy) ready.
11. **Branch for changes** — never commit directly to `main` during the audit; open a PR. (Deploy triggers on `main` push.)
12. **Keep an audit log** of every command run and every change, with timestamps.
13. **Check per-job deploy conclusions** — the overall run can look green while the personal-VPS job fails; the client job (`enfantSecrets`) is the one that matters.

---

## 19. RECOMMENDED AUDIT SEQUENCE

- **Phase 1 — Read-only production health check.** `docker compose ps`, `docker stats`, `free/df`, container logs for errors, host `nginx -t`, confirm all 7 services healthy, confirm SSL + region redirects.
- **Phase 2 — Performance profiling.** Live Lighthouse (mobile) on `om./ae.` homepages + a product page; capture LCP element, TBT, waterfall. Measure TTFB with/without ISR; confirm the `no-store` dynamic-render hypothesis (look for `x-nextjs-cache`); check hero image responsive sources; check `_next/static` cache headers; check gzip/brotli at the edge; profile `/api/home` + `/api/navigation` backend timing/queries.
- **Phase 3 — Cart & checkout validation.** Add-to-cart across ProductCard/QuickView/Detail; stock gating; coupon/tax/shipping; guest vs auth cart; abandoned-cart capture firing (post-fix).
- **Phase 4 — Payment verification.** Confirm OM live path end-to-end (test card); **fix AE** (correct MID-79577 secret/public keys or legacy iframe fallback) and repoint UAE callbacks; verify webhook HMAC + idempotency + order→paid transition; check for stuck unpaid online orders.
- **Phase 5 — Analytics & funnel verification.** Verify GA4 + Meta/TikTok/Snapchat fire ViewContent/AddToCart/InitiateCheckout/AddPaymentInfo/Purchase; check dedup; compare webhook-paid count vs Purchase-fired count; evaluate adding server-side CAPI; verify pixel IDs set per region.
- **Phase 6 — Database & order-trend analysis.** Run the §12 aggregate queries; build orders/day, payment-status, region, and online-created-vs-paid trends; quantify the post-migration decline and where the funnel leaks.
- **Phase 7 — Root-cause report.** Separate confirmed causes from suspects; rank by conversion impact (payment breakage > funnel/tracking gaps > raw performance, but validate with data).
- **Phase 8 — Low-risk fixes** (on a branch, with backup): enable ISR/caching (remove blanket `no-store`), convert hero to `next/image` + responsive sources, add Redis Django cache, add cache headers/brotli, fix AE payment, add server-side purchase tracking. Ship smallest-blast-radius first.
- **Phase 9 — Staging verification.** Validate on the personal-VPS/staging target (fix its deploy first) or a throwaway compose stack; run Lighthouse + a full test checkout.
- **Phase 10 — Controlled production deployment.** Backup + snapshot, deploy in a low-traffic window, watch logs + a synthetic checkout, keep the git revert ready.

---

## 20. OPEN QUESTIONS (next agent must verify)

1. VPS OS/kernel, CPU cores, RAM, disk usage, and current `docker stats` under real traffic.
2. Docker + Compose versions on the host.
3. Exact deploy path on the client VPS (`/home/deploy/...?`) and which compose project name is live.
4. Is there any CDN/Cloudflare in front of `*.enfantorganic.com`, or is it raw origin nginx?
5. Are `_next/static/*` assets served with long-lived immutable cache headers by host nginx?
6. Is brotli enabled at the host-nginx edge (docker nginx only has gzip)?
7. Is the homepage genuinely dynamic on every hit (confirm no `x-nextjs-cache` HIT), and what is the real per-request backend time for `/api/home` + `/api/navigation` (query counts / N+1)?
8. Do live hero banners have `image_mobile` populated, or is the desktop banner shipped to mobile?
9. Automated DB backups — do they exist, cadence, retention, restore-tested?
10. Postgres tuning: `log_min_duration_statement`, connection pooling, table sizes, missing indexes on hot query paths.
11. Is Postgres port published to the host? Is `/django-admin` and the Next `/admin` protected (rate-limited, strong creds)?
12. Sentry/APM/uptime monitoring — none in code; is anything external configured?
13. The exact CSP string in `deploy/nginx/default.conf` — does it allow all needed pixel/GTM/Maps origins (could silently block analytics)?
14. **AE payment**: obtain correct MID-79577 Unified Checkout `secret_key`/`public_key`, OR decide on the working legacy-iframe fallback; then repoint UAE integration callbacks in the Paymob dashboard.
15. Are all needed `PAYMOB_*_AE` (and `_SA`) vars actually written by the deploy heredoc into `.env.production`?
16. Server-side conversion tracking (CAPI) — how many paid orders never fire a client Purchase (webhook-paid vs Purchase-fired)?
17. Pre-launch Shopify baselines (orders/traffic/conversion) for a true before/after — client export required.
18. Consent/CMP behavior — opt-in vs opt-out default, and its effect on pixel firing per region.
19. Log rotation/retention for Docker json-file logs; any risk of disk fill.
20. Rollback story — is there a tagged-image or documented revert procedure, or only "git revert + rebuild"?
21. Personal-VPS deploy job failure (`tar: Cannot utime`) — is that target needed, and does its failure mask anything for the client job?
22. Whether `EMAIL_REQUIRE_SMTP`/SMTP is configured (order-confirmation emails affect perceived reliability and repeat orders).

---

*End of handoff. All findings above are either [CONFIRMED] from source/read-only probes, marked [SUSPECT] pending measurement, or [UNKNOWN] pending server access. No production system was modified in producing this document.*
