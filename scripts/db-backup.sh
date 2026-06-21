#!/usr/bin/env bash
# Periodic Postgres backup for the single-host stack.
#
# Dumps the compose `db` service with pg_dump (custom format) into BACKUP_DIR and
# rotates dumps older than RETENTION_DAYS. Intended for a host cron entry — see
# docs/runbooks/db-backup-restore.md.
#
# Usage:
#   scripts/db-backup.sh
#   BACKUP_DIR=/var/backups/eldercare RETENTION_DAYS=14 scripts/db-backup.sh
set -euo pipefail

DB_CONTAINER="${DB_CONTAINER:-eldercare-fall-db}"
POSTGRES_USER="${POSTGRES_USER:-fall}"
POSTGRES_DB="${POSTGRES_DB:-fall_dev}"
BACKUP_DIR="${BACKUP_DIR:-./backups}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"

timestamp="$(date +%Y%m%d-%H%M%S)"
outfile="${BACKUP_DIR}/${POSTGRES_DB}-${timestamp}.dump"

mkdir -p "${BACKUP_DIR}"

echo "[db-backup] dumping ${POSTGRES_DB} from container ${DB_CONTAINER} -> ${outfile}"
# -Fc = custom format (compressed, restorable with pg_restore).
docker exec "${DB_CONTAINER}" \
  pg_dump -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" -Fc \
  > "${outfile}"

echo "[db-backup] rotating dumps older than ${RETENTION_DAYS} days in ${BACKUP_DIR}"
find "${BACKUP_DIR}" -name "${POSTGRES_DB}-*.dump" -type f -mtime "+${RETENTION_DAYS}" -delete

echo "[db-backup] done: ${outfile}"
