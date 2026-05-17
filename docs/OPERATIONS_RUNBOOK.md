# Operations Runbook

This runbook is for day-2 operations of ENFANT ORGANIC in production.

## 1) Deployment

### Standard Deploy (Docker Compose on VPS)

From project root on VPS:

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production pull
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build --remove-orphans
docker compose -f docker-compose.prod.yml --env-file .env.production ps
docker compose -f docker-compose.prod.yml --env-file .env.production exec -T backend python manage.py check
docker compose -f docker-compose.prod.yml --env-file .env.production exec -T nginx nginx -t
```

Health checks:

```bash
curl -I https://<your-domain>/
curl -I https://<your-domain>/api/navigation/?locale=en&region=om
```

### GitHub Actions Deploy

- Workflow: `.github/workflows/deploy-hostinger.yml`
- Trigger: push to `main` or manual dispatch
- It uploads project files, writes `.env.production`, runs compose update/restart, and checks public health URL.

## 2) Rollback

Use rollback if production behavior regresses after deployment.

1. SSH to VPS and go to deploy folder.
2. Check git history:
   ```bash
   git log --oneline -n 20
   ```
3. Checkout last known-good commit:
   ```bash
   git checkout <good-commit-sha>
   ```
4. Rebuild and restart stack:
   ```bash
   docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build --remove-orphans
   ```
5. Re-run health checks and smoke checkout.

Note: if rollback includes schema changes, restore DB from backup or run matching reverse migration plan first.

## 3) Backup

Manual backup command (repo root):

```bash
./scripts/backup_now.sh
```

Dry-run:

```bash
./scripts/backup_now.sh --dry-run
```

Details are in `docs/BACKUP_AND_RESTORE.md`.

## 4) Restore

Restore command:

```bash
./scripts/restore_backup.sh /path/to/enfantorganic-<timestamp>.tar.gz --yes
```

Encrypted restore:

```bash
export BACKUP_ENCRYPTION_KEY='<passphrase>'
./scripts/restore_backup.sh /path/to/enfantorganic-<timestamp>.tar.gz.enc --yes
```

Dry-run:

```bash
./scripts/restore_backup.sh /path/to/backup.tar.gz --dry-run --yes
```

Always validate restore in staging before production cutover.

## 5) Refund Procedure

Endpoint:

- `POST /api/admin/orders/<order_number>/refund/`

Auth:

- Staff user with refund capability (`CAP_REFUNDS_EDIT`)

Modes:

- `gateway`: uses provider refund (when supported)
- `manual`: records manual refund reference

Example payload (gateway):

```json
{
  "mode": "gateway",
  "amount": "49.90",
  "admin_note": "Customer return approved"
}
```

Example payload (manual):

```json
{
  "mode": "manual",
  "amount": "49.90",
  "manual_reference": "BANK-TRX-20260514-01",
  "admin_note": "Refund via bank transfer"
}
```

Expected outcomes:

- `Order.refund_status` / `payment_status` updated
- refund transaction persisted
- inventory restore attempted where applicable
- admin audit log created

## 6) Cancel Order Procedure

### Customer self-cancel

- Endpoint: `POST /api/account/orders/<order_number>/cancel/`
- Allowed only when order is cancellable (`pending/confirmed + unpaid`).

### Admin cancel

- Endpoint: `PATCH /api/admin/orders/<order_number>/`
- Payload:
  ```json
  {
    "status": "cancelled",
    "status_note": "Cancelled by support"
  }
  ```

Expected outcomes:

- transition validation enforced
- inventory restore attempted
- status history entry + audit log created

## 7) Create Shipment / Manual Tracking

Endpoint:

- `POST /api/admin/orders/<order_number>/shipment/create/`

### Auto/provider attempt

```json
{
  "carrier": "aramex"
}
```

### Manual tracking entry

```json
{
  "carrier": "manual",
  "tracking_number": "TRK123456",
  "tracking_url": "https://carrier.example/track/TRK123456",
  "shipment_status": "manual"
}
```

Tracking refresh:

- `POST /api/admin/orders/<order_number>/shipment/refresh/`

Expected outcomes:

- order shipment fields update
- customer notification logs are created when tracking is newly added

## 8) API Key Rotation Procedure

Use this sequence for any provider secret rotation (payment/SMS/WhatsApp/carrier):

1. Add new value in secret manager / `.env.production`.
2. Keep old key active in provider dashboard during transition window.
3. Restart services:
   ```bash
   docker compose -f docker-compose.prod.yml --env-file .env.production up -d
   ```
4. Run a sandbox/live smoke transaction/event.
5. Confirm webhook signature verification still passes.
6. Revoke old key in provider dashboard after validation.
7. Record rotation date and owner in ops log.

## 9) Incident Triage Quick Commands

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production ps
docker compose -f docker-compose.prod.yml --env-file .env.production logs --tail=200 backend
docker compose -f docker-compose.prod.yml --env-file .env.production logs --tail=200 frontend
docker compose -f docker-compose.prod.yml --env-file .env.production logs --tail=200 nginx
docker compose -f docker-compose.prod.yml --env-file .env.production exec -T backend python manage.py check
```

## 10) Operational Guardrails

- Do not edit production DB rows manually unless change is documented and approved.
- Do not disable webhook signature verification for convenience.
- Do not expose credentials in screenshots, logs, or tickets.
- Run backup before high-risk changes (bulk imports, schema-heavy releases).
