# Enfant Organic — Complete Project Context

> **Purpose:** This document provides a complete, self-contained understanding of the Enfant Organic e-commerce platform for any AI model or developer onboarding. Read this first.

**Generated:** 2026-05-17  
**Repository:** `/Users/user/Desktop/enfhantOrganic`

---

## 1. WHAT IS THIS PROJECT?

**Enfant Organic** is a **bilingual (Arabic/English) regional e-commerce storefront** selling organic baby-care products. It serves the **GCC market** — Oman (`om`), UAE (`ae`), Saudi Arabia (`sa`) — with region-aware pricing, currency, tax, payment gateways, shipping carriers, and localized content.

The project is **pre-launch / in active development**. Core flows work but 17 of 25 launch modules are partial or missing.

### Brand Identity
- **Name:** ENFANT ORGANICS
- **Tagline:** Pure • Gentle • Safe
- **Feeling:** Organic, clean, baby care, gentle, safe, premium, trustworthy
- **Colors:** Cream/off-white backgrounds, olive green primary (`#92ab69`), dark green (`#607a42`), dark charcoal text (`#191817`), warm gold accents (coupons)
- **Typography:** Playfair Display (headings), DM Sans (body), Noto Sans Arabic (RTL)

---

## 2. THREE CODEBASES

| Module | Directory | Language | Framework |
|--------|-----------|----------|-----------|
| **Frontend** (storefront) | `frontend/` | JavaScript (JSX) | Next.js 15 App Router, React 19 |
| **Backend** (API) | `backend/` | Python 3 | Django 4.2, Django REST Framework 3.15 |
| **Admin Mobile** (staff app) | `admin-mobile/` | JavaScript | Expo SDK 52, React Native 0.76 |

---

## 3. HOW TO RUN LOCALLY

### Prerequisites
- Node 22+, Python 3.12+ (3.9 works for dev), npm

### Backend
```bash
cd backend
source .venv/bin/activate       # Virtual env already exists
python manage.py migrate         # Already migrated
python manage.py runserver       # http://127.0.0.1:8000
```
Uses **SQLite** by default (no PostgreSQL needed for local dev).

### Frontend
```bash
cd frontend
npm run dev                      # http://localhost:3000 (or 3001/3002 if busy)
```
API calls go to `http://127.0.0.1:8000/api` (set in `frontend/.env.local`).

### Admin Mobile
```bash
cd admin-mobile
npx expo start
```

### Docker (all services)
```bash
docker compose up -d             # PostgreSQL, Redis, Django, Celery, Next.js
```

---

## 4. DIRECTORY MAP (Key Files Only)

```
enhantOrganic/
├── CONTEXT.md                          ← THIS FILE
├── PROJECT_EXECUTION_PLAN.md           ← 25-module launch audit
├── LAUNCH_CHECKLIST.md                 ← 30-item checklist (all pending)
├── PROJECT_STRUCTURE.md                ← Module layout doc
├── SECURITY.md                         ← Production hardening guide
├── README.md                           ← Setup instructions
├── .env.example                        ← Root env template
├── docker-compose.yml                  ← Local dev stack
├── docker-compose.prod.yml             ← Production stack (+Nginx)
│
├── frontend/
│   ├── app/
│   │   ├── layout.jsx                  ← Root layout (locale detection, RTL, PWA, GTM)
│   │   ├── page.jsx                    ← Redirect / → /en?region=om
│   │   ├── globals.css                 ← Imports all CSS files
│   │   ├── sitemap.js / robots.js / manifest.js
│   │   ├── [locale]/
│   │   │   ├── page.jsx                ← Homepage
│   │   │   ├── collections/page.jsx    ← Product catalog
│   │   │   ├── product/[slug]/page.jsx ← Product detail
│   │   │   ├── checkout/page.jsx       ← Checkout (thin wrapper)
│   │   │   ├── thank-you/[orderNumber]/page.jsx
│   │   │   ├── track-order/page.jsx
│   │   │   ├── account/page.jsx
│   │   │   ├── blog/page.jsx
│   │   │   ├── blog/[slug]/page.jsx
│   │   │   ├── [pageSlug]/page.jsx     ← Static pages
│   │   │   └── payment/{success,failed,pending}/page.jsx
│   │   ├── admin/page.jsx              ← Custom admin panel
│   │   ├── api/revalidate/route.js     ← ISR revalidation endpoint
│   │   └── styles/
│   │       ├── tokens.css              ← Design tokens + CSS reset + RTL
│   │       ├── header.css
│   │       ├── home.css
│   │       ├── catalog-product.css
│   │       ├── overlays.css            ← Cart drawer, quick view, modals
│   │       ├── checkout-order.css      ← Checkout, thank-you, timeline, status badges
│   │       ├── account.css
│   │       ├── admin-panel.css
│   │       └── analytics.css
│   ├── components/
│   │   ├── icons/Icon.jsx              ← 21 inline SVG icons
│   │   ├── layout/
│   │   │   ├── StorefrontShell.jsx     ← Locale/region-aware page wrapper
│   │   │   ├── Header.jsx             ← Site header + nav + region/language/cart
│   │   │   ├── Footer.jsx
│   │   │   └── MegaMenu.jsx           ← Category mega dropdown
│   │   ├── store/
│   │   │   ├── cart/StoreProvider.jsx  ← Cart context + localStorage persistence
│   │   │   ├── cart/CartDrawer.jsx
│   │   │   ├── checkout/CheckoutClient.jsx  ← THE CHECKOUT FORM (1367 lines)
│   │   │   ├── order/TrackOrderClient.jsx
│   │   │   ├── account/AccountClient.jsx
│   │   │   ├── catalog/ProductCollectionClient.jsx
│   │   │   ├── catalog/FilterSidebar.jsx
│   │   │   ├── product/ProductDetailClient.jsx
│   │   │   ├── product/QuickViewModal.jsx
│   │   │   ├── analytics/              ← GTM/GA4/Meta Pixel + consent banner
│   │   │   ├── payment/                ← Payment status watchers
│   │   │   ├── NewsletterForm.jsx
│   │   │   ├── TestimonialsSlider.jsx, CategoryCarousel.jsx, ProductRail.jsx
│   │   ├── admin/                      ← Admin panel components
│   │   ├── seo/                        ← JsonLd, HTML attributes
│   │   ├── ui/                         ← Button, Badge, Tabs, Stars, QuantityStepper
│   │   ├── cards/                      ← ProductCard, CategoryCard, TestimonialCard
│   │   └── system/                     ← SW reset, chunk recovery
│   ├── lib/
│   │   ├── api.js                      ← API client (fetch + timeout + error handling)
│   │   ├── config.js                   ← Centralized config + safeRedirectUrl
│   │   ├── analytics.js                ← GTM dataLayer + consent
│   │   ├── seo.js                      ← SEO helpers
│   │   ├── format.js                   ← Formatting utilities
│   │   ├── storefront.js               ← Compatibility re-export
│   │   └── storefront-core/
│   │       ├── routing.js              ← Locale/region normalization + path building
│   │       ├── money.js                ← Currency formatting per region
│   │       └── translations.js         ← UI text translations (EN/AR)
│   ├── middleware.js                   ← Locale detection middleware
│   ├── next.config.mjs                 ← PWA config, security headers, sensitive routes
│   ├── jsconfig.json                   ← @/* → ./ path alias
│   └── public/enfant/                  ← 10 product/brand images
│
├── backend/
│   ├── enfant_backend/
│   │   ├── settings.py                 ← Django settings (424 lines, env-driven)
│   │   ├── urls.py                     ← Root URL routing (JWT + API include)
│   │   ├── auth_views.py              ← Custom JWT auth views
│   │   ├── celery.py                   ← Celery app config
│   │   └── wsgi.py / asgi.py
│   ├── store/
│   │   ├── models.py                   ← Compatibility re-exports
│   │   ├── serializers.py              ← Compatibility re-exports
│   │   ├── views.py                    ← Compatibility re-exports
│   │   ├── urls.py                     ← ALL API endpoints (161 lines, 70+ routes)
│   │   ├── admin.py                    ← Django admin registrations
│   │   ├── signals.py                  ← Model signals
│   │   ├── tasks.py                    ← Celery tasks
│   │   ├── emails.py                   ← Email sending
│   │   ├── notifications.py            ← Push notifications
│   │   ├── revalidation.py             ← Frontend ISR cache revalidation
│   │   ├── sample_data.py              ← Seed data
│   │   ├── domain_models/
│   │   │   ├── base.py                 ← Abstract base models
│   │   │   ├── catalog.py              ← Region, Product, Category, TaxRate, etc.
│   │   │   └── commerce.py             ← Order, Payment, Customer, Coupon, etc.
│   │   ├── api_serializers/            ← 7 serializer modules
│   │   ├── api_views/                  ← 9 view modules
│   │   ├── services/                   ← 22 service modules
│   │   │   ├── paymob.py               ← Paymob payment gateway (IMPLEMENTED)
│   │   │   ├── paytabs.py              ← PayTabs scaffold
│   │   │   ├── thawani.py              ← Thawani scaffold
│   │   │   ├── omannet.py              ← OmanNet scaffold
│   │   │   ├── payment_router.py       ← Region-based payment routing
│   │   │   ├── carriers/               ← Aramex, SMSA, Fetchr adapters
│   │   │   ├── carrier_router.py
│   │   │   ├── invoice.py              ← PDF invoice generation
│   │   │   ├── shipment.py             ← Shipment tracking
│   │   │   ├── stock.py                ← Inventory management
│   │   │   ├── search.py               ← Search logic
│   │   │   ├── sms_router.py / sms_templates.py
│   │   │   ├── whatsapp_cloud.py
│   │   │   ├── admin_roles.py
│   │   │   └── admin_audit.py
│   │   ├── management/commands/        ← seed_store, complete_demo_catalog, copy_review_csv
│   │   ├── tests/                      ← 2 test files
│   │   ├── templates/emails/           ← 22 bilingual email templates (EN/AR)
│   │   └── migrations/                 ← 26 migration files
│   ├── requirements.txt                ← 56 Python packages
│   └── .env                            ← Active local config (has Paymob sandbox key)
│
├── admin-mobile/
│   ├── App.js                          ← Full admin app (365 lines, single file)
│   ├── app.json                        ← Expo config
│   └── package.json
│
├── deploy/
│   └── nginx/default.conf              ← Nginx reverse proxy + TLS + CSP
│
├── scripts/
│   ├── backup_now.sh                   ← Full PostgreSQL + media backup
│   └── restore_backup.sh
│
├── .github/workflows/
│   ├── ci.yml                          ← Backend tests + frontend build on PR
│   └── deploy-hostinger.yml            ← SCP + Docker deploy to Hostinger VPS
│
└── docs/                               ← 10 documentation files
```

---

## 5. ARCHITECTURE PATTERNS

### Routing
- **Locale-first routing:** `/en/checkout?region=om`, `/ar/checkout?region=ae`
- `middleware.js` parses cookie + URL path to set `x-enfant-locale` and `x-enfant-dir` headers
- Region is always a **query parameter** (`?region=om|ae|sa`), not a path segment
- Supported locales: `en`, `ar` (RTL). Supported regions: `om`, `ae`, `sa`

### Data Flow
```
Browser → Next.js (SSR/CSR) → Django REST API → PostgreSQL/SQLite
                                    ↕
                              Celery + Redis (async jobs)
```

### Compatibility Re-export Pattern
Backend uses a re-export pattern — `models.py`, `views.py`, `serializers.py` are stable import targets that re-export from subdirectories (`domain_models/`, `api_views/`, `api_serializers/`). New code goes in the subdirectories.

### Cart State
React Context (`StoreProvider`) + localStorage persistence under key `enfant-organics-cart`. Cart items include `lineId`, `slug`, `quantity`, `pricing` object, `image`, `selectedOptionsText`.

### Styling System
**Plain CSS** — no Tailwind, no CSS modules. CSS custom properties (design tokens) defined in `tokens.css`. All styles are in `app/styles/`. Global imports via `globals.css`. RTL handled with `[dir="rtl"]` selectors.

### Icons
21 inline SVG icons in `components/icons/Icon.jsx`: arrowRight, bag, cart, heart, star, plus, minus, close, menu, chevronDown, globe, sparkle, **leaf**, **shield**, **truck**, **mail**, **search**, **instagram**, **filter**, **check**.

### Payment Architecture
- Provider enum on `PaymentTransaction` model
- `payment_router.py` routes by region
- Only **Paymob** is fully implemented (sandbox key in `.env`)
- PayTabs, Thawani, OmanNet, HyperPay, Telr are scaffolded
- Payment methods shown: COD, Online (if configured), WhatsApp Confirmation, Bank Transfer

---

## 6. COMPLETE API ENDPOINT REFERENCE

### Storefront (Public — No Auth)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/navigation/` | Site nav data + current_region config |
| GET | `/api/home/` | Homepage content |
| GET | `/api/catalog/` | Product catalog with filters |
| GET | `/api/products/` | Product listing |
| GET | `/api/products/<slug>/` | Product detail |
| GET | `/api/search/suggestions/` | Search autocomplete |
| GET | `/api/blog/` | Blog listing |
| GET | `/api/blog/<slug>/` | Blog detail |

### Checkout & Payments (Public)
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/checkout/` | Create order (guest or logged-in) |
| POST | `/api/payments/initiate/` | Start online payment |
| POST | `/api/payments/retry/` | Retry failed payment |
| POST | `/api/payments/webhook/` | Paymob webhook |
| POST | `/api/payments/webhook/paytabs/` | PayTabs webhook |
| POST | `/api/payments/webhook/thawani/` | Thawani webhook |
| POST | `/api/payments/webhook/omannet/` | OmanNet webhook |
| GET | `/api/payments/status/<order_number>/` | Payment status |
| POST | `/api/coupons/validate/` | Coupon validation |

### Orders (Public)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/orders/lookup/` | Guest order lookup (email/phone) |
| GET | `/api/orders/<order_number>/` | Order detail |
| GET | `/api/orders/<order_number>/invoice/` | Invoice PDF |

### Auth & Account (JWT Required for Most)
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/token/` | JWT login |
| POST | `/api/auth/token/refresh/` | Token refresh |
| POST | `/api/auth/token/logout/` | Token blacklist |
| POST | `/api/auth/register/` | Registration |
| POST | `/api/auth/password-reset/` | Request reset |
| POST | `/api/auth/password-reset/confirm/` | Confirm reset |
| GET/PATCH | `/api/account/profile/` | User profile |
| GET/POST | `/api/account/addresses/` | Address book |
| GET | `/api/account/orders/` | Customer orders |
| POST | `/api/account/orders/<id>/cancel/` | Cancel order |
| POST | `/api/account/orders/<id>/returns/` | Create return |
| GET | `/api/account/returns/` | List returns |
| GET/POST | `/api/account/wishlist/` | Wishlist |
| POST | `/api/reviews/` | Submit review |
| POST | `/api/newsletter/` | Newsletter subscribe |

### Notifications (Public)
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/notifications/devices/` | Register push device |
| POST | `/api/notifications/devices/deactivate/` | Deactivate push |
| POST | `/api/notifications/webhook/whatsapp/` | WhatsApp webhook |

### Admin (Staff-only, JWT Required)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/admin/dashboard/` | Dashboard KPIs |
| GET | `/api/admin/me/` | Admin profile + roles |
| GET | `/api/admin/audit-logs/` | Audit trail |
| GET | `/api/admin/moderation/` | Moderation summary |
| GET | `/api/admin/reports/<type>/` | CSV exports |
| GET/POST | `/api/admin/products/` | Product CRUD |
| GET/PUT/DELETE | `/api/admin/products/<slug>/` | Product ops |
| GET/POST | `/api/admin/categories/` | Category CRUD |
| GET/PUT/DELETE | `/api/admin/categories/<slug>/` | Category ops |
| GET | `/api/admin/orders/` | Order list |
| GET/PATCH | `/api/admin/orders/<order>/` | Order detail/edit |
| POST | `/api/admin/orders/<order>/refund/` | Issue refund |
| POST | `/api/admin/orders/<order>/shipment/create/` | Create shipment |
| POST | `/api/admin/orders/<order>/shipment/refresh/` | Refresh tracking |
| GET | `/api/admin/orders/<order>/invoice/` | Invoice download |
| GET | `/api/admin/customers/` | Customer list |
| GET | `/api/admin/customers/<pk>/` | Customer detail |
| GET | `/api/admin/payments/` | Payment list |
| GET | `/api/admin/payments/<pk>/` | Payment detail |
| GET/POST | `/api/admin/promotions/` | Coupon CRUD |
| GET/PUT/DELETE | `/api/admin/promotions/<pk>/` | Coupon ops |
| GET | `/api/admin/reviews/` | Review list |
| GET | `/api/admin/reviews/<pk>/` | Review detail |
| GET | `/api/admin/returns/` | Return list |
| GET | `/api/admin/returns/<pk>/` | Return detail |
| GET/POST | `/api/admin/shipping-rules/` | Shipping rule CRUD |
| GET/PUT/DELETE | `/api/admin/shipping-rules/<pk>/` | Rule ops |
| GET/POST | `/api/admin/warehouses/` | Warehouse CRUD |
| GET/PUT/DELETE | `/api/admin/warehouses/<pk>/` | Warehouse ops |
| GET/POST | `/api/admin/product-stocks/` | Stock CRUD |
| GET/PUT/DELETE | `/api/admin/product-stocks/<pk>/` | Stock ops |
| GET/POST | `/api/admin/blog-posts/` | Blog CRUD |
| GET/PUT/DELETE | `/api/admin/blog-posts/<slug>/` | Blog ops |
| GET | `/api/admin/regions/` | Region list |
| GET/PUT | `/api/admin/settings/` | Site settings |
| GET | `/api/schema/` | OpenAPI schema |
| GET | `/api/docs/` | Swagger UI |

---

## 7. CHECKOUT FLOW (Detailed)

### Page Structure
- **Server page:** `app/[locale]/checkout/page.jsx` — SSR, fetches navigation data, renders `CheckoutClient`
- **Client component:** `components/store/checkout/CheckoutClient.jsx` — 1367 lines, all checkout logic

### Component Props
```jsx
<CheckoutClient locale={locale} region={region} regionConfig={navigation?.current_region || null} />
```

### Form State
```js
{
  name, email, phone, sms_opt_in, whatsapp_opt_in,
  address_line_1, address_line_2, building, floor, apartment, landmark,
  area, city, postcode, country, formatted_address, place_id,
  lat, lng, location_notes,
  coupon_code, notes, payment_method  // default: "cod"
}
```

### Payment Methods (Dynamic)
1. **Cash on Delivery** (always available)
2. **Pay Online** (only if `payment_enabled_providers` has configured gateways)
3. **WhatsApp Confirmation** (always available)
4. **Bank Transfer** (always available)

### Checkout API Payload
```json
{
  "region": "om",
  "locale": "en",
  "customer": { name, email, phone, sms_opt_in, whatsapp_opt_in, address_line_1, ... },
  "payment_method": "cod" | "online" | "whatsapp" | "bank_transfer",
  "coupon_code": "",
  "notes": "",
  "items": [{ "slug": "...", "quantity": 1, "selected_options_text": "" }]
}
```

### Online Payment Flow
1. POST `/api/checkout/` → receives `order_number`
2. POST `/api/payments/initiate/` with `order_number` + `provider`
3. Redirect to provider's payment page via `safeRedirectUrl()`
4. Webhook callback confirms payment

### Region-Specific Config (from `navigation.current_region`)
```json
{
  "code": "om",
  "name": "Oman",
  "currency_code": "OMR",
  "shipping_fee": "2.00",
  "free_shipping_threshold": "0.00",
  "whatsapp_phone": "",
  "payment_enabled_providers": ["paymob"],
  "default_payment_provider": "paymob",
  "payment_provider_options": [{ "key": "paymob", "enabled": true, "configured": false }]
}
```

### Google Maps Integration
- API key: `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` env var
- Falls back gracefully to manual address entry if key is missing
- Autocomplete restricted to the selected country
- Click-to-pin + drag marker support
- Coordinates stored as `lat`/`lng` in form state

### Coupon Validation
- POST `/api/coupons/validate/` with region, code, city, area, items
- Auto-validates silently on cart/region change
- Returns discount, shipping, tax, final totals if valid

---

## 8. DATABASE MODELS

### Catalog (14 models)
`Region`, `TaxRate`, `ShippingRule`, `SiteSettings`, `Category`, `Tag`, `Product`, `ProductPrice`, `Warehouse`, `ProductStock`, `BlogPost`, `HeroPromoCard`, `Testimonial`, `InstagramPost`

### Commerce (12 models)
`Order`, `OrderItem`, `OrderStatusHistory`, `PaymentTransaction`, `ReturnRequest`, `CustomerAddress`, `Coupon`, `Review`, `WishlistItem`, `NewsletterSubscription`, `NotificationLog`, `WhatsAppLog`, `AdminAuditLog`

---

## 9. DESIGN TOKENS (CSS Custom Properties)

```css
--bg: #f7f8f3;              /* Cream background */
--surface: #ffffff;          /* Card background */
--surface-soft: #f4f7ef;     /* Subtle green-tinted surface */
--line: #dfe7d6;             /* Light green border */
--text: #191817;             /* Dark charcoal */
--text-soft: #66705d;        /* Muted olive-grey */
--brand: #92ab69;            /* Olive green (primary) */
--brand-dark: #607a42;       /* Dark green */
--brand-pale: #edf4e2;       /* Light green tint */
--danger: #b42318;           /* Red */
--success: #1f7a4d;          /* Green */
--shadow: 0 18px 48px rgba(25,24,23,0.07);
--radius-md: 14px;
--radius-lg: 18px;
--radius-xl: 24px;
--radius-2xl: 32px;
--focus-ring: 0 0 0 4px rgba(146,171,105,0.18);
--font-sans: "DM Sans", "Helvetica Neue", Arial, sans-serif;
--font-serif: "Playfair Display", Georgia, "Times New Roman", serif;
--font-arabic: "Noto Sans Arabic", "Segoe UI", Arial, sans-serif;
--container: min(100% - 80px, 1360px);
```

---

## 10. LAUNCH MODULE STATUS

| # | Module | Status |
|---|--------|--------|
| 1 | Localization, RTL, Arabic/English UX | Partial |
| 2 | VAT engine (OM 5%, AE 5%, KSA 15%) | Missing |
| 3 | Tax-compliant invoice PDF (ZATCA Phase 1) | Missing |
| 4 | GCC payment provider architecture | Partial |
| 5 | PayTabs integration | Missing |
| 6 | Apple Pay / Google Pay | Missing |
| 7 | Mada support (KSA) | Missing |
| 8 | Oman-friendly payment options | Partial |
| 9 | Pin-on-map checkout address | Implemented |
| 10 | Address autocomplete + lat/lng | Implemented |
| 11 | Real-time shipping calculation | Partial |
| 12 | Carrier abstraction (Aramex, SMSA) | Partial |
| 13 | Multi-warehouse inventory | Missing |
| 14 | Country-aware stock visibility | Partial |
| 15 | Full order workflow (return/RMA) | Partial |
| 16 | Email, SMS, WhatsApp notifications | Partial |
| 17 | Payment badges, trust signals | Partial |
| 18 | GTM, GA4, Meta Pixel | Partial |
| 19 | SEO (metadata, OG, JSON-LD, sitemap) | Partial |
| 20 | Smart search (typo tolerance, ranking) | Partial |
| 21 | PWA readiness | Partial |
| 22 | Role-based admin permissions | Missing |
| 23 | Admin audit logs | Partial |
| 24 | Backup and restore plan | Implemented |
| 25 | Handover, support, SLA documents | Partial |

**Implemented:** 9, 10, 24  
**Partial:** 1, 4, 8, 11, 12, 14, 15, 16, 17, 18, 19, 20, 21, 23, 25  
**Missing:** 2, 3, 5, 6, 7, 13, 22

---

## 11. KEY TECHNICAL NOTES

### JWT Auth
- Access token: 15 min. Refresh token: 7 days. Rotation enabled, blacklist on rotation
- Token stored in localStorage (`CUSTOMER_TOKEN_KEY`)
- Auto-included in API calls by CheckoutClient for address loading

### Security
- `safeRedirectUrl()` validates payment redirects against an allowlist of trusted origins
- Sensitive routes (checkout, payment, account, admin) excluded from PWA caching
- Nginx CSP in production (currently allows `unsafe-inline`/`unsafe-eval` — should be reviewed)
- Paymob sandbox API key present in `backend/.env` (for local dev only)

### Rate Limiting
DRF throttles: `auth: 20/min`, `checkout: 30/hour`, `payment: 60/hour`, `order_lookup: 10/hour`, plus `anon` and `user` scoped rates.

### Email
- 22 bilingual HTML email templates (EN/AR) covering order lifecycle
- Console backend in local dev, SMTP in production

### Celery Tasks
- `clear_expired_sessions` (daily)
- Notification dispatch (email/SMS/WhatsApp/push)
- Cache revalidation signals

---

## 12. CURRENT GIT STATE

- **Branch:** `codex-add-storefront-payments-blog-account`
- **Status:** ~128 files modified (unstaged), extensive uncommitted work
- **Last commits:** Dockerization, Hostinger deploy, admin routing, storefront features

---

## 13. WHEN MAKING CHANGES

### What NOT to change
- Backend API endpoints or payload structures
- Form field names in CheckoutClient (they map to API payload)
- Cart state management in StoreProvider
- Payment routing or initiation logic
- Coupon validation flow
- Region/locale routing in middleware.js

### What CAN be changed
- CSS files in `app/styles/` — visual design only
- JSX structure within components — as long as form fields, handlers, and API calls are preserved
- Adding new CSS classes or restructuring HTML for layout
- Using the existing Icon component for visual polish

### File Dependencies to Know
- `CheckoutClient.jsx` imports: StoreProvider, Icon, analytics, storefront utils, config
- `CheckoutClient.jsx` is rendered by: `app/[locale]/checkout/page.jsx`
- `checkout-order.css` also styles: thank-you page, track-order page, payment status pages, order timeline, status badges
- `tokens.css` defines: all CSS variables, base reset, RTL support, animations
