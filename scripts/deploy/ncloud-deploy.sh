#!/usr/bin/env sh
set -eu

APP_ROOT="${APP_ROOT:-/opt/eldercare-fall-ai}"
APP_DIR="${APP_DIR:-$APP_ROOT/current}"
ENV_FILE="${ENV_FILE:-$APP_ROOT/shared/.env}"
PRUNE_DOCKER="${PRUNE_DOCKER:-1}"
IMAGE_NAMESPACE="${IMAGE_NAMESPACE:-ghcr.io/goberomsu/eldercare-fall-ai}"
IMAGE_TAG="${IMAGE_TAG:-latest}"
COMPOSE_FILES="-f compose.yaml -f compose.prod.yaml -f compose.registry.yaml"
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

mkdir -p "$APP_ROOT" "$APP_ROOT/shared"

if [ ! -f "$APP_DIR/compose.yaml" ]; then
  echo "Deploy bundle is missing at $APP_DIR." >&2
  echo "Upload compose files before running this script." >&2
  exit 1
fi

if [ ! -f "$ENV_FILE" ]; then
  cat >&2 <<EOF
Missing $ENV_FILE.
Create it from docs/runbooks/ncloud-vm-deploy.md before deploying.
EOF
  exit 1
fi

umask 077
cp "$ENV_FILE" "$APP_DIR/.env"

cd "$APP_DIR"

docker compose $COMPOSE_FILES config >/dev/null
COMPOSE_PROFILES=full docker compose $COMPOSE_FILES pull db backend front
docker compose $COMPOSE_FILES up -d --wait --force-recreate db
COMPOSE_PROFILES=full docker compose $COMPOSE_FILES stop front backend >/dev/null 2>&1 || true
docker compose $COMPOSE_FILES exec -T db sh -c \
  'psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" -c "DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;"'
docker compose $COMPOSE_FILES exec -T db sh /docker-entrypoint-initdb.d/02-sync-app-role.sh
for migration in backend/prisma/migrations/*/migration.sql; do
  docker compose $COMPOSE_FILES exec -T db sh -c \
    'psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB"' < "$migration"
done
COMPOSE_PROFILES=full docker compose $COMPOSE_FILES up -d --wait backend front

if command -v curl >/dev/null 2>&1; then
  smoke_attempt=1
  until curl -fsS http://127.0.0.1/ >/dev/null; do
    if [ "$smoke_attempt" -ge 12 ]; then
      echo "Frontend smoke check failed after $smoke_attempt attempts." >&2
      exit 1
    fi
    smoke_attempt=$((smoke_attempt + 1))
    sleep 5
  done
fi

if [ "$PRUNE_DOCKER" = "1" ]; then
  running_images="$(docker ps --format '{{.Image}}')"
  docker images --format '{{.Repository}}:{{.Tag}}' |
    while IFS= read -r image; do
      case "$image" in
        "$IMAGE_NAMESPACE/"*)
          if printf '%s\n' "$running_images" | grep -Fx "$image" >/dev/null; then
            continue
          fi
          docker image rm "$image" >/dev/null 2>&1 || true
          ;;
      esac
    done
  docker image prune -f >/dev/null
  docker builder prune -f --filter until=24h >/dev/null || true
fi

COMPOSE_PROFILES=full docker compose $COMPOSE_FILES ps
printf 'Deploy complete. app_dir=%s image_tag=%s\n' "$APP_DIR" "$IMAGE_TAG"
