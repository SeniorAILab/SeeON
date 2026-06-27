#!/usr/bin/env sh
set -eu

APP_ROOT="${APP_ROOT:-/opt/eldercare-fall-ai}"
APP_DIR="${APP_DIR:-$APP_ROOT/current}"
ENV_FILE="${ENV_FILE:-$APP_ROOT/shared/.env}"
PRUNE_DOCKER="${PRUNE_DOCKER:-1}"
DEPLOY_DB_MODE="${DEPLOY_DB_MODE:-migrate}"
BACKUP_DIR="${BACKUP_DIR:-$APP_ROOT/shared/backups}"
LOCK_DIR="${LOCK_DIR:-$APP_ROOT/shared/deploy.lock}"
IMAGE_NAMESPACE="${IMAGE_NAMESPACE:-ghcr.io/seniorailab/eldercare-fall-ai}"
IMAGE_TAG="${IMAGE_TAG:-}"
COMPOSE_FILES="-f compose.yaml -f compose.prod.yaml"
BACKEND_IMAGE="${BACKEND_IMAGE:-$IMAGE_NAMESPACE/backend:$IMAGE_TAG}"
FRONT_IMAGE="${FRONT_IMAGE:-$IMAGE_NAMESPACE/front:$IMAGE_TAG}"
export BACKEND_IMAGE FRONT_IMAGE

need() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

need docker
need curl

if [ -z "$IMAGE_TAG" ]; then
  echo "IMAGE_TAG is required; deploys must use an explicit image tag." >&2
  exit 1
fi

case "$DEPLOY_DB_MODE" in
  migrate | skip)
    ;;
  baseline-existing)
    if [ "${ALLOW_PRISMA_BASELINE:-}" != "1" ]; then
      echo "DEPLOY_DB_MODE=baseline-existing requires ALLOW_PRISMA_BASELINE=1." >&2
      exit 1
    fi
    ;;
  reset-demo)
    if [ "${ALLOW_DESTRUCTIVE_DB_RESET:-}" != "I_UNDERSTAND_THIS_WIPES_PUBLIC_SCHEMA" ]; then
      echo "DEPLOY_DB_MODE=reset-demo requires ALLOW_DESTRUCTIVE_DB_RESET=I_UNDERSTAND_THIS_WIPES_PUBLIC_SCHEMA." >&2
      exit 1
    fi
    ;;
  *)
    echo "Unknown DEPLOY_DB_MODE: $DEPLOY_DB_MODE" >&2
    exit 1
    ;;
esac

mkdir -p "$APP_ROOT" "$APP_ROOT/shared" "$BACKUP_DIR"

if [ ! -f "$APP_DIR/compose.yaml" ]; then
  echo "Deploy bundle is missing at $APP_DIR." >&2
  echo "Upload compose files before running this script." >&2
  exit 1
fi

if [ ! -f "$ENV_FILE" ]; then
  cat >&2 <<EOF
Missing $ENV_FILE.
Create it from .env.host.prod.example before deploying.
EOF
  exit 1
fi

umask 077
cp "$ENV_FILE" "$APP_DIR/.env"
{
  printf '\n'
  printf 'BACKEND_IMAGE=%s\n' "$BACKEND_IMAGE"
  printf 'FRONT_IMAGE=%s\n' "$FRONT_IMAGE"
} >> "$APP_DIR/.env"

cd "$APP_DIR"

release_lock() {
  if [ "${LOCK_HELD:-0}" = "1" ]; then
    rmdir "$LOCK_DIR" 2>/dev/null || true
  fi
}

acquire_lock() {
  if ! mkdir "$LOCK_DIR" 2>/dev/null; then
    echo "Another deploy is already running: $LOCK_DIR" >&2
    exit 1
  fi
  LOCK_HELD=1
  trap release_lock EXIT INT TERM
}

compose() {
  docker compose $COMPOSE_FILES "$@"
}

compose_full() {
  COMPOSE_PROFILES=full docker compose $COMPOSE_FILES "$@"
}

sync_app_role() {
  compose exec -T db sh /docker-entrypoint-initdb.d/02-sync-app-role.sh
}

backup_and_validate() {
  timestamp="$(date -u +%Y%m%d-%H%M%S)"
  backup_file="$BACKUP_DIR/${POSTGRES_DB:-fall_prod}-$timestamp.dump"
  echo "Writing database backup: $backup_file"
  compose exec -T db sh -c \
    'pg_dump --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" -Fc' > "$backup_file"
  compose exec -T db pg_restore --list < "$backup_file" >/dev/null
  echo "Backup validated with pg_restore --list: $backup_file"
}

run_prisma() {
  compose_full run --rm backend pnpm exec prisma "$@" --schema prisma/schema.prisma
}

run_migrate_deploy() {
  run_prisma migrate deploy
}

prisma_migration_rows() {
  compose exec -T db sh -c \
    'psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" -Atc "SELECT CASE WHEN to_regclass('\'public._prisma_migrations\'') IS NULL THEN -1 ELSE (SELECT count(*) FROM public._prisma_migrations) END;"'
}

domain_table_rows() {
  compose exec -T db sh -c \
    'psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" -Atc "SELECT count(*) FROM information_schema.tables WHERE table_schema = '\''public'\'' AND table_type = '\''BASE TABLE'\'' AND table_name <> '\''_prisma_migrations'\'';"'
}

baseline_existing() {
  if [ "${ALLOW_PRISMA_BASELINE:-}" != "1" ]; then
    echo "DEPLOY_DB_MODE=baseline-existing requires ALLOW_PRISMA_BASELINE=1." >&2
    exit 1
  fi

  rows="$(prisma_migration_rows)"
  if [ "$rows" -gt 0 ]; then
    echo "_prisma_migrations already has rows; use DEPLOY_DB_MODE=migrate." >&2
    exit 1
  fi

  table_count="$(domain_table_rows)"
  if [ "$table_count" -gt 0 ]; then
    for migration_dir in backend/prisma/migrations/*; do
      [ -d "$migration_dir" ] || continue
      migration_name="${migration_dir##*/}"
      run_prisma migrate resolve --applied "$migration_name"
    done
  fi

  run_migrate_deploy
}

reset_demo() {
  if [ "${ALLOW_DESTRUCTIVE_DB_RESET:-}" != "I_UNDERSTAND_THIS_WIPES_PUBLIC_SCHEMA" ]; then
    echo "DEPLOY_DB_MODE=reset-demo requires ALLOW_DESTRUCTIVE_DB_RESET=I_UNDERSTAND_THIS_WIPES_PUBLIC_SCHEMA." >&2
    exit 1
  fi

  compose_full stop front backend
  compose exec -T db sh -c \
    'psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" -c "DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;"'
  sync_app_role
  run_migrate_deploy
  compose_full run --rm backend node dist/prisma/seed.js
}

bootstrap_super_admin() {
  # No-op unless SUPER_ADMIN_PASSWORD is configured (script self-skips). Distinct
  # layer from the demo seed: idempotently ensures one email/password SUPER_ADMIN
  # exists so a migrated production database is operable (ADR-073).
  compose_full run --rm backend node dist/prisma/seed-super-admin.js
}

docker compose $COMPOSE_FILES config >/dev/null
compose_full pull db backend front
compose up -d --wait db

case "$DEPLOY_DB_MODE" in
  migrate)
    acquire_lock
    backup_and_validate
    sync_app_role
    run_migrate_deploy
    bootstrap_super_admin
    ;;
  baseline-existing)
    acquire_lock
    backup_and_validate
    sync_app_role
    baseline_existing
    bootstrap_super_admin
    ;;
  reset-demo)
    acquire_lock
    backup_and_validate
    reset_demo
    bootstrap_super_admin
    ;;
  skip)
    echo "Skipping DB backup and migration because DEPLOY_DB_MODE=skip."
    ;;
  *)
    echo "Unknown DEPLOY_DB_MODE: $DEPLOY_DB_MODE" >&2
    exit 1
    ;;
esac

compose_full up -d --wait backend front

curl -fsS http://127.0.0.1/ >/dev/null

if [ "$PRUNE_DOCKER" = "1" ]; then
  running_images="$(docker ps --format '{{.Image}}')"
  docker images --format '{{.Repository}}:{{.Tag}}' |
    while IFS= read -r image; do
      case "$image" in
        "$IMAGE_NAMESPACE/"*)
          if printf '%s\n' "$running_images" | grep -Fx "$image" >/dev/null; then
            continue
          fi
          docker image rm "$image" >/dev/null
          ;;
      esac
    done
  docker image prune -f >/dev/null
  docker builder prune -f --filter until=24h >/dev/null
fi

COMPOSE_PROFILES=full docker compose $COMPOSE_FILES ps
printf 'Deploy complete. app_dir=%s image_tag=%s\n' "$APP_DIR" "$IMAGE_TAG"
