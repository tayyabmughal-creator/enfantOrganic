#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

FORCE=0
DRY_RUN=0

usage() {
  cat <<'USAGE'
Usage: scripts/restore_backup.sh <backup-file> [--yes] [--dry-run]

Restores:
  - PostgreSQL database dump
  - Media archive

Notes:
  - If <backup-file> ends with .enc, BACKUP_ENCRYPTION_KEY is required.
  - This operation overwrites current DB/media data.
USAGE
}

BACKUP_FILE=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --yes)
      FORCE=1
      shift
      ;;
    --dry-run)
      DRY_RUN=1
      shift
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    -*)
      echo "Unknown option: $1" >&2
      usage
      exit 1
      ;;
    *)
      if [[ -z "${BACKUP_FILE}" ]]; then
        BACKUP_FILE="$1"
      else
        echo "Unexpected argument: $1" >&2
        usage
        exit 1
      fi
      shift
      ;;
  esac
done

[[ -n "${BACKUP_FILE}" ]] || { usage; exit 1; }
[[ -f "${BACKUP_FILE}" ]] || { echo "Backup file not found: ${BACKUP_FILE}" >&2; exit 1; }

log() {
  printf '[restore] %s\n' "$*"
}

fail() {
  printf '[restore] ERROR: %s\n' "$*" >&2
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

restore_postgres() {
  local dump_path="$1"

  if [[ "${DRY_RUN}" == "1" ]]; then
    log "DRY RUN: would restore Postgres from ${dump_path}."
    return
  fi

  [[ -f "${dump_path}" ]] || fail "Database dump not found in backup: ${dump_path}"

  if compose_service_running "db"; then
    log "Restoring Postgres via compose service 'db'."
    if [[ "${DRY_RUN}" == "1" ]]; then
      log "DRY RUN: compose exec pg_restore < ${dump_path}"
    else
      cat "${dump_path}" | "${COMPOSE_BIN[@]}" "${COMPOSE_ARGS[@]}" exec -T db sh -lc \
        'cat >/tmp/restore.dump && pg_restore --clean --if-exists --no-owner --no-privileges -U "$POSTGRES_USER" -d "$POSTGRES_DB" /tmp/restore.dump && rm -f /tmp/restore.dump'
    fi
    return
  fi

  if command -v pg_restore >/dev/null 2>&1; then
    [[ -n "${POSTGRES_DB:-}" ]] || fail "POSTGRES_DB is required for pg_restore fallback."
    [[ -n "${POSTGRES_USER:-}" ]] || fail "POSTGRES_USER is required for pg_restore fallback."
    [[ -n "${POSTGRES_HOST:-}" ]] || fail "POSTGRES_HOST is required for pg_restore fallback."

    log "Restoring Postgres via local pg_restore."
    if [[ "${DRY_RUN}" == "1" ]]; then
      log "DRY RUN: pg_restore ${dump_path}"
    else
      PGPASSWORD="${POSTGRES_PASSWORD:-}" \
        pg_restore \
          --clean \
          --if-exists \
          --no-owner \
          --no-privileges \
          -h "${POSTGRES_HOST}" \
          -p "${POSTGRES_PORT:-5432}" \
          -U "${POSTGRES_USER}" \
          -d "${POSTGRES_DB}" \
          "${dump_path}"
    fi
    return
  fi

  if [[ "${DRY_RUN}" == "1" ]]; then
    log "DRY RUN: would restore Postgres with local pg_restore."
    return
  fi

  fail "Could not restore Postgres: neither compose db service nor pg_restore is available."
}

restore_media() {
  local media_archive="$1"
  local local_backend_root="${ROOT_DIR}/backend"
  local local_backend_media="${ROOT_DIR}/backend/media"

  if [[ "${DRY_RUN}" == "1" ]]; then
    log "DRY RUN: would restore media from ${media_archive}."
    return
  fi

  [[ -f "${media_archive}" ]] || fail "Media archive not found in backup: ${media_archive}"

  if compose_service_running "backend"; then
    log "Restoring media via compose service 'backend'."
    if [[ "${DRY_RUN}" == "1" ]]; then
      log "DRY RUN: compose exec restore /app/media < ${media_archive}"
    else
      cat "${media_archive}" | "${COMPOSE_BIN[@]}" "${COMPOSE_ARGS[@]}" exec -T backend sh -lc \
        'rm -rf /app/media && mkdir -p /app && tar -xzf - -C /app'
    fi
    return
  fi

  log "Restoring media to local backend/media folder."
  if [[ "${DRY_RUN}" == "1" ]]; then
    log "DRY RUN: replace ${local_backend_media} using ${media_archive}"
  else
    rm -rf "${local_backend_media}"
    mkdir -p "${local_backend_root}"
    tar -xzf "${media_archive}" -C "${local_backend_root}"
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

if [[ "${FORCE}" != "1" ]]; then
  read -r -p "Restore will overwrite current database/media data. Continue? [y/N] " confirm
  case "${confirm}" in
    y|Y|yes|YES) ;;
    *) log "Restore cancelled."; exit 0 ;;
  esac
fi

TEMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/enfant-restore-XXXX")"
cleanup() {
  rm -rf "${TEMP_DIR}"
}
trap cleanup EXIT

ARCHIVE_FOR_EXTRACT="${BACKUP_FILE}"
if [[ "${BACKUP_FILE}" == *.enc ]]; then
  [[ -n "${BACKUP_ENCRYPTION_KEY:-}" ]] || fail "BACKUP_ENCRYPTION_KEY is required to decrypt ${BACKUP_FILE}"
  ARCHIVE_FOR_EXTRACT="${TEMP_DIR}/decrypted-backup.tar.gz"
  log "Decrypting backup archive."
  if [[ "${DRY_RUN}" == "1" ]]; then
    log "DRY RUN: openssl decrypt ${BACKUP_FILE} -> ${ARCHIVE_FOR_EXTRACT}"
  else
    openssl enc -d -aes-256-cbc -pbkdf2 \
      -in "${BACKUP_FILE}" \
      -out "${ARCHIVE_FOR_EXTRACT}" \
      -pass env:BACKUP_ENCRYPTION_KEY
  fi
fi

EXTRACT_DIR="${TEMP_DIR}/extracted"
if [[ "${DRY_RUN}" == "1" ]]; then
  log "DRY RUN: extract ${ARCHIVE_FOR_EXTRACT} into ${EXTRACT_DIR}"
  BACKUP_ROOT="${EXTRACT_DIR}/<backup-root>"
else
  mkdir -p "${EXTRACT_DIR}"
  tar -xzf "${ARCHIVE_FOR_EXTRACT}" -C "${EXTRACT_DIR}"
  BACKUP_ROOT="$(find "${EXTRACT_DIR}" -mindepth 1 -maxdepth 1 -type d | head -n 1)"
  [[ -n "${BACKUP_ROOT}" ]] || fail "Could not find backup root directory after extraction."
fi

log "Restoring from backup: ${BACKUP_ROOT}"
restore_postgres "${BACKUP_ROOT}/db/postgres.dump"
restore_media "${BACKUP_ROOT}/media/media.tar.gz"

if [[ "${DRY_RUN}" == "1" ]]; then
  log "Restore dry-run completed."
else
  log "Restore completed successfully."
fi
