# Production Deployment — Enfhant Organic

Production domain: **https://enfhantorganic.itwing.cloud**
(Note the spelling: **enf**`h`**antorganic** — with the `h`. The typo
`enfantorganic` is a recurring source of outages.)

Server path: `/home/tayyab/enfhantOrganic`
Compose file: `docker-compose.prod.yml`

---

## Always deploy with the env-file flag

**Use this command (or the wrapper script below) — never the plain form:**

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build
```

❌ **Never run** `docker compose -f docker-compose.prod.yml up -d --build`
(without `--env-file .env.production`). Compose then misses interpolation
variables such as `REDIS_PASSWORD` and `NEXT_PUBLIC_API_BASE_URL`, which can
break Redis/backend startup.

### Preferred: the safe wrapper

```bash
cd /home/tayyab/enfhantOrganic
git pull origin main
bash scripts/deploy-production.sh
```

`scripts/deploy-production.sh`:
1. runs `scripts/validate-production-env.sh` and **aborts before touching the
   running stack** if `.env.production` is wrong;
2. deploys with the required `--env-file` flag;
3. verifies `DJANGO_ALLOWED_HOSTS` reached the backend container;
4. runs public API smoke tests (expects `200 application/json`).

You can run the validator on its own at any time:

```bash
bash scripts/validate-production-env.sh
```

---

## Required `.env.production` values

`.env.production` is **never committed** (real secrets). It must contain at
least:

```env
# Correct domain spelling — enfhantorganic (with the 'h')
DJANGO_ALLOWED_HOSTS=enfhantorganic.itwing.cloud,76.13.181.210,backend,localhost,127.0.0.1
DJANGO_CSRF_TRUSTED_ORIGINS=https://enfhantorganic.itwing.cloud
REDIS_PASSWORD=<set>
NEXT_PUBLIC_API_BASE_URL=https://enfhantorganic.itwing.cloud/api

# Paymob — Oman test integration (currently active region)
PAYMOB_API_KEY=<set>
PAYMOB_INTEGRATION_ID=65592
PAYMOB_IFRAME_ID=60088
PAYMOB_HMAC_SECRET=<set>
PAYMOB_BASE_URL=https://oman.paymob.com/api
PAYMOB_CURRENCY=OMR
```

### Region-aware Paymob (Saudi / UAE)

Paymob is offered per region. Oman uses the global `PAYMOB_*` values above.
Saudi/UAE require their **own** integration credentials and never reuse Oman's
(so SAR/AED orders are never routed through the OMR integration). Until these
are set, Paymob simply shows a "being set up for this region" notice there.

```env
# Saudi Arabia (once a SAR integration exists)
PAYMOB_INTEGRATION_ID_SA=
PAYMOB_IFRAME_ID_SA=
PAYMOB_HMAC_SECRET_SA=
# UAE (once an AED integration exists)
PAYMOB_INTEGRATION_ID_AE=
PAYMOB_IFRAME_ID_AE=
PAYMOB_HMAC_SECRET_AE=
```

See `backend/.env.example` for the full annotated list.

---

## GitHub Actions deploy (`.github/workflows/deploy-hostinger.yml`)

On push to `main` the workflow regenerates `.env.production` **from GitHub
Actions secrets**, then deploys. So a wrong value in a secret (e.g. a typo in
`DJANGO_ALLOWED_HOSTS`) will overwrite a manual server-side fix on the next
deploy. The workflow now:

- always uses `--env-file .env.production`;
- runs `scripts/validate-production-env.sh` **before** deploying (fails early on
  a wrong/typo domain or missing secret);
- verifies the backend container's `DJANGO_ALLOWED_HOSTS`;
- runs public API JSON smoke tests after deploy.

**Required GitHub Actions secrets** (Settings → Secrets and variables →
Actions). Set these so the generated `.env.production` is complete and passes
validation:

| Secret | Example / note |
|---|---|
| `DJANGO_ALLOWED_HOSTS` | `enfhantorganic.itwing.cloud,76.13.181.210,backend,localhost,127.0.0.1` |
| `DJANGO_CSRF_TRUSTED_ORIGINS` | `https://enfhantorganic.itwing.cloud` |
| `REDIS_PASSWORD` | (secret) |
| `NEXT_PUBLIC_API_BASE_URL` | `https://enfhantorganic.itwing.cloud/api` |
| `PAYMOB_API_KEY` | (secret) |
| `PAYMOB_INTEGRATION_ID` | `65592` |
| `PAYMOB_IFRAME_ID` | `60088` |
| `PAYMOB_HMAC_SECRET` | (secret) |
| `PAYMOB_BASE_URL` | optional; defaults to `https://oman.paymob.com/api` |
| `PAYMOB_CURRENCY` | optional; defaults to `OMR` |
| `THAWANI_SECRET_KEY` / `THAWANI_PUBLISHABLE_KEY` | (secret) |
| `PAYMOB_*_SA` / `PAYMOB_*_AE` | leave unset until SAR/AED integrations exist |
| `PRODUCTION_HEALTHCHECK_URL` | optional; defaults to `https://enfhantorganic.itwing.cloud/` |

> If a required secret is missing, the generated `.env.production` will be
> incomplete and the validation step **fails the deploy on purpose** — fix the
> secret rather than bypassing the check.

---

## Post-deploy verification (manual)

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml ps
docker compose --env-file .env.production -f docker-compose.prod.yml exec backend printenv DJANGO_ALLOWED_HOSTS   # must contain enfhantorganic.itwing.cloud

curl -sS -o /dev/null -w "%{http_code} %{content_type}\n" https://enfhantorganic.itwing.cloud/api/navigation/
curl -sS -o /dev/null -w "%{http_code} %{content_type}\n" https://enfhantorganic.itwing.cloud/api/products/
curl -sS -o /dev/null -w "%{http_code} %{content_type}\n" "https://enfhantorganic.itwing.cloud/api/products/?region=sa"
curl -sS -o /dev/null -w "%{http_code} %{content_type}\n" "https://enfhantorganic.itwing.cloud/api/products/?region=ae"
# Expected: 200 application/json

curl -i -X POST -H "Content-Type: application/json" -d '{}' https://enfhantorganic.itwing.cloud/api/payments/webhook/
# Expected: 400  {"error":"Invalid HMAC signature.","code":"invalid_signature"}
```
