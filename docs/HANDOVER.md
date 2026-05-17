# ENFANT ORGANIC Handover Guide

This document is the operational handover for the ENFANT ORGANIC GCC storefront (Oman, UAE, KSA).

## 1) Project Overview

- Backend: Django + Django REST Framework (`backend/`)
- Frontend: Next.js App Router storefront (`frontend/`)
- Admin: Django admin + custom admin APIs/UI (`/api/admin/*`, `frontend/app/admin/page.jsx`)
- Mobile admin shell: Expo app (`admin-mobile/`)
- Data: PostgreSQL in Docker production deployments (SQLite fallback for quick local backend-only setup)
- Deploy target: Docker Compose stack behind Nginx (Hostinger VPS workflow included)

Core launch modules in codebase include VAT by region, invoice PDFs (KSA QR Phase 1 structure), provider-based payments, map-aware addresses, shipping rules + carrier abstraction, multi-warehouse stock, order/returns/refunds workflow, notifications (email/SMS/WhatsApp scaffolding), analytics hooks, SEO, PWA, roles, audit logs, and backup/restore scripts.

## 2) Repository Structure

```text
enfhantOrganic/
├── backend/                  # Django project (API, models, services, admin, tests)
│   ├── enfant_backend/       # Django settings/urls/wsgi/asgi
│   ├── store/                # Domain models, serializers, views, services
│   ├── templates/            # Admin and email templates
│   └── requirements.txt
├── frontend/                 # Next.js storefront (App Router)
│   ├── app/                  # Routes, layout, sitemap, robots, PWA manifest
│   ├── components/           # Store/admin UI components
│   └── lib/                  # API client, SEO, analytics, routing helpers
├── admin-mobile/             # Expo admin mobile shell
├── deploy/nginx/default.conf # Reverse proxy config
├── docker-compose.yml        # Local docker stack
├── docker-compose.prod.yml   # Production docker stack
├── scripts/                  # backup_now.sh / restore_backup.sh
└── docs/                     # Operations and handover docs
```

## 3) Backend Commands

Run from `backend/` unless noted:

```bash
python3 -m pip install -r requirements.txt
cp .env.example .env
python3 manage.py migrate
python3 manage.py seed_store
python3 manage.py runserver
```

Useful backend operations:

```bash
python3 manage.py check
python3 manage.py check --deploy
python3 manage.py test
python3 manage.py createsuperuser
python3 manage.py copy_review_csv export --file docs/arabic_copy_review.csv
python3 manage.py copy_review_csv import --file docs/arabic_copy_review.csv --dry-run
```

## 4) Frontend Commands

Run from `frontend/`:

```bash
npm install
cp .env.example .env.local
npm run dev
npm run build
npm run start
```

## 5) Deployment Commands (Docker/VPS)

From repo root:

```bash
cp .env.production.example .env.production
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build --remove-orphans
docker compose -f docker-compose.prod.yml --env-file .env.production ps
docker compose -f docker-compose.prod.yml --env-file .env.production logs -f backend
docker compose -f docker-compose.prod.yml --env-file .env.production logs -f frontend
docker compose -f docker-compose.prod.yml --env-file .env.production logs -f nginx
```

Post-deploy validation:

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production exec -T backend python manage.py check
docker compose -f docker-compose.prod.yml --env-file .env.production exec -T nginx nginx -t
curl -I https://<your-domain>/
curl -I https://<your-domain>/api/navigation/?locale=en&region=om
```

## 6) Common Troubleshooting

1. GitHub Action is green but site did not update  
   - SSH to VPS, go to deploy path, run:
   ```bash
   docker compose -f docker-compose.prod.yml --env-file .env.production ps
   docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build --remove-orphans
   docker compose -f docker-compose.prod.yml --env-file .env.production restart nginx
   ```
   - Confirm `NEXT_PUBLIC_API_BASE_URL` points to the live domain API URL.

2. Frontend works but checkout fails with API/network errors  
   - Validate `NEXT_PUBLIC_API_BASE_URL`, CORS (`DJANGO_CORS_ALLOWED_ORIGINS`), and CSRF trusted origins.

3. Payment option is visible but initiation fails  
   - Check region payment settings and provider credentials.
   - Verify enabled providers in region config match configured credentials.

4. Map picker not showing  
   - Check `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`.
   - Checkout still supports manual address fallback by design.

5. Invoice PDF not generated  
   - Ensure backend dependencies are installed (`reportlab`, `qrcode`, `arabic-reshaper`, `python-bidi`).
   - Invoice requires paid order state.

6. Webhook callbacks not updating payments  
   - Confirm callback URL reachability.
   - Check signature/HMAC secrets and server logs.

7. Order stock mismatch after cancel/refund/failed payment  
   - Review order timeline + payment transactions + inventory restore logs.
   - Use admin order update/refund flows only (avoid direct DB edits).

## 7) Key Operational Endpoints

- Storefront API base: `/api/`
- Payment initiate: `POST /api/payments/initiate/`
- Payment retry: `POST /api/payments/retry/`
- Payment status: `GET /api/payments/status/<order_number>/`
- Customer invoice: `GET /api/orders/<order_number>/invoice/?token=<token>`
- Admin invoice: `GET /api/admin/orders/<order_number>/invoice/`
- Admin shipment create/manual tracking: `POST /api/admin/orders/<order_number>/shipment/create/`
- Admin tracking refresh: `POST /api/admin/orders/<order_number>/shipment/refresh/`
- Admin refund: `POST /api/admin/orders/<order_number>/refund/`
- Admin permissions snapshot: `GET /api/admin/me/`

## 8) Handover Notes

- Never store secrets in git-tracked files.
- Keep `.env.production` only on server.
- Use `docs/ENVIRONMENT_VARIABLES.md` and `docs/PAYMENT_SETUP.md` for credential ownership and provider onboarding.
- Use `docs/OPERATIONS_RUNBOOK.md` for day-2 operations and incident handling.
