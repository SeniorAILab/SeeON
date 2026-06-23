#!/usr/bin/env sh
set -eu

APP_ROOT="${APP_ROOT:-/opt/eldercare-fall-ai}"
APP_DIR="${APP_DIR:-$APP_ROOT/current}"
ENV_FILE="${ENV_FILE:-$APP_ROOT/shared/.env}"
REPO_URL="${REPO_URL:-https://github.com/GoBeromsu/eldercare-fall-ai.git}"
BRANCH="${BRANCH:-main}"
PRUNE_DOCKER="${PRUNE_DOCKER:-1}"
SKIP_GIT_UPDATE="${SKIP_GIT_UPDATE:-0}"
DEPLOY_MODE="${DEPLOY_MODE:-image}"
IMAGE_NAMESPACE="${IMAGE_NAMESPACE:-${IMAGE_REPOSITORY:-ghcr.io/goberomsu/eldercare-fall-ai}}"
IMAGE_TAG="${IMAGE_TAG:-latest}"
PULL_POLICY="${PULL_POLICY:-always}"

if [ "$DEPLOY_MODE" = "image" ]; then
  COMPOSE_FILES="-f compose.yaml -f compose.prod.yaml -f compose.registry.yaml"
  BACKEND_IMAGE="${BACKEND_IMAGE:-$IMAGE_NAMESPACE/backend:$IMAGE_TAG}"
  FRONT_IMAGE="${FRONT_IMAGE:-$IMAGE_NAMESPACE/front:$IMAGE_TAG}"
  MIGRATE_IMAGE="${MIGRATE_IMAGE:-$IMAGE_NAMESPACE/migrate:$IMAGE_TAG}"
  export BACKEND_IMAGE FRONT_IMAGE MIGRATE_IMAGE PULL_POLICY
elif [ "$DEPLOY_MODE" = "build" ]; then
  COMPOSE_FILES="-f compose.yaml -f compose.prod.yaml"
else
  echo "DEPLOY_MODE must be 'image' or 'build'." >&2
  exit 1
fi

need() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

need docker
if [ "$SKIP_GIT_UPDATE" != "1" ]; then
  need git
fi

mkdir -p "$APP_ROOT" "$APP_ROOT/shared"

if [ "$SKIP_GIT_UPDATE" = "1" ]; then
  if [ ! -f "$APP_DIR/compose.yaml" ]; then
    echo "SKIP_GIT_UPDATE=1 requires an existing app tree at $APP_DIR." >&2
    exit 1
  fi
elif [ ! -d "$APP_DIR/.git" ]; then
  if [ -e "$APP_DIR" ] && [ "$(find "$APP_DIR" -mindepth 1 -maxdepth 1 2>/dev/null | wc -l | tr -d ' ')" != "0" ]; then
    echo "$APP_DIR exists but is not an empty git checkout; refusing to overwrite it." >&2
    exit 1
  fi
  rm -rf "$APP_DIR"
  git clone --branch "$BRANCH" --depth 1 "$REPO_URL" "$APP_DIR"
else
  git -C "$APP_DIR" fetch --prune origin "$BRANCH"
  git -C "$APP_DIR" checkout "$BRANCH"
  git -C "$APP_DIR" reset --hard "origin/$BRANCH"
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
if [ "$DEPLOY_MODE" = "image" ] && [ "$PULL_POLICY" != "never" ]; then
  COMPOSE_PROFILES=full,migrate docker compose $COMPOSE_FILES pull db backend front migrate
fi
docker compose $COMPOSE_FILES up -d --wait db
COMPOSE_PROFILES=full docker compose $COMPOSE_FILES stop front backend >/dev/null 2>&1 || true
if [ "$DEPLOY_MODE" = "build" ]; then
  docker compose $COMPOSE_FILES build migrate
fi
COMPOSE_PROFILES=migrate docker compose $COMPOSE_FILES run --rm migrate
if [ "$DEPLOY_MODE" = "build" ]; then
  COMPOSE_PROFILES=full docker compose $COMPOSE_FILES up -d --build --wait backend front
else
  COMPOSE_PROFILES=full docker compose $COMPOSE_FILES up -d --wait backend front
fi

if command -v curl >/dev/null 2>&1; then
  curl -fsS http://127.0.0.1/ >/dev/null
fi

if [ "$PRUNE_DOCKER" = "1" ]; then
  docker image prune -f >/dev/null
  docker builder prune -f --filter until=24h >/dev/null || true
fi

COMPOSE_PROFILES=full,migrate docker compose $COMPOSE_FILES ps
printf 'Deploy complete. mode=%s app_dir=%s branch=%s image_tag=%s\n' "$DEPLOY_MODE" "$APP_DIR" "$BRANCH" "$IMAGE_TAG"
