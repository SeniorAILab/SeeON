# DB Backup & Restore (single-host stack)

The Postgres `db` service is co-located with backend + front on the single host
(`compose.yaml`). Data lives in the named volume `pgdata`. This runbook covers the
periodic dump/rotate job and the clean-volume restore procedure.

## Backup

`scripts/db-backup.sh` runs `pg_dump -Fc` (custom/compressed format) against the
running `db` container and rotates old dumps.

```bash
# one-off
scripts/db-backup.sh

# custom location + retention
BACKUP_DIR=/var/backups/eldercare RETENTION_DAYS=14 scripts/db-backup.sh
```

Environment overrides: `DB_CONTAINER` (default `eldercare-fall-db`),
`POSTGRES_USER` (`fall`), `POSTGRES_DB` (`fall_dev`), `BACKUP_DIR` (`./backups`),
`RETENTION_DAYS` (`14`).

### Cron (host)

Run every day at 03:30 and keep 14 days:

```cron
30 3 * * * cd /opt/eldercare-fall-ai && BACKUP_DIR=/var/backups/eldercare RETENTION_DAYS=14 scripts/db-backup.sh >> /var/log/eldercare-db-backup.log 2>&1
```

## Restore

`pg_dump -Fc` output is restored with `pg_restore`. Restore the privileged role
(`fall`, i.e. `DIRECT_URL`) — not the runtime `fall_app` role.

### Into the existing database (drop + recreate objects)

```bash
docker exec -i eldercare-fall-db \
  pg_restore -U fall -d fall_dev --clean --if-exists \
  < backups/fall_dev-YYYYMMDD-HHMMSS.dump
```

### Into a clean volume (disaster recovery)

```bash
# 1. Stop the stack and remove the volume so initdb + roles re-run.
docker compose down -v

# 2. Bring up only db so backend/prisma/init seeds the fall / fall_app roles.
docker compose up -d db

# 3. Wait for healthy.
docker compose ps

# 4. Restore the dump (data only re-populates; roles already created by initdb).
docker exec -i eldercare-fall-db \
  pg_restore -U fall -d fall_dev --no-owner --clean --if-exists \
  < backups/fall_dev-YYYYMMDD-HHMMSS.dump
```

### Verify

```bash
docker exec eldercare-fall-db \
  psql -U fall -d fall_dev -c "select count(*) from \"Facility\";"
```

## Notes

- RLS roles (`fall` superuser via `DIRECT_URL`, `fall_app` NOSUPERUSER/NOBYPASSRLS
  via `DATABASE_URL`) are created by `backend/prisma/init` on first volume init;
  restoring data does not recreate them, so a clean-volume restore must boot `db`
  once before `pg_restore`.
- Managed-Postgres migration is out of scope: this stack intentionally co-locates
  db on the single host (see ADR-host-edge-compose-topology).
