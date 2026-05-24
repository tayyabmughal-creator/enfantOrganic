# Enfant Organic — Project Understanding Document (Owner Edition)

Prepared: 2026-05-19
Status: **Production-ready** (pending merchant credential handover and TLS provisioning — see Section 12)

This document is the business-and-operations view of the platform you own. It is written for the merchant/owner, not for engineers. Pair it with `docs/HANDOVER.md` and `docs/OPERATIONS_RUNBOOK.md` when you need the technical detail.

---

## 1. What You Own

A **bilingual (Arabic / English) regional e-commerce platform** selling organic baby-care products across the GCC:

| Region | Code | Currency | VAT |
|---|---|---|---|
| Oman | `om` | OMR | 5% |
| United Arab Emirates | `ae` | AED | 5% |
| Saudi Arabia | `sa` | SAR | 15% |

The platform is a **single codebase with three deliverables** running off one Django database:

| Deliverable | Audience | Where it lives |
|---|---|---|
| **Storefront** (web) | Customers | `frontend/` (Next.js 15) — public web shop in EN/AR with RTL |
| **Admin Panel** (web) | You and your staff | `frontend/app/admin/` + `/api/admin/*` routes |
| **Admin Mobile App** | Operations staff on the go | `admin-mobile/` (Expo React Native) |

Everything talks to the same API and the same data, so an order placed on the web is the same order your staff sees on mobile.

---

## 2. What the Customer Experiences

1. Lands on the storefront in their language (auto-detected, switchable).
2. Browses by category or search; filters by price, tags, region availability.
3. Adds items to a persistent cart (survives page reload, device locale change, region switch with live re-pricing).
4. Checks out as guest or logged-in customer.
   - 5-field quick checkout via Apple Pay where the merchant profile is enabled.
   - Full checkout with map pin / address autocomplete (Google Maps) — falls back to manual entry if no API key.
   - Coupons validated live.
   - VAT and shipping calculated per region; KSA gets ZATCA Phase 1 QR on invoices.
5. Pays via Cash on Delivery, Online (Paymob / PayTabs / Thawani / OmanNet), WhatsApp confirmation, or Bank Transfer.
6. Receives bilingual email (and, when enabled, SMS / WhatsApp) confirmations.
7. Tracks the order via a public link or signed-in account.

---

## 3. What You and Your Staff Can Do

Through the **Admin Panel** (web at `/admin`, mirrored on mobile):

- **Catalog**: products, categories, tags, hero promo cards, blog posts, testimonials, regional pricing, stock by warehouse.
- **Orders**: view, filter, cancel, refund (gateway or manual), create shipments, refresh tracking, download invoices.
- **Customers**: list, view detail, see order history.
- **Promotions**: coupons, free-shipping rules.
- **Returns**: review and process RMAs.
- **Reports**: CSV export for orders, customers, inventory, low-stock.
- **Site Settings**: regional payment providers, default provider, supported methods, shipping fees, VAT thresholds.
- **Audit Logs**: every sensitive admin action is recorded, including CSV exports and refunds.

Permissions are role-based (Owner, Manager, Finance, etc.). Only users with the relevant capability can issue refunds, change site settings, or run CSV exports.

---

## 4. Technology Stack (One-Page View)

| Layer | Technology | Notes |
|---|---|---|
| Storefront UI | Next.js 15 App Router + React 19 | Server-rendered, PWA-capable |
| API | Django 4.2 + Django REST Framework 3.15 | JWT auth |
| Database | PostgreSQL (production) / SQLite (local dev) | |
| Async / queues | Celery + Redis | notification dispatch, scheduled jobs |
| Reverse proxy / TLS | Nginx | CSP, HSTS, security headers |
| Container runtime | Docker Compose | one stack file per environment |
| Hosting | Hostinger VPS (Docker) | deploy via GitHub Actions |
| Mobile admin | Expo SDK 52 / React Native 0.76 | |

You do not need separate licences for any of the above — all of it is open-source. Third-party costs come from the **integrations** (Section 6), not the stack.

---

## 5. How the Pieces Connect

```
                ┌──────────────────┐
   Customers ──►│  Next.js Web App │──┐
                └──────────────────┘  │
                ┌──────────────────┐  │     ┌────────────────┐     ┌──────────────┐
   Staff (web) ►│   Admin Panel    │──┼────►│  Django REST   │────►│  PostgreSQL  │
                └──────────────────┘  │     │  (Gunicorn)    │     └──────────────┘
                ┌──────────────────┐  │     │                │     ┌──────────────┐
   Staff (app) ►│  Expo Admin App  │──┘     │                │────►│   Redis      │
                └──────────────────┘        └───────┬────────┘     └──────────────┘
                                                    │
                       ┌────────────────────────────┼────────────────────────────┐
                       ▼                            ▼                            ▼
              Payment providers              Shipping carriers          Notifications
              Paymob, PayTabs,               Aramex, SMSA, Fetchr,      SMTP email,
              Thawani, OmanNet               Manual                     SMS (Unifonic /
                                                                        Twilio), WhatsApp
```

All external traffic enters through **Nginx**, which routes `/api/*` to Django and everything else to Next.js. Static and uploaded media are served from Docker volumes.

---

## 6. Third-Party Integrations and Your Accounts

These are **services you (the merchant) must own** — credentials live in `.env.production` on the server, never in the code. Each integration is built to **fail safely** (the storefront will not crash) if a provider is misconfigured or disabled.

### Payments
| Provider | Code path | What you provide |
|---|---|---|
| **Paymob** | `services/paymob.py` | API key, integration ID, iframe ID, HMAC secret. Apple Pay needs its own integration + iframe IDs. |
| **PayTabs** (primary GCC) | `services/paytabs.py` | Profile ID + server key per region (OM / AE / SA). |
| **Thawani** (Oman) | `services/thawani.py` | Publishable + secret key + webhook secret (toggled via `THAWANI_ENABLE_REAL_API`). |
| **OmanNet** | `services/omannet.py` | Merchant ID, access code, SHA secrets. Final acquirer mapping pending. |
| **HyperPay / Telr** | placeholders | Wire only when needed. |

> **Important:** Apple Pay, Google Pay, and Mada require **merchant-profile-level approval** from the acquirer in addition to the code being present. Do not mark them live in production until the provider confirms activation.

### Shipping carriers
| Carrier | Status | Your responsibility |
|---|---|---|
| Aramex | adapter ready | API user/pass, account number, pin, entity, country |
| SMSA | adapter ready | API key + account number |
| Fetchr | scaffold | Production contract |
| Manual | always available | Used when no carrier is configured or when you ship yourself |

### Messaging
- **Email** (SMTP): required. Default sender address is yours.
- **SMS**: Unifonic (default) or Twilio. SMS sender IDs need approval by local telecom.
- **WhatsApp Cloud API**: phone number ID + access token + approved templates from Meta.

### Marketing & maps
- **Google Maps Places** (`NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`) — drives the address autocomplete and pin picker.
- **Google Tag Manager / GA4 / Meta Pixel** — IDs go in frontend env. Consent banner is built in.

A consolidated credential ownership matrix is in `docs/ENVIRONMENT_VARIABLES.md` (look at the "Who provides it" column).

---

## 7. Data You Own

The PostgreSQL database holds the entire business:

- **Catalog** — Region, TaxRate, ShippingRule, SiteSettings, Category, Tag, Product, ProductPrice, Warehouse, ProductStock, BlogPost, HeroPromoCard, Testimonial, InstagramPost.
- **Commerce** — Order, OrderItem, OrderStatusHistory, PaymentTransaction, ReturnRequest, CustomerAddress, Coupon, Review, WishlistItem, NewsletterSubscription.
- **Compliance & ops** — NotificationLog, WhatsAppLog, AdminAuditLog.

Every order carries **immutable snapshots** of tax, shipping, payment, and invoice metadata so that a customer's record cannot drift when you later change a price, tax rate, or carrier.

**Backups**: `scripts/backup_now.sh` produces a single encrypted tarball (Postgres dump + media volume). It can ship to S3 if `S3_BUCKET` is configured. Restore is `scripts/restore_backup.sh`. Cadence and retention is defined in your maintenance agreement — recommended baseline is daily full + weekly offsite.

---

## 8. How Your Money Moves

1. Customer selects an online payment method at checkout.
2. The platform creates a `PaymentTransaction` record, calls the relevant provider, and redirects the customer to the provider's hosted page (`safeRedirectUrl()` validates the destination against an allowlist — no open-redirect risk).
3. The provider charges the customer, then notifies the platform via **two channels**:
   - **Browser redirect** back to `/<locale>/payment/{success|failed|pending}`.
   - **Webhook** to `/api/payments/webhook/<provider>/` — this is the **authoritative** source. Signatures are verified; duplicate webhooks are idempotent.
4. On success: order status moves forward, customer notification fires, invoice is generated, stock is decremented.
5. Refunds happen from the admin panel via `POST /api/admin/orders/<order>/refund/`. Mode is either `gateway` (provider refund API) or `manual` (recorded only — used for bank-transfer reversals). Stock is restored where applicable.

You should **never** edit the database directly to "fix" a payment — every change must go through the admin endpoints so audit logs, stock, and customer notifications stay consistent.

---

## 9. Security Posture (What's Already Done For You)

- HTTPS-only in production with HSTS, secure cookies, CSP, X-Frame-Options DENY, content-type sniffing off.
- JWT auth (15 min access, 7 day refresh, rotation + blacklist on rotation).
- API rate limits: auth 20/min, checkout 30/hour, payment 60/hour, order-lookup 5/hour, webhook 120/min, password-reset 3/hour.
- Webhook payloads verified by HMAC signature on Paymob, PayTabs, Thawani, OmanNet, and WhatsApp.
- Guest order lookup uses a **timing-safe `lookup_token`** (no enumeration by order number).
- Admin CSV exports capped (`ADMIN_CSV_MAX_ROWS`) and audit-logged.
- Payment redirect destinations validated against an allowlist (`safeRedirectUrl()`).
- File upload size capped at 10 MB; Django `SECURE_*` flags driven from env vars.
- Redis is password-protected in production compose.
- Sensitive routes (checkout, payment, account, admin) excluded from PWA cache.

Detailed reference: `SECURITY.md` and `docs/OPERATIONS_RUNBOOK.md`.

---

## 10. Deployment and Hosting

- **Production stack**: `docker-compose.prod.yml` runs Postgres, Django/Gunicorn, Next.js, Nginx as four containers on a Hostinger VPS.
- **Deploy trigger**: push to `main` (or manual workflow dispatch). GitHub Actions ships files to the VPS over SSH, writes `.env.production`, rebuilds containers, and runs a public health check.
- **Required GitHub secrets**: listed in `README.md` Hostinger section.
- **Health endpoints** post-deploy: `GET /` and `GET /api/navigation/?locale=en&region=om`.
- **Rollback**: `git checkout <good-sha>` on the VPS, then `docker compose up -d --build`. Restore DB from backup if schema changed.

Operating instructions are in `docs/OPERATIONS_RUNBOOK.md`.

---

## 11. Support, Maintenance, and SLA

Defined in `docs/SUPPORT_AND_MAINTENANCE.md`:

| Severity | Response | Resolution target |
|---|---|---|
| S1 — production outage / revenue-blocking | ≤ 1 hour | ≤ 8 hours hotfix |
| S2 — major feature degraded | ≤ 4 hours | ≤ 2 business days |
| S3 — functional bug, workaround exists | ≤ 1 business day | ≤ 5 business days |
| S4 — cosmetic / minor | ≤ 2 business days | next release cycle |

Monthly maintenance covers security patches, log review, backup drills, minor bugs, performance review, and key-rotation assistance. Items explicitly **excluded** (new features, redesigns, hosting migration, third-party legal onboarding, data recovery without valid backups) need a separate scope.

Escalation path: L1 ops triage → L2 engineering → L3 provider escalation with your involvement.

---

## 12. Final Steps to Go Live

These items require **you or your operations team** — engineering cannot complete them unilaterally:

1. **DNS & TLS** — point your domain at the Hostinger VPS IP; place TLS certs in `deploy/nginx/certs/`.
2. **Generate `DJANGO_SECRET_KEY`** for production (one-off random 64-char string).
3. **Set `REDIS_PASSWORD`** in `.env.production`.
4. **Set `FRONTEND_PUBLIC_URL`** to your live domain.
5. **Rotate `PAYMOB_API_KEY`** (the local `.env` carries the original sandbox key — it must be rotated before go-live).
6. **Provide all merchant credentials** for the providers you plan to use (see Section 6). Confirm Apple Pay / Google Pay / Mada profile-side activation if you want those badges enabled.
7. **Approve WhatsApp templates** in Meta if you want WhatsApp order notifications.
8. **Approve SMS sender ID** with your telecom (per region).
9. **Run `python manage.py migrate`** the first time and any time you take a new release.
10. **Walk through the LAUNCH_CHECKLIST.md** — 30 sign-off items covering UAT, payments, invoicing, RTL, analytics, backup, security review.

When all 10 are complete and the launch checklist is signed, the platform is live.

---

## 13. Where to Look First

| You need to… | Open this |
|---|---|
| Restart or check a container | `docs/OPERATIONS_RUNBOOK.md` §9 |
| Issue a refund or cancel an order | `docs/OPERATIONS_RUNBOOK.md` §5–6 |
| Onboard a new payment provider | `docs/PAYMENT_SETUP.md` |
| Add or rotate a credential | `docs/ENVIRONMENT_VARIABLES.md` |
| Run a backup or restore | `docs/BACKUP_AND_RESTORE.md` |
| Understand the system at engineering depth | `docs/ARCHITECTURE.md` |
| Verify launch readiness | `LAUNCH_CHECKLIST.md` |
| Hand the project to a new engineer | `docs/HANDOVER.md` |

---

## 14. Bottom Line

The codebase is feature-complete for a GCC bilingual storefront with multi-region tax, payments, shipping, and notifications. **The remaining go-live work is procurement and configuration, not engineering**: certificates, secrets, provider credentials, and merchant-side approvals. Once those are in place, the deploy workflow and operational runbooks let your team run the platform without ongoing developer involvement for routine work.
