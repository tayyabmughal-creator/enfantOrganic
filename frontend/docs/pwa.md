# PWA Setup

This project uses `@ducanh2912/next-pwa` for service worker generation.

## Implemented

1. Web manifest route at `/manifest.webmanifest` from `app/manifest.js`.
2. Installable icon set in `public/icons/`.
3. Theme color in root viewport metadata (`#f8f9f4`).
4. Service worker build via `next.config.mjs`.
5. Offline fallback page at `/offline`.

## Safe Caching Rules

The service worker explicitly uses `NetworkOnly` for sensitive routes:

- `/admin/**`
- `/(en|ar)/checkout/**`
- `/(en|ar)/payment/**`
- `/(en|ar)/account/**`
- `/api/checkout/**`
- `/api/payments/**`
- `/api/auth/**`
- `/api/admin/**`
- `/api/account/**`
- `/api/orders/**`

These routes are also denied from navigation fallback.

## Local Verification

1. Build production assets:
   - `npm run build`
2. Start production server:
   - `npm run start`
3. Open Chrome DevTools:
   - Application > Manifest (confirm installability)
   - Application > Service Workers (confirm active SW)
4. Test offline:
   - Toggle Network to Offline
   - Visit a cached page and then an unknown page to confirm `/offline` fallback
5. Confirm sensitive routes are not cached:
   - Application > Cache Storage
   - Verify checkout/payment/admin/auth responses are absent
