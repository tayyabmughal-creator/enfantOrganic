# Google Maps — Production Setup (Checkout address autocomplete + map pin)

The checkout page (`frontend/components/store/checkout/CheckoutClient.jsx`) uses the
**Google Maps JavaScript SDK** for:
- Places **Autocomplete** on the address field
- A draggable **map pin** + **"use my location"** geolocation
- **Reverse geocoding** (pin/geolocation → address fields)

It centres the map per region automatically (Oman 23.588,58.383 · UAE 25.205,55.271 ·
Saudi 24.714,46.675), so **all regions show the correct location** out of the box.

## Key

```
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=AIzaSyAzLn2u7C5Gve-zmLJoj73IH_lfQPBMKY4
```

This is a **browser key** — it is public by design (it ships inside the client JS
bundle). Its security comes from the **HTTP-referrer restriction**, NOT from secrecy.

## How it is wired (already done in this repo)

`NEXT_PUBLIC_*` values are inlined into the client bundle at **build time**, so the
key is passed all the way through the production build:

1. `frontend/Dockerfile` — `ARG`/`ENV NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` in builder + runner.
2. `docker-compose.prod.yml` — frontend `build.args` + `environment`.
3. `.github/workflows/deploy-hostinger.yml` — writes it into `.env.production`
   (GitHub secret `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`, with this key as fallback).
4. `frontend/.env.local` — dev value.

Verified: a production `npm run build` inlines the key into
`.next/static/chunks/app/[locale]/checkout/page-*.js`.

## ⚠️ CLIENT ACTION REQUIRED in Google Cloud Console

Local/file-origin tests return `gm_authFailure`, which means the key **is**
restricted. Before/after deploy, confirm ALL of the following on the key's project:

1. **Billing enabled** on the GCP project (Maps refuses to load without it).
2. **APIs enabled** (APIs & Services → Library):
   - Maps JavaScript API
   - Places API
   - Geocoding API
3. **Application restriction → HTTP referrers**, add:
   - `https://enfhantorganic.itwing.cloud/*`
   - `https://*.itwing.cloud/*`
   - `http://localhost:3000/*`  ← optional, for local dev testing
4. **API restriction** → restrict to the three APIs above (least privilege).

If the production domain is not in the referrer list, the map shows a blank/grey
box with a console `gm_authFailure` even though the key is correct. After adding
the domain, changes can take a few minutes to propagate.

## How to verify after deploy

Open `https://enfhantorganic.itwing.cloud/en/checkout` with an item in the cart,
start typing an address — Places suggestions should appear and the map pin should
move. If blank, open DevTools console and look for `gm_authFailure` /
`ApiNotActivatedMapError` / `BillingNotEnabled` and fix the matching item above.
