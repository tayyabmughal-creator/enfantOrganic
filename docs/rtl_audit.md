# RTL Audit Report

Date: 2026-05-13  
Project: ENFANT ORGANIC storefront (Next.js App Router)

## Scope Completed

1. Document language and direction
   - `lang="en"` + `dir="ltr"` confirmed for English routes.
   - `lang="ar"` + `dir="rtl"` confirmed for Arabic routes.

2. Direction-aware UI behavior
   - Category carousel arrows/scroll behavior mirrored for Arabic.
   - Back-link arrows on blog/static pages mirrored for Arabic.
   - Cart drawer shadow mirrored for RTL opening side.

3. Logical CSS and directional properties
   - Replaced remaining storefront `left/right` usage with logical `inset-inline`.
   - Verified no remaining non-admin `left/right`, `margin-left/right`, `padding-left/right`, `text-align: left/right` directional CSS patterns.

4. LTR inputs inside RTL pages
   - Added RTL-safe LTR behavior for contact/numeric-like fields.
   - Applied to email/phone and order/code/ID numeric-like inputs in checkout, account, track order, and newsletter forms.

5. Arabic fallback behavior
   - `uiText()` now merges locale dictionary over English defaults, so missing Arabic keys safely fall back to English.

## Files Updated for RTL Completion

- `frontend/app/layout.jsx` (already correct, verified)
- `frontend/middleware.js` (already correct, verified)
- `frontend/lib/storefront-core/translations.js`
- `frontend/components/store/CategoryCarousel.jsx`
- `frontend/app/[locale]/page.jsx`
- `frontend/app/[locale]/blog/[slug]/page.jsx`
- `frontend/app/[locale]/[pageSlug]/page.jsx`
- `frontend/app/styles/home.css`
- `frontend/app/styles/overlays.css`
- `frontend/app/styles/tokens.css`
- `frontend/components/store/checkout/CheckoutClient.jsx`
- `frontend/components/store/account/AccountClient.jsx`
- `frontend/components/store/order/TrackOrderClient.jsx`
- `frontend/components/store/NewsletterForm.jsx`

## Tested Pages

Runtime checks (local dev server):

- `/en?region=sa` → `200`, `<html lang="en" dir="ltr">`
- `/ar?region=sa` → `200`, `<html lang="ar" dir="rtl">`
- `/ar/checkout?region=sa` → `200`
- `/ar/collections?region=sa` → `200`
- `/ar/account?region=sa` → `200`
- `/ar/blog?region=sa` → `200`

Targeted surface audit coverage:

- Header + mega menu: verified direction-safe layout rules and controls.
- Mobile menu: verified logical positioning and dropdown controls.
- Cart drawer: verified RTL side + mirrored shadow.
- Checkout: verified RTL labels, map/address section, and LTR contact/numeric inputs.
- Product listing/detail: verified no hard directional CSS dependencies.
- Account: verified RTL content + LTR login/email inputs.
- Thank-you page: verified RTL labels and status/totals layout.
- Footer + modals: verified logical properties and no hardcoded left/right layout dependencies.

## Build Verification

- `npm run build` (frontend) passes successfully after RTL changes.
