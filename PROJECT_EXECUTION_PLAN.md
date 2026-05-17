# PROJECT EXECUTION PLAN

Audit date: 2026-05-12  
Repository: `/Users/user/Desktop/enfhantOrganic`  
Scope: Launch-readiness audit and implementation plan only (no feature implementation in this step)

## 1) Verified Architecture And Paths

### Backend (Django + DRF)
- Root: `/Users/user/Desktop/enfhantOrganic/backend`
- Settings: `/Users/user/Desktop/enfhantOrganic/backend/enfant_backend/settings.py`
- API routes:
  - `/Users/user/Desktop/enfhantOrganic/backend/enfant_backend/urls.py`
  - `/Users/user/Desktop/enfhantOrganic/backend/store/urls.py`
- Domain models:
  - `/Users/user/Desktop/enfhantOrganic/backend/store/domain_models/catalog.py`
  - `/Users/user/Desktop/enfhantOrganic/backend/store/domain_models/commerce.py`
- API views:
  - `/Users/user/Desktop/enfhantOrganic/backend/store/api_views/storefront.py`
  - `/Users/user/Desktop/enfhantOrganic/backend/store/api_views/checkout.py`
  - `/Users/user/Desktop/enfhantOrganic/backend/store/api_views/orders.py`
  - `/Users/user/Desktop/enfhantOrganic/backend/store/api_views/account.py`
  - `/Users/user/Desktop/enfhantOrganic/backend/store/api_views/admin_ops.py`
  - `/Users/user/Desktop/enfhantOrganic/backend/store/api_views/payments.py`
- Payment service:
  - `/Users/user/Desktop/enfhantOrganic/backend/store/services/paymob.py`
- Admin:
  - `/Users/user/Desktop/enfhantOrganic/backend/store/admin.py`

### Frontend (Next.js / React)
- Root: `/Users/user/Desktop/enfhantOrganic/frontend`
- App router root:
  - `/Users/user/Desktop/enfhantOrganic/frontend/app/layout.jsx`
  - `/Users/user/Desktop/enfhantOrganic/frontend/app/page.jsx`
- Localized storefront routes (`en`, `ar`):
  - `/Users/user/Desktop/enfhantOrganic/frontend/app/[locale]/page.jsx`
  - `/Users/user/Desktop/enfhantOrganic/frontend/app/[locale]/collections/page.jsx`
  - `/Users/user/Desktop/enfhantOrganic/frontend/app/[locale]/product/[slug]/page.jsx`
  - `/Users/user/Desktop/enfhantOrganic/frontend/app/[locale]/checkout/page.jsx`
  - `/Users/user/Desktop/enfhantOrganic/frontend/app/[locale]/thank-you/[orderNumber]/page.jsx`
  - `/Users/user/Desktop/enfhantOrganic/frontend/app/[locale]/track-order/page.jsx`
  - `/Users/user/Desktop/enfhantOrganic/frontend/app/[locale]/payment/*/page.jsx`
  - `/Users/user/Desktop/enfhantOrganic/frontend/app/[locale]/[pageSlug]/page.jsx`
- Custom web admin panel:
  - `/Users/user/Desktop/enfhantOrganic/frontend/app/admin/page.jsx`
  - `/Users/user/Desktop/enfhantOrganic/frontend/components/admin/AdminPanelClient.jsx`

### Admin Mobile (Expo shell)
- Root: `/Users/user/Desktop/enfhantOrganic/admin-mobile`
- Entry:
  - `/Users/user/Desktop/enfhantOrganic/admin-mobile/App.js`

### Deployment (Docker / Nginx / VPS)
- Compose:
  - `/Users/user/Desktop/enfhantOrganic/docker-compose.yml`
  - `/Users/user/Desktop/enfhantOrganic/docker-compose.prod.yml`
- Nginx:
  - `/Users/user/Desktop/enfhantOrganic/deploy/nginx/default.conf`
- CI/CD:
  - `/Users/user/Desktop/enfhantOrganic/.github/workflows/ci.yml`
  - `/Users/user/Desktop/enfhantOrganic/.github/workflows/deploy-hostinger.yml`

### Environment templates
- `/Users/user/Desktop/enfhantOrganic/.env.example`
- `/Users/user/Desktop/enfhantOrganic/.env.production.example`
- `/Users/user/Desktop/enfhantOrganic/backend/.env.example`
- `/Users/user/Desktop/enfhantOrganic/frontend/.env.example`
- `/Users/user/Desktop/enfhantOrganic/frontend/.env.local.example`

## 2) Current Launch Module Status (Mandatory 25)

Status legend: `Implemented`, `Partial`, `Missing`

1. Localization, RTL, Arabic/English UX: `Partial`  
   Existing locale routing and RTL direction exist; several user-facing texts and metadata remain English-only and there is no centralized translation coverage for all UI.

2. VAT engine for Oman 5%, UAE 5%, KSA 15%: `Missing`  
   No VAT model/rate engine; checkout totals currently subtotal + shipping - discount only.

3. Tax-compliant invoice PDF, KSA ZATCA Phase 1 ready: `Missing`  
   No invoice PDF generation, no ZATCA-compliant QR payload generation.

4. GCC payment provider architecture: `Partial`  
   Provider enum exists in `PaymentTransaction`; only Paymob service is implemented.

5. PayTabs or equivalent GCC gateway: `Missing`

6. Apple Pay / Google Pay through gateway: `Missing`

7. Mada support for KSA where available: `Missing`

8. Oman-friendly options (Thawani / OmanNet / Paymob / PayTabs fallback): `Partial`  
   Paymob exists; Thawani/OmanNet/PayTabs routing and failover do not exist.

9. Pin-on-map checkout address: `Missing`

10. Address autocomplete + lat/lng storage: `Missing`

11. Real-time or rules-based shipping calculation: `Partial`  
   Basic rules-based region fee/threshold exists; no dimensional/zone/carrier or distance logic.

12. Carrier abstraction (Aramex, SMSA, Fetchr/equivalent): `Missing`

13. Multi-warehouse inventory: `Missing`

14. Country-aware stock visibility: `Partial`  
   Region-aware pricing exists; inventory is global per product.

15. Full order workflow (shipped, delivered, cancelled, returned, refunded): `Partial`  
   Pending->delivered/cancelled exists and payment refunded status exists; return/RMA flow and shipment milestone model are missing.

16. Email, SMS, WhatsApp notifications: `Partial`  
   Email exists, staff push exists, WhatsApp deep-link exists; no SMS provider integration and no transactional WhatsApp API integration.

17. Payment badges, trust signals, return policy visibility: `Partial`  
   Basic trust chips and static policy pages exist; payment badges and policy blocks are not tied to active methods/region.

18. GTM, GA4, Meta Pixel: `Missing`

19. SEO metadata, Open Graph, JSON-LD, sitemap, robots: `Missing`  
   Minimal global metadata only; no dynamic per-page SEO surface and no sitemap/robots routes.

20. Smart search: `Partial`  
   Basic `name_en/name_ar` query filtering exists; no typo tolerance, ranking, synonym, autosuggest, or indexed search.

21. PWA readiness: `Missing`  
   No manifest, service worker, offline strategy, installability signals.

22. Role-based admin permissions: `Missing`  
   Admin API gate is `is_staff` only.

23. Admin audit logs: `Missing`  
   `NotificationLog` exists but does not cover admin action auditing.

24. Backup and restore plan: `Missing`  
   No backup scripts/runbooks/schedule/restore verification docs in repo.

25. Handover, support, SLA, and UAT documents: `Missing`

## 3) Current Implemented Features

- Core storefront pages with localized route segments (`/en`, `/ar`) and region query (`om`, `ae`, `sa`).
- Product, category, blog, testimonials, hero cards, and per-region product pricing.
- Cart and checkout flow with coupon validation.
- Guest order lookup + thank-you page with timeline and totals.
- Account registration/login/profile/order history/wishlist.
- Admin APIs for dashboard, products, categories, orders, customers, payments, promotions, reviews, regions/settings (partially complete in panel usage).
- Django admin with rich model registrations and basic order actions.
- Paymob initiation, webhook verification, transaction persistence, payment status endpoint.
- Dockerized deployment stack (Postgres + Django/Gunicorn + Next + Nginx) and Hostinger deployment workflow.

## 4) Current Partial Features

- Localization consistency across all pages/components.
- Payment architecture abstraction exists only at enum/data level.
- Shipping calculation is basic (flat+threshold per region).
- Region handling exists for pricing, not inventory availability.
- Notification coverage includes email and push, but not full SMS/WhatsApp automation.
- Order lifecycle covers delivery/cancel transitions, not return/refund operations end-to-end.
- Custom admin panel includes many placeholder sections and references some non-existent endpoints (example: `/admin/blog-posts/`).

## 5) Current Missing Features

- VAT engine and tax invoice mechanics.
- GCC multi-gateway orchestration and wallet/mada support.
- Map pin + geocoding + lat/lng persistence in checkout and address book.
- Carrier connectors and shipment lifecycle abstraction.
- Multi-warehouse inventory and region stock policies.
- Marketing pixels and analytics tags.
- Full SEO system (metadata/OG/JSON-LD/sitemap/robots/canonical strategy).
- Smart search engine.
- PWA package.
- Fine-grained RBAC and admin audit trail.
- Backup/restore and launch operations documentation set (handover/SLA/UAT).

## 6) Exact Files Found In Repo (Launch-Relevant)

### Backend core
- `/Users/user/Desktop/enfhantOrganic/backend/enfant_backend/settings.py`
- `/Users/user/Desktop/enfhantOrganic/backend/enfant_backend/urls.py`
- `/Users/user/Desktop/enfhantOrganic/backend/store/models.py`
- `/Users/user/Desktop/enfhantOrganic/backend/store/views.py`
- `/Users/user/Desktop/enfhantOrganic/backend/store/serializers.py`
- `/Users/user/Desktop/enfhantOrganic/backend/store/urls.py`
- `/Users/user/Desktop/enfhantOrganic/backend/store/admin.py`
- `/Users/user/Desktop/enfhantOrganic/backend/store/notifications.py`
- `/Users/user/Desktop/enfhantOrganic/backend/store/emails.py`
- `/Users/user/Desktop/enfhantOrganic/backend/store/services/paymob.py`

### Backend domain models
- `/Users/user/Desktop/enfhantOrganic/backend/store/domain_models/base.py`
- `/Users/user/Desktop/enfhantOrganic/backend/store/domain_models/catalog.py`
- `/Users/user/Desktop/enfhantOrganic/backend/store/domain_models/commerce.py`

### Backend API serializers
- `/Users/user/Desktop/enfhantOrganic/backend/store/api_serializers/localization.py`
- `/Users/user/Desktop/enfhantOrganic/backend/store/api_serializers/catalog.py`
- `/Users/user/Desktop/enfhantOrganic/backend/store/api_serializers/checkout.py`
- `/Users/user/Desktop/enfhantOrganic/backend/store/api_serializers/orders.py`
- `/Users/user/Desktop/enfhantOrganic/backend/store/api_serializers/account.py`
- `/Users/user/Desktop/enfhantOrganic/backend/store/api_serializers/admin_ops.py`

### Backend API views
- `/Users/user/Desktop/enfhantOrganic/backend/store/api_views/context.py`
- `/Users/user/Desktop/enfhantOrganic/backend/store/api_views/storefront.py`
- `/Users/user/Desktop/enfhantOrganic/backend/store/api_views/checkout.py`
- `/Users/user/Desktop/enfhantOrganic/backend/store/api_views/orders.py`
- `/Users/user/Desktop/enfhantOrganic/backend/store/api_views/account.py`
- `/Users/user/Desktop/enfhantOrganic/backend/store/api_views/admin_ops.py`
- `/Users/user/Desktop/enfhantOrganic/backend/store/api_views/payments.py`

### Frontend core and pages
- `/Users/user/Desktop/enfhantOrganic/frontend/app/layout.jsx`
- `/Users/user/Desktop/enfhantOrganic/frontend/app/page.jsx`
- `/Users/user/Desktop/enfhantOrganic/frontend/app/[locale]/page.jsx`
- `/Users/user/Desktop/enfhantOrganic/frontend/app/[locale]/collections/page.jsx`
- `/Users/user/Desktop/enfhantOrganic/frontend/app/[locale]/product/[slug]/page.jsx`
- `/Users/user/Desktop/enfhantOrganic/frontend/app/[locale]/checkout/page.jsx`
- `/Users/user/Desktop/enfhantOrganic/frontend/app/[locale]/thank-you/[orderNumber]/page.jsx`
- `/Users/user/Desktop/enfhantOrganic/frontend/app/[locale]/track-order/page.jsx`
- `/Users/user/Desktop/enfhantOrganic/frontend/app/[locale]/payment/success/page.jsx`
- `/Users/user/Desktop/enfhantOrganic/frontend/app/[locale]/payment/failed/page.jsx`
- `/Users/user/Desktop/enfhantOrganic/frontend/app/[locale]/payment/pending/page.jsx`
- `/Users/user/Desktop/enfhantOrganic/frontend/app/[locale]/blog/page.jsx`
- `/Users/user/Desktop/enfhantOrganic/frontend/app/[locale]/blog/[slug]/page.jsx`
- `/Users/user/Desktop/enfhantOrganic/frontend/app/[locale]/account/page.jsx`
- `/Users/user/Desktop/enfhantOrganic/frontend/app/[locale]/[pageSlug]/page.jsx`
- `/Users/user/Desktop/enfhantOrganic/frontend/app/admin/page.jsx`

### Frontend components/libs
- `/Users/user/Desktop/enfhantOrganic/frontend/components/layout/StorefrontShell.jsx`
- `/Users/user/Desktop/enfhantOrganic/frontend/components/layout/Header.jsx`
- `/Users/user/Desktop/enfhantOrganic/frontend/components/layout/Footer.jsx`
- `/Users/user/Desktop/enfhantOrganic/frontend/components/store/checkout/CheckoutClient.jsx`
- `/Users/user/Desktop/enfhantOrganic/frontend/components/store/order/TrackOrderClient.jsx`
- `/Users/user/Desktop/enfhantOrganic/frontend/components/store/account/AccountClient.jsx`
- `/Users/user/Desktop/enfhantOrganic/frontend/components/admin/AdminPanelClient.jsx`
- `/Users/user/Desktop/enfhantOrganic/frontend/lib/api.js`
- `/Users/user/Desktop/enfhantOrganic/frontend/lib/storefront-core/routing.js`
- `/Users/user/Desktop/enfhantOrganic/frontend/lib/storefront-core/money.js`
- `/Users/user/Desktop/enfhantOrganic/frontend/lib/storefront-core/translations.js`

### Deployment / DevOps
- `/Users/user/Desktop/enfhantOrganic/docker-compose.yml`
- `/Users/user/Desktop/enfhantOrganic/docker-compose.prod.yml`
- `/Users/user/Desktop/enfhantOrganic/deploy/nginx/default.conf`
- `/Users/user/Desktop/enfhantOrganic/.github/workflows/ci.yml`
- `/Users/user/Desktop/enfhantOrganic/.github/workflows/deploy-hostinger.yml`

### Tests and migrations
- `/Users/user/Desktop/enfhantOrganic/backend/store/tests/test_checkout_and_perms.py`
- `/Users/user/Desktop/enfhantOrganic/backend/store/migrations/0001_initial.py` ... `0009_blogpost_body_fields.py`

## 7) Models That Need Changes

### Existing models to extend
- `Region` (add VAT config and provider eligibility flags)
- `Product` / `ProductPrice` (tax class and tax-included/excluded controls, stock visibility policy)
- `Order` (tax breakdown, invoice fields, shipping provider and shipment status, geolocation snapshot)
- `OrderItem` (line-level tax breakdown, warehouse allocation snapshot)
- `PaymentTransaction` (gateway metadata, wallet/mada capability flags, auth/capture/refund references)
- `CustomerAddress` (lat/lng, place_id, normalized structured address fields)
- `SiteSettings` (SEO defaults, analytics IDs, trust badges visibility toggles)

### New models required
- `TaxRate` / `TaxRule` / `TaxJurisdiction`
- `Invoice` / `InvoiceSequence` / `InvoiceEvent`
- `InvoiceQRCode` (or stored QR payload fields)
- `PaymentGatewayConfig` and `PaymentProviderRoute`
- `ShippingZone`, `ShippingRule`, `ShippingQuote`
- `CarrierAccount`, `Shipment`, `ShipmentEvent`
- `Warehouse`, `StockLedger`, `WarehouseStock`, `StockReservation`
- `OrderReturn` / `ReturnItem` / `RefundRecord`
- `NotificationTemplate` / `NotificationDeliveryLog` (email/SMS/WhatsApp channel-level)
- `AdminRole`, `AdminPermission`, `AdminRoleAssignment`
- `AdminAuditLog`
- `BackupSnapshot` / `BackupRunLog` (or documentation-only if external backup system is authoritative)

## 8) API Endpoints That Need Changes

### Existing endpoints to modify
- `POST /api/checkout/` (VAT breakdown, address geodata, shipping quote binding, carrier selection)
- `POST /api/coupons/validate/` (tax-aware totals)
- `GET /api/orders/<order_number>/` (invoice status, shipment events, return/refund statuses)
- `GET /api/navigation/` (trust badges, region payment methods, SEO public settings)
- `GET /api/catalog/`, `GET /api/products/` (country-aware stock visibility signals)
- `POST /api/payments/initiate/` (provider routing + wallet/mada options)
- `GET/PATCH /api/admin/orders/<order_number>/` (returns/refunds/shipping statuses + audit)
- `GET /api/admin/dashboard/` (tax and refund KPIs)

### New endpoints required
- `GET /api/tax/quote/`
- `GET /api/invoices/<order_number>/pdf/`
- `GET /api/invoices/<order_number>/qr/`
- `POST /api/payments/providers/<provider>/initiate/`
- `POST /api/payments/providers/<provider>/webhook/`
- `POST /api/payments/<id>/refund/`
- `POST /api/addresses/autocomplete/`
- `POST /api/addresses/geocode/`
- `POST /api/shipping/quote/`
- `POST /api/shipments/create/`
- `GET /api/shipments/<order_number>/tracking/`
- `POST /api/returns/`
- `POST /api/returns/<id>/approve/`
- `POST /api/returns/<id>/refund/`
- `GET /api/admin/audit-logs/`
- `GET /api/search/suggest/`
- `GET /api/search/`

## 9) Frontend Screens / Components That Need Changes

- Checkout page and client:
  - `/Users/user/Desktop/enfhantOrganic/frontend/app/[locale]/checkout/page.jsx`
  - `/Users/user/Desktop/enfhantOrganic/frontend/components/store/checkout/CheckoutClient.jsx`
- Thank-you/order detail:
  - `/Users/user/Desktop/enfhantOrganic/frontend/app/[locale]/thank-you/[orderNumber]/page.jsx`
- Track order page:
  - `/Users/user/Desktop/enfhantOrganic/frontend/components/store/order/TrackOrderClient.jsx`
- Account address UX:
  - `/Users/user/Desktop/enfhantOrganic/frontend/components/store/account/AccountClient.jsx`
- Global layout + SEO + analytics:
  - `/Users/user/Desktop/enfhantOrganic/frontend/app/layout.jsx`
  - localized route pages under `/frontend/app/[locale]/...`
- Header/Footer trust and payment method visibility:
  - `/Users/user/Desktop/enfhantOrganic/frontend/components/layout/Header.jsx`
  - `/Users/user/Desktop/enfhantOrganic/frontend/components/layout/Footer.jsx`
- Admin web panel:
  - `/Users/user/Desktop/enfhantOrganic/frontend/components/admin/AdminPanelClient.jsx`
- Search UX:
  - Header search flow + collections filtering components
- PWA files to add under frontend app/public:
  - `manifest`, service worker registration, icons, offline fallback

## 10) Admin Features That Need Changes

- Replace simple `is_staff` gate with RBAC roles/permissions across admin APIs.
- Add full audit logging for create/update/delete/state changes and sign-in actions.
- Add VAT/tax configuration screens.
- Add provider configuration and routing rules screens.
- Add shipping/carrier/zone/rate admin screens.
- Add warehouse and stock allocation controls.
- Add returns/refunds workflow screens.
- Add notification template/channel settings (Email/SMS/WhatsApp).
- Complete missing backend support for currently placeholder admin panel modules (SEO, Shipping, Taxes, Staff, Returns, Regions detail ops, Blog CRUD endpoint alignment).

## 11) Migrations Required

Planned migration sets (names tentative):

1. `0010_tax_foundation`
   - Add tax jurisdiction/rate/rule models
   - Add tax class fields on products/order items

2. `0011_invoice_and_zatca_phase1_fields`
   - Invoice models, sequence controls, QR payload fields, compliance flags

3. `0012_payment_gateway_abstraction`
   - Provider config/routing models
   - Extend `PaymentTransaction` for multi-gateway lifecycle

4. `0013_address_geo_and_shipping_models`
   - Extend `CustomerAddress` with lat/lng/place metadata
   - Add shipping zone/rule/quote/carrier models

5. `0014_warehouse_inventory`
   - Warehouse, stock ledger, reservations, country visibility mappings

6. `0015_returns_refunds`
   - Return and refund workflow models + order/payment status extensions

7. `0016_notifications_channels`
   - Notification templates and channel delivery logs

8. `0017_admin_rbac_and_audit`
   - Role/permission/assignment + audit log model

9. `0018_seo_and_analytics_settings`
   - Site settings extensions for GA4/GTM/Meta and SEO defaults

## 12) Environment Variables Required

### Tax / invoice
- `VAT_OM_RATE=0.05`
- `VAT_AE_RATE=0.05`
- `VAT_SA_RATE=0.15`
- `TAX_PRICE_MODE=exclusive|inclusive`
- `INVOICE_ISSUER_NAME_EN`
- `INVOICE_ISSUER_NAME_AR`
- `INVOICE_ISSUER_VAT_NUMBER`
- `INVOICE_SEQUENCE_PREFIX`
- `INVOICE_PDF_STORAGE=local|s3`
- `ZATCA_PHASE1_ENABLED=true|false`

### Payment orchestration
- `PAYMENT_DEFAULT_PROVIDER`
- `PAYMENT_PROVIDER_PRIORITY_OM`
- `PAYMENT_PROVIDER_PRIORITY_AE`
- `PAYMENT_PROVIDER_PRIORITY_SA`
- `PAYMENT_MOCK_MODE=true|false`

### PayTabs (or selected equivalent)
- `PAYTABS_ENABLED=true|false`
- `PAYTABS_PROFILE_ID`
- `PAYTABS_SERVER_KEY`
- `PAYTABS_CLIENT_KEY`
- `PAYTABS_BASE_URL`

### Thawani / OmanNet (if enabled)
- `THAWANI_ENABLED`
- `THAWANI_API_KEY`
- `THAWANI_BASE_URL`
- `OMANNET_ENABLED`
- `OMANNET_MERCHANT_ID`
- `OMANNET_API_SECRET`

### Wallet/mada capability toggles
- `APPLE_PAY_ENABLED`
- `GOOGLE_PAY_ENABLED`
- `MADA_ENABLED`

### Address/geocoding
- `MAPS_PROVIDER=google|mapbox|here`
- `MAPS_API_KEY`
- `MAPS_AUTOCOMPLETE_COUNTRIES=OM,AE,SA`

### Shipping/carriers
- `SHIPPING_MODE=rules|realtime|hybrid`
- `ARAMEX_ENABLED`
- `ARAMEX_ACCOUNT_NUMBER`
- `ARAMEX_USERNAME`
- `ARAMEX_PASSWORD`
- `SMSA_ENABLED`
- `SMSA_API_KEY`
- `FETCHR_ENABLED`
- `FETCHR_API_KEY`

### Notifications
- `SMS_PROVIDER`
- `SMS_API_KEY`
- `WHATSAPP_PROVIDER`
- `WHATSAPP_API_TOKEN`
- `WHATSAPP_SENDER_ID`

### Analytics/SEO/PWA
- `NEXT_PUBLIC_GTM_ID`
- `NEXT_PUBLIC_GA4_ID`
- `NEXT_PUBLIC_META_PIXEL_ID`
- `NEXT_PUBLIC_SITE_URL`

### Backups/ops
- `BACKUP_STORAGE=s3|local`
- `BACKUP_S3_BUCKET`
- `BACKUP_RETENTION_DAYS`
- `BACKUP_ENCRYPTION_KEY`

## 13) Third-Party Dependencies (Planned)

### Backend
- PDF/templating: `reportlab` or `weasyprint` (invoice generation)
- QR generation: `qrcode`
- Phone validation: `phonenumbers`
- Geospatial calculations: `geopy`
- Task queue: `celery` + `redis` (notifications, invoice jobs, carrier sync, backup jobs)
- Optional search backend: `meilisearch` client or `elasticsearch` client

### Frontend
- Map + pin UI: `@mapbox/mapbox-gl` or Google Maps JS SDK wrapper
- Address autocomplete component package
- PWA integration: `next-pwa` (or native service worker setup)

### Provider SDK/API integrations
- PayTabs SDK/API client
- Thawani API client
- OmanNet integration adapter
- Aramex/SMSA/Fetchr integration adapters
- SMS provider (Twilio/Vonage/local GCC provider)
- WhatsApp Business API client

## 14) Testing Plan

### Backend tests
- Unit tests:
  - VAT calculations by country and edge cases (discounted/tax-inclusive/free shipping)
  - Invoice numbering and QR payload generation
  - Payment provider routing logic and fallback
  - Shipping rule engine and carrier quote normalization
  - Stock allocation across warehouses and reservation release
  - Return/refund transitions and invariants
  - RBAC permission checks and audit event writing
- Integration tests:
  - Checkout -> payment initiate -> webhook -> order/invoice state
  - Checkout with map address and geocoding flow
  - Shipment creation/tracking update
  - Return approval -> refund -> notification dispatch

### Frontend tests
- Component tests:
  - Checkout tax/total rendering and payment method availability by region
  - Address autocomplete/pin-on-map interactions
  - Order timeline including return/refund statuses
  - SEO metadata and structured data generation
- E2E flows:
  - Guest checkout by each region
  - Online payment success/fail/pending flows
  - Track order + return request
  - Admin role-restricted actions and audit visibility

### Non-functional checks
- `python manage.py check`
- migration smoke (`migrate` on clean DB)
- frontend build (`npm run build`)
- lighthouse checks (SEO/PWA)
- webhook signature verification replay tests
- backup restore drill in staging

## 15) Safe Implementation Order

1. Data model foundations (tax, invoice, address geo, shipping, warehouse, returns, RBAC, audit)  
2. VAT engine and totals integration in checkout/order serializers  
3. Invoice PDF + ZATCA Phase 1 fields/QR generation pipeline  
4. Payment gateway abstraction + PayTabs + region routing + mock mode  
5. Wallet/mada capability exposure per region/provider  
6. Address autocomplete + map pin + lat/lng persistence  
7. Shipping engine upgrade + carrier abstraction + admin controls  
8. Warehouse inventory + region stock visibility  
9. Full order lifecycle extensions (shipped/returned/refunded)  
10. Notification expansion (email/SMS/WhatsApp templates + delivery logs)  
11. Frontend trust/payment badges + policy visibility by region  
12. Analytics tags (GTM/GA4/Meta) and consent-safe loading  
13. SEO system (metadata, OG, JSON-LD, sitemap, robots, canonical)  
14. Smart search (index + suggest + typo tolerance)  
15. PWA package (manifest, SW, offline fallback)  
16. Admin RBAC UI + audit log UI + placeholder module completion  
17. Backup/restore automation + runbook  
18. Handover docs + support/SLA + UAT checklist and sign-off pack

## 16) Immediate Next Step (After Plan Approval)

Begin implementation from Step 1 (data model foundations) with migration-first approach, then wire APIs, then frontend/admin, while keeping current working features intact and backward compatible.
