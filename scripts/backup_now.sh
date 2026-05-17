#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

DRY_RUN=0
if [[ "${1:-}" == "--dry-run" ]]; then
  DRY_RUN=1
  shift
fi

if [[ "${1:-}" == "--help" ]]; then
  cat <<'USAGE'
Usage: scripts/backup_now.sh [--dry-run]

Creates a backup bundle containing:
  - PostgreSQL dump (custom format)
  - Media archive
  - Config references (no secrets)

Environment:
  BACKUP_DESTINATION    Local folder for backup output (default: ./backups)
  BACKUP_ENCRYPTION_KEY Optional passphrase used to encrypt archive with OpenSSL
  S3_BUCKET             Optional S3 bucket name for upload
  S3_ACCESS_KEY         Optional S3 access key (or AWS_ACCESS_KEY_ID)
  S3_SECRET_KEY         Optional S3 secret key (or AWS_SECRET_ACCESS_KEY)
  S3_ENDPOINT           Optional S3-compatible endpoint URL
  S3_REGION             Optional S3 region
  S3_PREFIX             Optional object prefix (default: enfantorganic/backups)
  COMPOSE_FILE          Optional compose file path
  ENV_FILE              Optional env file to load first
USAGE
  exit 0
fi

if [[ $# -gt 0 ]]; then
  echo "Unexpected argument(s): $*" >&2
  exit 1
fi

log() {
  printf '[backup] %s\n' "$*"
}

fail() {
  printf '[backup] ERROR: %s\n' "$*" >&2
  exit 1
}

load_env_file() {
  local candidate
  ENV_FILE_PATH=""
  for candidate in "${ENV_FILE:-}" ".env.production" ".env"; do
    [[ -z "${candidate}" ]] && continue
    if [[ -f "${ROOT_DIR}/${candidate}" ]]; then
      ENV_FILE_PATH="${ROOT_DIR}/${candidate}"
      break
    fi
  done

  if [[ -n "${ENV_FILE_PATH}" ]]; then
    log "Loading env file: ${ENV_FILE_PATH}"
    set -a
    # shellcheck disable=SC1090
    source "${ENV_FILE_PATH}"
    set +a
  else
    log "No env file found (.env.production/.env). Using current shell env."
  fi
}

resolve_compose() {
  COMPOSE_BIN=()
  if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
    COMPOSE_BIN=(docker compose)
    return
  fi
  if command -v docker-compose >/dev/null 2>&1; then
    COMPOSE_BIN=(docker-compose)
  fi
}

compose_service_running() {
  local service="$1"
  [[ ${#COMPOSE_BIN[@]} -eq 0 ]] && return 1
  "${COMPOSE_BIN[@]}" "${COMPOSE_ARGS[@]}" ps "${service}" >/dev/null 2>&1
}

backup_postgres() {
  local dump_path="$1"

  if [[ "${DRY_RUN}" == "1" && ${#COMPOSE_BIN[@]} -eq 0 ]] && ! command -v pg_dump >/dev/null 2>&1; then
    log "DRY RUN: would back up Postgres to ${dump_path} (requires docker compose db service or local pg_dump)."
    return
  fi

  if compose_service_running "db"; then
    log "Backing up Postgres using compose service 'db'."
    if [[ "${DRY_RUN}" == "1" ]]; then
      log "DRY RUN: compose exec pg_dump -> ${dump_path}"
    else
      "${COMPOSE_BIN[@]}" "${COMPOSE_ARGS[@]}" exec -T db sh -lc \
        'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom --no-owner --no-privileges' \
        > "${dump_path}"
    fi
    return
  fi

  if command -v pg_dump >/dev/null 2>&1; then
    [[ -n "${POSTGRES_DB:-}" ]] || fail "POSTGRES_DB is required for pg_dump fallback."
    [[ -n "${POSTGRES_USER:-}" ]] || fail "POSTGRES_USER is required for pg_dump fallback."
    [[ -n "${POSTGRES_HOST:-}" ]] || fail "POSTGRES_HOST is required for pg_dump fallback."

    log "Backing up Postgres using local pg_dump."
    if [[ "${DRY_RUN}" == "1" ]]; then
      log "DRY RUN: pg_dump -> ${dump_path}"
    else
      PGPASSWORD="${POSTGRES_PASSWORD:-}" \
        pg_dump \
          -h "${POSTGRES_HOST}" \
          -p "${POSTGRES_PORT:-5432}" \
          -U "${POSTGRES_USER}" \
          -d "${POSTGRES_DB}" \
          --format=custom \
          --no-owner \
          --no-privileges \
          > "${dump_path}"
    fi
    return
  fi

  if [[ "${DRY_RUN}" == "1" ]]; then
    log "DRY RUN: would run local pg_dump to ${dump_path}."
    return
  fi

  fail "Could not back up Postgres: neither compose db service nor pg_dump is available."
}

backup_media() {
  local media_archive="$1"
  local local_backend_media="${ROOT_DIR}/backend/media"
  local local_root_media="${ROOT_DIR}/media"

  if compose_service_running "backend"; then
    log "Backing up media from compose service 'backend'."
    if [[ "${DRY_RUN}" == "1" ]]; then
      log "DRY RUN: compose exec tar /app/media -> ${media_archive}"
    else
      "${COMPOSE_BIN[@]}" "${COMPOSE_ARGS[@]}" exec -T backend sh -lc \
        'if [ -d /app/media ]; then tar -C /app -czf - media; else tar -czf - --files-from /dev/null; fi' \
        > "${media_archive}"
    fi
    return
  fi

  if [[ -d "${local_backend_media}" ]]; then
    log "Backing up media from local backend/media folder."
    if [[ "${DRY_RUN}" == "1" ]]; then
      log "DRY RUN: tar ${local_backend_media} -> ${media_archive}"
    else
      tar -C "${ROOT_DIR}/backend" -czf "${media_archive}" media
    fi
    return
  fi

  if [[ -d "${local_root_media}" ]]; then
    log "Backing up media from local media folder."
    if [[ "${DRY_RUN}" == "1" ]]; then
      log "DRY RUN: tar ${local_root_media} -> ${media_archive}"
    else
      tar -C "${ROOT_DIR}" -czf "${media_archive}" media
    fi
    return
  fi

  log "No media directory found; creating an empty media archive."
  if [[ "${DRY_RUN}" == "1" ]]; then
    log "DRY RUN: create empty media archive ${media_archive}"
  else
    tar -czf "${media_archive}" --files-from /dev/null
  fi
}

upload_to_s3() {
  local archive_path="$1"
  local object_key
  local -a aws_cmd

  [[ -n "${S3_BUCKET:-}" ]] || return 0
  command -v aws >/dev/null 2>&1 || fail "S3_BUCKET is set but AWS CLI is not installed."

  export AWS_ACCESS_KEY_ID="${S3_ACCESS_KEY:-${AWS_ACCESS_KEY_ID:-}}"
  export AWS_SECRET_ACCESS_KEY="${S3_SECRET_KEY:-${AWS_SECRET_ACCESS_KEY:-}}"
  export AWS_DEFAULT_REGION="${S3_REGION:-${AWS_DEFAULT_REGION:-us-east-1}}"

  object_key="${S3_PREFIX:-enfantorganic/backups}/$(basename "${archive_path}")"
  aws_cmd=(aws)
  if [[ -n "${S3_ENDPOINT:-}" ]]; then
    aws_cmd+=(--endpoint-url "${S3_ENDPOINT}")
  fi

  log "Uploading backup to s3://${S3_BUCKET}/${object_key}"
  if [[ "${DRY_RUN}" == "1" ]]; then
    log "DRY RUN: ${aws_cmd[*]} s3 cp ${archive_path} s3://${S3_BUCKET}/${object_key}"
  else
    "${aws_cmd[@]}" s3 cp "${archive_path}" "s3://${S3_BUCKET}/${object_key}"
  fi
}

load_env_file
resolve_compose

if [[ -z "${COMPOSE_FILE:-}" ]]; then
  if [[ -f "${ROOT_DIR}/docker-compose.prod.yml" ]]; then
    COMPOSE_FILE="${ROOT_DIR}/docker-compose.prod.yml"
  else
    COMPOSE_FILE="${ROOT_DIR}/docker-compose.yml"
  fi
fi
COMPOSE_ARGS=(-f "${COMPOSE_FILE}")
if [[ -n "${ENV_FILE_PATH}" ]]; then
  COMPOSE_ARGS+=(--env-file "${ENV_FILE_PATH}")
fi

BACKUP_DESTINATION="${BACKUP_DESTINATION:-${ROOT_DIR}/backups}"
TIMESTAMP="$(date -u +"%Y%m%dT%H%M%SZ")"
BACKUP_NAME="enfantorganic-${TIMESTAMP}"
TEMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/enfant-backup-${TIMESTAMP}-XXXX")"
WORK_DIR="${TEMP_DIR}/${BACKUP_NAME}"
ARCHIVE_PATH="${BACKUP_DESTINATION}/${BACKUP_NAME}.tar.gz"
FINAL_ARCHIVE_PATH="${ARCHIVE_PATH}"

cleanup() {
  rm -rf "${TEMP_DIR}"
}
trap cleanup EXIT

log "Starting backup: ${BACKUP_NAME}"
[[ "${DRY_RUN}" == "1" ]] && log "Dry-run mode enabled."

if [[ "${DRY_RUN}" != "1" ]]; then
  mkdir -p "${BACKUP_DESTINATION}" "${WORK_DIR}/db" "${WORK_DIR}/media" "${WORK_DIR}/config" "${WORK_DIR}/meta"
else
  log "DRY RUN: mkdir -p ${BACKUP_DESTINATION} ${WORK_DIR}/{db,media,config,meta}"
fi

if [[ "${DRY_RUN}" != "1" ]]; then
  if [[ -f "${ROOT_DIR}/docker-compose.prod.yml" ]]; then cp "${ROOT_DIR}/docker-compose.prod.yml" "${WORK_DIR}/config/"; fi
  if [[ -f "${ROOT_DIR}/docker-compose.yml" ]]; then cp "${ROOT_DIR}/docker-compose.yml" "${WORK_DIR}/config/"; fi
  if [[ -f "${ROOT_DIR}/deploy/nginx/default.conf" ]]; then cp "${ROOT_DIR}/deploy/nginx/default.conf" "${WORK_DIR}/config/"; fi
  if [[ -f "${ROOT_DIR}/.env.production.example" ]]; then cp "${ROOT_DIR}/.env.production.example" "${WORK_DIR}/config/"; fi
  if [[ -f "${ROOT_DIR}/backend/.env.example" ]]; then cp "${ROOT_DIR}/backend/.env.example" "${WORK_DIR}/config/backend.env.example"; fi

  if [[ -n "${ENV_FILE_PATH}" ]]; then
    grep -E '^[A-Z0-9_]+=' "${ENV_FILE_PATH}" | cut -d'=' -f1 > "${WORK_DIR}/config/env_keys.txt" || true
  else
    : > "${WORK_DIR}/config/env_keys.txt"
  fi
else
  log "DRY RUN: collect config references into ${WORK_DIR}/config/"
fi

backup_postgres "${WORK_DIR}/db/postgres.dump"
backup_media "${WORK_DIR}/media/media.tar.gz"

if [[ "${DRY_RUN}" != "1" ]]; then
  {
    echo "backup_name=${BACKUP_NAME}"
    echo "timestamp_utc=${TIMESTAMP}"
    echo "compose_file=${COMPOSE_FILE}"
    echo "env_file=${ENV_FILE_PATH:-none}"
    echo "encrypted=$([[ -n "${BACKUP_ENCRYPTION_KEY:-}" ]] && echo yes || echo no)"
  } > "${WORK_DIR}/meta/manifest.txt"
fi

log "Creating compressed archive: ${ARCHIVE_PATH}"
if [[ "${DRY_RUN}" == "1" ]]; then
  log "DRY RUN: tar -C ${TEMP_DIR} -czf ${ARCHIVE_PATH} ${BACKUP_NAME}"
else
  tar -C "${TEMP_DIR}" -czf "${ARCHIVE_PATH}" "${BACKUP_NAME}"
fi

if [[ -n "${BACKUP_ENCRYPTION_KEY:-}" ]]; then
  FINAL_ARCHIVE_PATH="${ARCHIVE_PATH}.enc"
  log "Encrypting archive with OpenSSL (aes-256-cbc + pbkdf2)."
  if [[ "${DRY_RUN}" == "1" ]]; then
    log "DRY RUN: openssl enc -aes-256-cbc -pbkdf2 -salt -in ${ARCHIVE_PATH} -out ${FINAL_ARCHIVE_PATH}"
  else
    openssl enc -aes-256-cbc -pbkdf2 -salt \
      -in "${ARCHIVE_PATH}" \
      -out "${FINAL_ARCHIVE_PATH}" \
      -pass env:BACKUP_ENCRYPTION_KEY
    rm -f "${ARCHIVE_PATH}"
  fi
fi

upload_to_s3 "${FINAL_ARCHIVE_PATH}"

if [[ "${DRY_RUN}" == "1" ]]; then
  log "Backup dry-run completed."
else
  log "Backup completed: ${FINAL_ARCHIVE_PATH}"
fi
