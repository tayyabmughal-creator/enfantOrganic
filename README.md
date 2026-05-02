# Enfant Organic Store

This workspace contains a separated Django + Next.js e-commerce storefront for a regional bilingual Enfant Organic store.

- `backend/`: Django + DRF API, JWT auth, admin, catalog data, checkout, orders, reviews, coupons, reports, push-device registration, and regional pricing.
- `frontend/`: Next.js App Router storefront with reusable feature components, regional currency support, Arabic/English routes, and local Enfant product assets.
- `admin-mobile/`: Expo/React Native admin app shell connected to the same Django API.

See [PROJECT_STRUCTURE.md](PROJECT_STRUCTURE.md) for the current module layout and where new code should go.

## Frontend

1. `cd /Users/user/Desktop/enfhantOrganic/frontend`
2. `cp .env.example .env.local`
3. `npm install`
4. `npm run dev`

The storefront expects the API at `NEXT_PUBLIC_API_BASE_URL`, defaulting to `http://127.0.0.1:8000/api`.

## Backend

1. `cd /Users/user/Desktop/enfhantOrganic/backend`
2. `cp .env.example .env`
3. `python3 -m pip install -r requirements.txt`
4. `python3 manage.py migrate`
5. `python3 manage.py seed_store`
6. `python3 manage.py runserver`

The backend uses SQLite by default for quick local setup. Set `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_HOST`, and `POSTGRES_PORT` for PostgreSQL.

## Admin Mobile

1. `cd /Users/user/Desktop/enfhantOrganic/admin-mobile`
2. Set `EXPO_PUBLIC_API_BASE_URL` to the backend API, for example `http://127.0.0.1:8000/api`.
3. `npm install`
4. `npm run start`

The app is a native Expo shell, not a WebView. It includes staff login, dashboard metrics, section navigation, safe-area handling, and Expo push-token registration.

## Deployment

- Root `.env.example` documents shared local variables.
- `.env.production.example` documents production deployment variables.
- `docker-compose.yml` runs PostgreSQL, Django/Gunicorn, and Next.js for local Docker usage.
- `docker-compose.prod.yml` runs PostgreSQL, Django/Gunicorn, Next.js, and Nginx for VPS production usage.
- `deploy/nginx/default.conf` proxies `/api/`, `/django-admin/`, `/static/`, and `/media/` to the correct service.
- `backend/Dockerfile` and `frontend/Dockerfile` build production containers.
- `.github/workflows/ci.yml` runs backend checks and frontend builds on PRs.
- `.github/workflows/deploy-hostinger.yml` deploys the Docker stack to a Hostinger VPS over SSH.

### Hostinger VPS Deployment

This workflow expects Hostinger VPS hosting with Docker and Docker Compose installed. Hostinger shared hosting usually does not support Docker containers.

1. Create a VPS folder, for example `/home/deploy/enfhantOrganic`.
2. Add these GitHub repository secrets:
   - `HOSTINGER_SSH_HOST`
   - `HOSTINGER_SSH_USER`
   - `HOSTINGER_SSH_KEY`
   - `HOSTINGER_SSH_PORT`
   - `HOSTINGER_DEPLOY_PATH`
   - `HOSTINGER_HTTP_PORT`
   - `DJANGO_SECRET_KEY`
   - `DJANGO_ALLOWED_HOSTS`
   - `DJANGO_CORS_ALLOWED_ORIGINS`
   - `DJANGO_CSRF_TRUSTED_ORIGINS`
   - `POSTGRES_DB`
   - `POSTGRES_USER`
   - `POSTGRES_PASSWORD`
   - `NEXT_PUBLIC_API_BASE_URL`
3. Optional email/security secrets are also supported by `.github/workflows/deploy-hostinger.yml`.
4. Push to `main` or manually run the `Deploy to Hostinger` workflow.
5. After first deploy, seed catalog data if needed:

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production exec backend python manage.py seed_store
docker compose -f docker-compose.prod.yml --env-file .env.production exec backend python manage.py complete_demo_catalog
```

## API Endpoints

- `/api/navigation/`
- `/api/home/`
- `/api/catalog/`
- `/api/products/`
- `/api/products/<slug>/`
- `/api/checkout/`
- `/api/orders/<order_number>/`
- `/api/auth/token/`
- `/api/auth/token/refresh/`
- `/api/auth/token/logout/`
- `/api/auth/register/`
- `/api/auth/password-reset/`
- `/api/auth/password-reset/confirm/`
- `/api/account/profile/`
- `/api/account/addresses/`
- `/api/account/orders/`
- `/api/account/orders/<order_number>/cancel/`
- `/api/account/wishlist/`
- `/api/reviews/`
- `/api/newsletter/`
- `/api/notifications/devices/`
- `/api/notifications/devices/deactivate/`
- `/api/admin/dashboard/`
- `/api/admin/moderation/`
- `/api/admin/reports/<orders|customers|inventory|low-stock>/`
- `/api/admin/products/`
- `/api/admin/categories/`
- `/api/admin/orders/`
- `/api/admin/customers/`
- `/api/admin/promotions/`
- `/api/admin/reviews/`
- `/api/admin/regions/`
- `/api/admin/settings/`
- `/api/schema/`
- `/api/docs/`

## Notes

- The storefront currently expects the backend API to be available when rendering pages.
- Do not commit real `.env` files or production secrets.
