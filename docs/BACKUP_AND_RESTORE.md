# Backup and Restore Plan

This project uses two operational scripts:

- `scripts/backup_now.sh`
- `scripts/restore_backup.sh`

They back up and restore:

1. PostgreSQL database
2. Media files
3. Configuration references (compose/nginx/env examples and env key names only)

No real secret values are written into backup config references.

## 1) Required/Supported Environment Variables

Add these in server runtime env (`.env.production` or shell env):

- `BACKUP_DESTINATION`  
  Local folder for backup archives. Default: `./backups`
- `BACKUP_ENCRYPTION_KEY`  
  Optional. If set, archives are encrypted (`.enc`) with OpenSSL AES-256-CBC + PBKDF2.
- `S3_BUCKET`  
  Optional S3/S3-compatible bucket name for upload.
- `S3_ACCESS_KEY`  
  Optional S3 access key.
- `S3_SECRET_KEY`  
  Optional S3 secret key.

Supported optional S3-compatible helpers:

- `S3_ENDPOINT` (for MinIO/Wasabi/other compatible providers)
- `S3_REGION`
- `S3_PREFIX` (default `enfantorganic/backups`)

## 2) Manual Backup

From repo root:

```bash
chmod +x scripts/backup_now.sh scripts/restore_backup.sh
./scripts/backup_now.sh
```

Dry-run validation:

```bash
./scripts/backup_now.sh --dry-run
```

Backup output format:

- Plain: `BACKUP_DESTINATION/enfantorganic-<UTC_TIMESTAMP>.tar.gz`
- Encrypted: `BACKUP_DESTINATION/enfantorganic-<UTC_TIMESTAMP>.tar.gz.enc`

## 3) Restore Process

### Step A: Choose backup file

Example:

```bash
./scripts/restore_backup.sh /path/to/enfantorganic-20260514T120000Z.tar.gz --yes
```

If encrypted:

```bash
export BACKUP_ENCRYPTION_KEY='...'
./scripts/restore_backup.sh /path/to/enfantorganic-20260514T120000Z.tar.gz.enc --yes
```

Dry-run:

```bash
./scripts/restore_backup.sh /path/to/backup.tar.gz --dry-run --yes
```

### Step B: Post-restore checks

1. API health and admin login.
2. Recent orders/products exist.
3. Media URLs return expected files.
4. Run smoke checkout in staging before production cutover.

## 4) Backup Schedule

Recommended:

- Daily full backup at low traffic hours (e.g., 03:00 server time)
- Keep at least:
  - 7 daily
  - 4 weekly
  - 3 monthly

## 5) Retention Policy Example

Retention policy (example):

1. Keep all backups for the last 7 days.
2. Keep one backup per week for 4 weeks.
3. Keep one backup per month for 3 months.
4. Delete older files automatically with a scheduled cleanup script or object-lifecycle policy in S3.

## 6) Backup Testing Process

Run this at least monthly:

1. Create a fresh backup with `backup_now.sh`.
2. Restore into staging (never directly first to production).
3. Validate DB row counts and key business flows.
4. Confirm media integrity on top product/category pages.
5. Log test date + result in ops runbook.

## 7) Cron Scheduling Example

On VPS (crontab):

```cron
0 3 * * * cd /home/deploy/enfhantOrganic && /bin/bash ./scripts/backup_now.sh >> /var/log/enfantorganic-backup.log 2>&1
```

## 8) Docker Scheduled Backup Example

If you prefer containerized scheduling, run a small scheduler container that executes `backup_now.sh`.

Example service snippet (illustrative):

```yaml
services:
  backup-cron:
    image: alpine:3.20
    working_dir: /app
    volumes:
      - ./:/app
      - ./backups:/app/backups
      - /var/run/docker.sock:/var/run/docker.sock
    env_file:
      - .env.production
    command: >
      sh -c "apk add --no-cache bash docker-cli aws-cli openssl postgresql-client &&
             echo '0 3 * * * cd /app && /bin/bash ./scripts/backup_now.sh >> /var/log/backup.log 2>&1' > /etc/crontabs/root &&
             crond -f -l 8"
    restart: unless-stopped
```

## 9) Security Notes

1. Never store real credentials in git-tracked files.
2. Set filesystem permissions on backup directory (`chmod 700` preferred).
3. Use encryption (`BACKUP_ENCRYPTION_KEY`) for off-host backups.
4. Restrict S3 bucket IAM policy to minimum required actions.
