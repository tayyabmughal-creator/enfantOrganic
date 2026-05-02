# Project Structure

This project is intentionally split by stack and domain so it can grow without turning into a few overloaded files.

## Backend

`backend/store/models.py`
Compatibility export file. Keep imports stable for Django/admin/migrations.

`backend/store/domain_models/`
Domain model definitions grouped by responsibility.

- `base.py`: shared abstract models.
- `catalog.py`: regions, site settings, categories, tags, products, pricing, homepage/media content.
- `commerce.py`: orders, order items, coupons, payment transactions, customer addresses, reviews, wishlist items, newsletter subscriptions, push devices, notification logs.

`backend/store/serializers.py`
Compatibility export file for serializers.

`backend/store/api_serializers/`
DRF serializers grouped by API responsibility.

- `localization.py`: locale helpers, localized field helpers, image URL helpers.
- `catalog.py`: region, category, product, homepage/content serializers.
- `orders.py`: order, order item, and transaction serializers.
- `checkout.py`: checkout input validation and order creation.
- `account.py`: registration, profile, address book, review creation, push-device serializers.

`backend/store/views.py`
Compatibility export file for API views.

`backend/store/api_views/`
API views grouped by route area.

- `context.py`: request locale/region context and shared product queryset.
- `storefront.py`: navigation, home, catalog, product list, product detail.
- `checkout.py`: checkout creation endpoint.
- `orders.py`: order lookup endpoint.
- `account.py`: customer auth-adjacent account, address, order history, cancel, review, and push-token endpoints.
- `admin_ops.py`: staff-only dashboard, CRUD/list APIs, moderation summary, and CSV report endpoints for web/mobile admin.

`backend/store/notifications.py`
Expo push notification helper and notification logging.

`backend/store/sample_data.py`
Seed catalog data and regional storefront content.

`backend/store/admin.py`
Django admin registrations and admin actions.

## Frontend

`frontend/app/`
Next.js App Router pages.

- `[locale]/page.jsx`: localized homepage.
- `[locale]/collections/page.jsx`: collection/catalog listing.
- `[locale]/product/[slug]/page.jsx`: product detail.
- `[locale]/checkout/page.jsx`: checkout.
- `[locale]/thank-you/[orderNumber]/page.jsx`: order confirmation and timeline.
- `[locale]/track-order/page.jsx`: order lookup.
- `[locale]/[pageSlug]/page.jsx`: static informational pages such as about, contact, FAQ, policies, privacy, and terms.

`frontend/components/store/`
Storefront feature components grouped by flow.

- `cart/`: cart provider, drawer, persistent cart behavior.
- `catalog/`: collection filtering and catalog product grid.
- `checkout/`: checkout client form and order submission.
- `order/`: track-order client UI.
- `product/`: product detail UI and quick-view modal.

`frontend/components/cards/`
Reusable product, category, and testimonial cards.

`frontend/components/layout/`
Storefront shell, header, footer, and navigation layout.

`frontend/components/ui/`
Small reusable UI primitives.

`frontend/lib/storefront.js`
Compatibility export file for storefront helpers.

`frontend/lib/storefront-core/`
Shared storefront helpers grouped by concern.

- `routing.js`: locale/region normalization and URL building.
- `money.js`: region-aware currency formatting.
- `translations.js`: shared UI copy.

`frontend/app/styles/`
Global styles split by area.

- `tokens.css`: design tokens and base layout utilities.
- `header.css`: announcement, header, navigation, dropdowns.
- `home.css`: homepage sections, cards, newsletter, footer.
- `catalog-product.css`: catalog, filters, product detail, tabs.
- `overlays.css`: cart drawer, quick view, modals, responsive rules.
- `checkout-order.css`: checkout, thank-you, timeline, track order.

`frontend/public/enfant/`
Local Enfant brand/product assets used by the storefront.

## Admin Mobile

`admin-mobile/`
Expo/React Native admin app connected to the shared Django API.

- `App.js`: native admin login, dashboard, section navigation, and push-token registration.
- `app.json`: Expo app configuration.
- `package.json`: Expo/mobile dependencies and scripts.

## Deployment

- `.env.example`: shared environment variable template.
- `backend/.env.example`: backend-specific environment template.
- `frontend/.env.example`: frontend API URL template.
- `backend/Dockerfile`: Django/Gunicorn container.
- `frontend/Dockerfile`: Next.js production container.
- `docker-compose.yml`: local production-like stack with PostgreSQL.
- `.github/workflows/ci.yml`: backend check and frontend build workflow.
