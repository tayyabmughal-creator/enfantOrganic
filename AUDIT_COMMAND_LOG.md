# Enfant Organic — Production Audit Command Log

Audit date: 2026-07-23

Operator workspace: `/Users/user/Desktop/enfhantOrganic`

Production SSH alias: `enfant-vps`

Production deploy directory: `/home/deploy`

## Safety statement

All shell/database actions were intended to be read-only. No deployment, restart, migration, configuration edit, payment attempt, cart mutation, order creation, or database write command was run. SQL selected schemas, counts, grouped states, and boolean configuration presence only; it did not select customer names, emails, phones, addresses, order numbers, raw payment payloads, credential values, or raw IPs.

One safety deviation occurred: opening the live Oman homepage in the controlled browser automatically emitted one synthetic first-party `page_view` POST. This produced one AnalyticsEvent row. The page contained no customer/order/payment data, and the browser test was stopped before clicking add-to-cart. This is the only known production write.

Commands below are listed in execution order within each category. Multi-line SQL bodies are summarized in the query manifest because repeating shell quoting does not change their executed statements. Log-display pipelines redacted order identifiers and credential-like tokens before output.

## A. Remote host and container commands

### A01 — host identity and capacity

```sh
ssh -o BatchMode=yes -o ConnectTimeout=15 enfant-vps 'pwd; id; find /home/deploy -maxdepth 3 -name docker-compose.prod.yml -type f -print 2>/dev/null; uname -a; nproc; free -h; df -h /; uptime; docker version --format "{{.Server.Version}}"; docker compose version'
```

### A02 — services, resources, versions, migrations, nginx test

```sh
ssh -o BatchMode=yes enfant-vps 'cd /home/deploy && docker compose -f docker-compose.prod.yml --env-file .env.production ps && docker stats --no-stream --format "{{.Name}}|{{.CPUPerc}}|{{.MemUsage}}|{{.MemPerc}}|{{.NetIO}}|{{.BlockIO}}|{{.PIDs}}" && docker compose -f docker-compose.prod.yml --env-file .env.production config --services && docker compose -f docker-compose.prod.yml --env-file .env.production exec -T backend python --version && docker compose -f docker-compose.prod.yml --env-file .env.production exec -T backend python -c "import django; print(django.get_version())" && docker compose -f docker-compose.prod.yml --env-file .env.production exec -T frontend node -e "console.log(require(\"next/package.json\").version); console.log(require(\"react/package.json\").version)" && docker compose -f docker-compose.prod.yml --env-file .env.production exec -T backend python manage.py showmigrations store --plan | tail -n 40 && nginx -t'
```

### A03 — environment variable names only and Django settings

```sh
ssh -o BatchMode=yes enfant-vps 'cd /home/deploy && grep -E "^[A-Za-z_][A-Za-z0-9_]*=" .env.production | cut -d= -f1 | sort && docker compose -f docker-compose.prod.yml --env-file .env.production exec -T backend python -c "from django.conf import settings; print(settings.CACHES[\"default\"][\"BACKEND\"]); print(settings.DATABASES[\"default\"].get(\"CONN_MAX_AGE\")); print(settings.TIME_ZONE)"'
```

The direct Python settings form did not initialize Django and was followed by A04.

### A04 — initialized Django cache/database/time-zone settings; 24-hour log aggregates

```sh
ssh -o BatchMode=yes enfant-vps 'cd /home/deploy && docker compose -f docker-compose.prod.yml --env-file .env.production exec -T backend python manage.py shell -c "from django.conf import settings; print(settings.CACHES[\"default\"][\"BACKEND\"]); print(settings.DATABASES[\"default\"].get(\"CONN_MAX_AGE\")); print(settings.TIME_ZONE)"; for svc in backend frontend nginx celery_worker celery_beat; do logs=$(docker compose -f docker-compose.prod.yml --env-file .env.production logs --since=24h --no-color "$svc" 2>/dev/null); echo "$svc lines=$(printf "%s\n" "$logs" | wc -l | tr -d " ") errors=$(printf "%s\n" "$logs" | grep -icE "error|exception|traceback|failed|critical" || true) payment_related=$(printf "%s\n" "$logs" | grep -iE "paymob|payment|webhook" | wc -l | tr -d " ") payment_errors=$(printf "%s\n" "$logs" | grep -iE "paymob|payment|webhook" | grep -icE "error|exception|traceback|failed|404|invalid" || true)"; done; nginx_id=$(docker compose -f docker-compose.prod.yml --env-file .env.production ps -q nginx); docker logs --since=24h "$nginx_id" 2>&1 | awk "{counts[\$9]++} END {for (s in counts) if (s ~ /^[1-5][0-9][0-9]$/) print s, counts[s]}" | sort'
```

### A05 — seven-day exact-pattern and 5xx route aggregates

```sh
ssh -o BatchMode=yes enfant-vps 'cd /home/deploy && backend_logs=$(docker compose -f docker-compose.prod.yml --env-file .env.production logs --since=168h --no-color backend 2>/dev/null); for pattern in "Integration ID does not exist" "Paymob" "payment initiation" "invalid hmac" "already_processed" "CSRF" "CORS" "Internal Server Error" "Traceback"; do count=$(printf "%s\n" "$backend_logs" | grep -icF "$pattern" || true); echo "$pattern|$count"; done; frontend_logs=$(docker compose -f docker-compose.prod.yml --env-file .env.production logs --since=168h --no-color frontend 2>/dev/null); for pattern in "fetch failed" "ECONNREFUSED" "ETIMEDOUT" "Error"; do count=$(printf "%s\n" "$frontend_logs" | grep -icF "$pattern" || true); echo "frontend:$pattern|$count"; done; nginx_id=$(docker compose -f docker-compose.prod.yml --env-file .env.production ps -q nginx); docker logs --since=168h "$nginx_id" 2>&1 | awk "\$9 ~ /^(500|502|503|504)$/ {split(\$7,p,\"?\"); print \$9,p[1]}" | sed -E "s/[0-9]{4,}/[N]/g" | sort | uniq -c | sort -nr | head -n 30'
```

### A06 — redacted payment-initiation log lines

```sh
ssh -o BatchMode=yes enfant-vps 'cd /home/deploy && docker compose -f docker-compose.prod.yml --env-file .env.production logs --since=168h --no-color backend 2>/dev/null | grep -iF "payment initiation" | tail -n 20 | sed -E "s/[[:alnum:]._%+-]+@[[:alnum:].-]+/[EMAIL]/g; s/[0-9]{4,}/[N]/g; s/(secret|token|key)=([^ ,]+)/\1=[REDACTED]/Ig"'
```

### A07 — redacted payment traceback context

```sh
ssh -o BatchMode=yes enfant-vps 'cd /home/deploy && docker compose -f docker-compose.prod.yml --env-file .env.production logs --since=168h --no-color backend 2>/dev/null | grep -iF -A 14 -B 2 "Unexpected error during payment initiation" | tail -n 80 | sed -E "s/[[:alnum:]._%+-]+@[[:alnum:].-]+/[EMAIL]/g; s/EO-[0-9-]+/EO-[REDACTED]/g; s/[0-9]{4,}/[N]/g; s/(secret|token|key)([=: ]+)([^ ,}]+)/\1\2[REDACTED]/Ig"'
```

### A08 — warm internal origin probes

```sh
ssh -o BatchMode=yes enfant-vps 'for target in "app.enfantorganic.com|http://127.0.0.1:8082/api/navigation/?region=om" "app.enfantorganic.com|http://127.0.0.1:8082/api/home/?region=om" "om.enfantorganic.com|http://127.0.0.1:8082/en"; do host=${target%%|*}; url=${target#*|}; echo "$host $url"; for sample in 1 2 3 4 5; do curl --compressed -sS -H "Host: $host" -o /dev/null -w "sample=$sample code=%{http_code} ttfb=%{time_starttransfer} total=%{time_total} bytes=%{size_download}\n" "$url"; done; done'
```

### A09 — deployment provenance, logging, ports, backup discovery (first form)

```sh
ssh -o BatchMode=yes enfant-vps 'cd /home/deploy && git status --short --branch && git rev-parse HEAD && git log -1 --format="%cI %s" && docker info --format "logging_driver={{.LoggingDriver}}" && if test -f /etc/docker/daemon.json; then sed -n "1,200p" /etc/docker/daemon.json; else echo "daemon_json=absent"; fi && echo "published_ports" && docker ps --format "{{.Names}}|{{.Ports}}" && echo "backup_timers" && systemctl list-timers --all --no-pager | grep -iE "backup|snapshot|pg_dump" || true && echo "backup_files" && find /home/deploy -maxdepth 2 -type f \( -iname "*.sql" -o -iname "*.sql.gz" -o -iname "*.dump" \) -printf "%TY-%Tm-%Td %TH:%TM %s %p\n" 2>/dev/null | sort -r | head -n 20 && echo "host_nginx_errors_24h" && awk -v d="$(date -u -d "24 hours ago" "+%Y/%m/%d")" "\$0 ~ d {count++} END {print count+0}" /var/log/nginx/error.log 2>/dev/null'
```

The uninitialized host Git repository made `git rev-parse HEAD` fail, so later `&&` checks in A09 did not run. They were rerun in A10.

### A10 — logging, storage, ports, timers, backup discovery

```sh
ssh -o BatchMode=yes enfant-vps '
docker info --format "logging_driver={{.LoggingDriver}}"
if test -f /etc/docker/daemon.json; then sed -n "1,200p" /etc/docker/daemon.json; else echo "daemon_json=absent"; fi
docker ps --format "{{.Names}}|{{.Ports}}"
docker system df
du -x -h -d 1 /var/lib/docker /home/deploy 2>/dev/null | sort -h
systemctl list-timers --all --no-pager | grep -iE "backup|snapshot|pg_dump" || true
find /home/deploy -maxdepth 2 -type f \( -iname "*.sql" -o -iname "*.sql.gz" -o -iname "*.dump" \) -printf "%TY-%Tm-%Td %TH:%TM %s %p\n" 2>/dev/null | sort -r | head -n 20
'
```

### A11 — regional flags (failed quoting; no query executed)

```sh
ssh enfant-vps 'cd /home/deploy && docker compose --env-file .env.production -f docker-compose.prod.yml exec -T backend python manage.py shell -c "from store.models import Region; import json; rows=list(Region.objects.order_by(\x27code\x27).values(\x27code\x27,\x27is_active\x27,\x27payment_enabled_providers\x27,\x27default_payment_provider\x27,\x27payment_supported_methods\x27,\x27payment_mode\x27)); print(json.dumps(rows, sort_keys=True))"'
```

Result: Python `SyntaxError`; the Django settings warning was emitted, but no database query ran.

### A12 — regional provider/method flags (successful)

```sh
ssh enfant-vps "cd /home/deploy && docker compose --env-file .env.production -f docker-compose.prod.yml exec -T backend python manage.py shell -c 'from store.models import Region; import json; rows=list(Region.objects.order_by(\"code\").values(\"code\",\"is_active\",\"payment_enabled_providers\",\"default_payment_provider\",\"payment_supported_methods\",\"payment_mode\")); print(json.dumps(rows, sort_keys=True))'"
```

### A13 — resolved Paymob shape, booleans/host/currency only

```sh
ssh enfant-vps "cd /home/deploy && docker compose --env-file .env.production -f docker-compose.prod.yml exec -T backend python manage.py shell -c 'from store.services.payment_config import get_paymob_config; from store.services.paymob import _unified_checkout_enabled; from urllib.parse import urlparse; import json; out={}; exec(\"for r in [\\\"ae\\\",\\\"om\\\",\\\"sa\\\"]:\\n c=get_paymob_config(r)\\n out[r]={\\\"enabled\\\":bool(c.get(\\\"enabled\\\")),\\\"complete_legacy_fields\\\":all(bool(c.get(k)) for k in [\\\"api_key\\\",\\\"integration_id\\\",\\\"iframe_id\\\",\\\"hmac_secret\\\"]),\\\"has_secret_key\\\":bool(c.get(\\\"secret_key\\\")),\\\"has_public_key\\\":bool(c.get(\\\"public_key\\\")),\\\"has_apple_pay_integration\\\":bool(c.get(\\\"apple_pay_integration_id\\\")),\\\"unified_enabled\\\":_unified_checkout_enabled(c),\\\"base_host\\\":urlparse(c.get(\\\"base_url\\\",\\\"\\\")).hostname,\\\"currency\\\":c.get(\\\"currency\\\")}\"); print(json.dumps(out, sort_keys=True))'"
```

### A14 — timestamped current payment errors, identifiers redacted

```sh
ssh enfant-vps "cd /home/deploy && docker compose --env-file .env.production -f docker-compose.prod.yml logs --timestamps --since 2026-07-22T00:00:00Z backend 2>&1 | grep -E 'Paymob intention request failed|Unexpected error during payment initiation' | sed -E 's/(order=|order )[A-Za-z0-9-]+/\1[REDACTED]/g'"
```

## B. Aggregate PostgreSQL query executions

Every query used the same read-only invocation pattern:

```sh
ssh -o BatchMode=yes enfant-vps "cd /home/deploy && docker compose -f docker-compose.prod.yml --env-file .env.production exec -T db sh -c 'psql -v ON_ERROR_STOP=1 -U \"\$POSTGRES_USER\" -d \"\$POSTGRES_DB\" -P pager=off'" <<'SQL'
-- SELECT / SHOW statements listed below
SQL
```

No `INSERT`, `UPDATE`, `DELETE`, DDL, transaction-state change, lock command, or function with side effects was used.

| ID | Executed statements |
|---|---|
| B01 | `information_schema.columns` for nine audit tables; `SHOW timezone`; `SHOW log_min_duration_statement`; top 20 `pg_stat_user_tables` row/size aggregates. |
| B02 | Daily orders since 2026-06-16; grouped payment-method/payment-status/order-status counts; grouped region counts; paid-only revenue/AOV by currency; order/payment-transaction status aggregates. |
| B03 | Event-type counts/distinct session keys/date range; daily session/product/cart/checkout/purchase aggregates; daily abandoned-cart counts/contact presence; abandoned-cart status counts/date range. |
| B04 | Equal-period event/order funnel rollup; event counts by region/type; metadata-key frequency using `jsonb_object_keys` (keys only, never values). |
| B05 | Schema columns for PaymobRegionConfig/SiteSettings; equal-period regional funnel; recent source-level session/cart/checkout aggregates. |
| B06 | PaymobRegionConfig presence booleans and non-secret currency/base URL; SiteSettings analytics-ID presence booleans; published/price/inventory product counts by region; Paymob attempt aggregates by region and attempts-per-order. |
| B07 | Equal-period traffic-source session/cart/checkout rates. |
| B08 | Equal-period order attribution-source counts/paid counts; sales-channel counts; weekly order/paid/online counts. |

Query windows were explicitly bounded at `2026-06-16`, `2026-06-17T00:00:00Z`, `2026-07-05T00:00:00Z`, and `2026-07-23T00:00:00Z`. Revenue was grouped by currency and never summed across currencies.

## C. Public HTTP probes

### C01 — five samples with redirects for storefronts and core APIs

```sh
for url in 'https://www.enfantorganic.com/en' 'https://om.enfantorganic.com/en' 'https://ae.enfantorganic.com/en' 'https://sa.enfantorganic.com/en' 'https://app.enfantorganic.com/api/navigation/?region=om' 'https://app.enfantorganic.com/api/home/?region=om'; do for sample in 1 2 3 4 5; do curl --compressed -sS -L -o /dev/null -w 'timing fields' "$url"; done; done
```

### C02 — three bounded direct regional samples

```sh
for url in 'https://om.enfantorganic.com/en' 'https://ae.enfantorganic.com/en' 'https://sa.enfantorganic.com/en'; do for sample in 1 2 3; do curl --compressed --connect-timeout 15 --max-time 30 -sS -o /dev/null -w 'timing fields' "$url"; done; done
```

### C03 — five bounded API samples

```sh
for url in 'https://app.enfantorganic.com/api/navigation/?region=om' 'https://app.enfantorganic.com/api/home/?region=om' 'https://app.enfantorganic.com/api/products/?region=om'; do for sample in 1 2 3 4 5; do curl --compressed --connect-timeout 15 --max-time 30 -sS -o /dev/null -w 'timing fields' "$url"; done; done
```

### C04/C05 — homepage body and headers, API headers, hashed-JS headers

```sh
curl --compressed -sS 'https://om.enfantorganic.com/en' -o /tmp/enfant_audit_home.html
wc -c /tmp/enfant_audit_home.html
rg -o 'https://app\.enfantorganic\.com/[^" ]+\.(webp|jpg|jpeg|png)' /tmp/enfant_audit_home.html | head -n 10
curl --compressed -sS -D - -o /dev/null 'https://om.enfantorganic.com/en' | tr -d '\r' | grep -iE 'selected response headers'
curl --compressed -sS -D - -o /dev/null 'https://app.enfantorganic.com/api/navigation/?region=om' | tr -d '\r' | grep -iE 'selected response headers'
chunk=$(rg -o '/_next/static/[^" ]+\.js' /tmp/enfant_audit_home.html | head -n 1)
curl --compressed -sS -D - -o /dev/null "https://om.enfantorganic.com$chunk" | tr -d '\r' | grep -iE 'selected response headers'
```

An initial equivalent `mktemp` compound command was attempted before C05; it failed during parsing and was rerun as the explicit lines above.

### C06 — desktop hero discovery, five timings, headers

```sh
rg -o 'rel="preload"[^>]+Banner-WEB|Banner-WEB[^>]+rel="preload"' /tmp/enfant_audit_home.html
rg -o 'srcset="[^"]*Banner-WEB[^"]*"' /tmp/enfant_audit_home.html
for sample in 1 2 3 4 5; do curl --compressed -sS -o /dev/null -w 'timing fields' 'https://app.enfantorganic.com/media/hero-cards/Banner-WEB.jpg.webp'; done
curl --compressed -sS -D - -o /dev/null 'https://app.enfantorganic.com/media/hero-cards/Banner-WEB.jpg.webp' | tr -d '\r' | grep -iE 'selected response headers'
```

The `Banner-WEB`-specific srcset check did not test the separate mobile `<source>` and was not used as evidence that no mobile source existed.

### C07 — `www` redirect and region-cookie timings

```sh
for sample in 1 2 3 4 5; do curl --compressed -sS -o /dev/null -w 'timing and redirect fields' 'https://www.enfantorganic.com/en'; done
for sample in 1 2 3 4 5; do curl --compressed -sS -H 'Cookie: enfant-region=om' -o /dev/null -w 'timing fields' 'https://www.enfantorganic.com/en'; done
```

### C08 — exact mobile LCP asset, five bounded samples

```sh
for sample in 1 2 3 4 5; do curl --compressed --connect-timeout 15 --max-time 30 -sS -o /dev/null -w "sample=$sample code=%{http_code} dns=%{time_namelookup} connect=%{time_connect} tls=%{time_appconnect} ttfb=%{time_starttransfer} total=%{time_total} bytes=%{size_download} http=%{http_version} ip=%{remote_ip}\n" 'https://app.enfantorganic.com/media/hero-cards/Banner-Mobile.jpg.webp'; done
```

## D. Lighthouse production loads

### D01 — tool check

```sh
npx --yes lighthouse --version
```

Reported 13.4.1.

### D02 — initial three mobile + three desktop sequence

```sh
for sample in 1 2 3; do npx --yes lighthouse 'https://om.enfantorganic.com/en' --only-categories=performance --form-factor=mobile --screenEmulation.mobile --output=json --output-path="/tmp/enfant_lh_mobile_${sample}.json" --quiet --chrome-path='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' --chrome-flags='--headless --no-sandbox'; done
for sample in 1 2 3; do npx --yes lighthouse 'https://om.enfantorganic.com/en' --only-categories=performance --preset=desktop --output=json --output-path="/tmp/enfant_lh_desktop_${sample}.json" --quiet --chrome-path='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' --chrome-flags='--headless --no-sandbox'; done
```

One mobile rerun was also executed explicitly after a partial artifact:

```sh
npx --yes lighthouse 'https://om.enfantorganic.com/en' --only-categories=performance --form-factor=mobile --screenEmulation.mobile --output=json --output-path='/tmp/enfant_lh_mobile_2.json' --quiet --chrome-path='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' --chrome-flags='--headless --no-sandbox'
```

The initial mobile batch overlapped with that rerun and was excluded from reported mobile medians. Process/file inspection commands (`ps`, `find`, `ls`) were local-only and did not touch production.

### D03 — clean sequential mobile sequence

```sh
for sample in 1 2 3; do npx --yes lighthouse 'https://om.enfantorganic.com/en' --only-categories=performance --form-factor=mobile --screenEmulation.mobile --output=json --output-path="/private/tmp/enfant_lh_mobile_clean_${sample}.json" --quiet --chrome-path='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' --chrome-flags='--headless --no-sandbox'; done
```

Local Node scripts then parsed only the saved Lighthouse JSON to calculate medians and inspect LCP, network, image, render-blocking, main-thread, unused-JS, and third-party audits. They made no network or production calls.

## E. Browser inspection

The in-app browser was connected, viewport set to 390×844, and a new tab navigated to:

```text
https://om.enfantorganic.com/en
```

Executed browser operations:

1. wait for `domcontentloaded` and capture a DOM snapshot;
2. wait for `networkidle` (timed out) and then `load`, capture a DOM snapshot;
3. locate a known product article and its “Add to cart” button, read count/enabled/bounding-box state, and read warning/error logs;
4. locator evaluation raised an internal private-member error before returning a reliable result;
5. reset viewport and close/finalize all audit tabs.

No click, typing, form submission, cart operation, checkout, authentication, or payment action was performed. Navigation itself caused the one synthetic first-party `page_view` described in the safety statement.

## F. Deployment metadata reads

```sh
gh run list --workflow deploy-hostinger.yml --limit 8 --json databaseId,headSha,status,conclusion,createdAt,updatedAt,event,displayTitle,url
gh run view 29985900931 --json jobs,conclusion,headSha,url
gh run view 29984428386 --json jobs,conclusion,headSha,url
```

These were read-only GitHub API calls. No workflow was triggered, rerun, cancelled, or modified.

## G. Commands explicitly not executed

- `docker compose up/down/restart/build/pull`
- `docker restart`, `systemctl restart/reload`
- `python manage.py migrate`, data migrations, shell writes
- SQL DML/DDL or row-level customer/order queries
- secret-value printing or credential comparison
- provider API/payment tests
- nginx/DNS/environment edits
- GitHub workflow dispatch/rerun
- source-code deployment

Local report creation used `apply_patch` and affected only the six requested Markdown files.
