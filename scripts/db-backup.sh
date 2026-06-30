#!/usr/bin/env bash
# Periodic Postgres backup for the single-host stack.
#
# Dumps the compose `db` service with pg_dump (custom/compressed format) into
# BACKUP_DIR and rotates dumps older than RETENTION_DAYS. Intended for a host
# cron entry, e.g. every day at 03:30 keeping 14 days:
#   30 3 * * * cd /opt/eldercare-fall-ai && BACKUP_DIR=/var/backups/eldercare \
#     RETENTION_DAYS=14 scripts/db-backup.sh >> /var/log/eldercare-db-backup.log 2>&1
#
# Env overrides: DB_CONTAINER (eldercare-fall-db), POSTGRES_USER (fall),
# POSTGRES_DB (fall_dev), BACKUP_DIR (./backups), RETENTION_DAYS (14).
#
# Usage:
#   scripts/db-backup.sh
#   BACKUP_DIR=/var/backups/eldercare RETENTION_DAYS=14 scripts/db-backup.sh
#
# Restore (pg_restore; restore the privileged role `fall`/DIRECT_URL, not fall_app):
#   # Into the existing database (drop + recreate objects):
#   docker exec -i eldercare-fall-db \
#     pg_restore -U fall -d fall_dev --clean --if-exists \
#     < backups/fall_dev-YYYYMMDD-HHMMSS.dump
#
#   # Into a clean volume (disaster recovery). RLS roles fall/fall_app are created
#   # by backend/prisma/init on first volume init, so db MUST boot once before
#   # pg_restore re-populates data:
#   docker compose down -v                 # 1. drop volume so initdb + roles re-run
#   docker compose up -d db                # 2. backend/prisma/init seeds fall/fall_app
#   docker compose ps                      # 3. wait for healthy
#   docker exec -i eldercare-fall-db \
#     pg_restore -U fall -d fall_dev --no-owner --clean --if-exists \
#     < backups/fall_dev-YYYYMMDD-HHMMSS.dump   # 4. data only; roles already exist
#   docker exec eldercare-fall-db \
#     psql -U fall -d fall_dev -c 'select count(*) from "Facility";'   # verify
#
# Production deploys also take a pre-migration `pg_dump -Fc` backup under
# /opt/eldercare-fall-ai/shared/backups and validate it with `pg_restore --list`
# before prisma migrate deploy / baseline-existing / reset-demo. See ADR,
# scripts/release/manual-production-deploy.mjs, and scripts/deploy/ncloud-deploy.sh.
# Managed-Postgres migration is intentionally out of scope (ADR).
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
