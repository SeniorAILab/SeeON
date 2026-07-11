#!/usr/bin/env sh
# shellcheck disable=SC2016 # Quoted commands expand environment inside containers.
set -eu

APP_ROOT=${APP_ROOT:-/opt/eldercare-fall-ai}
APP_DIR=${APP_DIR:-$APP_ROOT/repo}
ENV_FILE=${ENV_FILE:-$APP_ROOT/shared/.env}
BACKUP_DIR=${BACKUP_DIR:-$APP_ROOT/backups/db}
RELEASE_DIR=${RELEASE_DIR:-$APP_ROOT/releases}
LOCK_DIR=$APP_ROOT/shared/deploy.lock
RELEASE_ENV=$APP_ROOT/shared/release-images.env
COMPOSE_FILES='-f compose.yaml -f compose.prod.yaml'
MEMORY_MIN_MB=${MEMORY_MIN_MB:-1024}
DISK_MIN_MB=${DISK_MIN_MB:-2048}

SHA='' DRY_RUN=0 ROLLBACK=0 ROLLBACK_SHA='' RESTORE_DUMP='' ACK_DATA_LOSS=0
LOCK_HELD=0 TEMP_FILE='' BACKEND_IMAGE='' FRONT_IMAGE='' BACKEND_ID='' FRONT_ID='' PRE_DUMP=''

usage() {
  printf '%s\n' 'Usage: iwinv-deploy.sh --sha <sha> [--dry-run] | --rollback [sha] [--restore-db dump --ack-data-loss] [--dry-run] | --restore-db dump --ack-data-loss [--dry-run]' >&2
  exit 2
}
log() { printf '+ %s\n' "$*" >&2; }
fail() { printf '%s\n' "$*" >&2; exit 1; }
need() { command -v "$1" >/dev/null 2>&1 || fail "Missing required command: $1"; }
valid_sha() { [ "${#1}" -eq 40 ] && printf '%s' "$1" | grep -Eq '^[0-9a-f]{40}$'; }
run() { log "$*"; [ "$DRY_RUN" -eq 1 ] || "$@"; }

while [ "$#" -gt 0 ]; do
  case "$1" in
    --sha) [ "$#" -ge 2 ] || usage; SHA=$2; shift 2 ;;
    --dry-run) DRY_RUN=1; shift ;;
    --rollback)
      ROLLBACK=1
      if [ "$#" -ge 2 ] && valid_sha "$2"; then ROLLBACK_SHA=$2; shift 2; else shift; fi
      ;;
    --restore-db) [ "$#" -ge 2 ] || usage; RESTORE_DUMP=$2; shift 2 ;;
    --ack-data-loss) ACK_DATA_LOSS=1; shift ;;
    *) usage ;;
  esac
done

if [ "$ROLLBACK" -eq 0 ] && [ -z "$RESTORE_DUMP" ]; then
  valid_sha "$SHA" || fail 'SHA must be exactly 40 lowercase hexadecimal characters.'
fi
if [ -n "$ROLLBACK_SHA" ] && ! valid_sha "$ROLLBACK_SHA"; then fail 'Rollback SHA must be exactly 40 lowercase hexadecimal characters.'; fi
if [ -n "$RESTORE_DUMP" ] && [ "$ACK_DATA_LOSS" -ne 1 ]; then fail '--restore-db requires --ack-data-loss.'; fi
if [ "$ACK_DATA_LOSS" -eq 1 ] && [ -z "$RESTORE_DUMP" ]; then usage; fi

need docker; need curl; need df; need free; need grep; need awk; need sed; need sha256sum
need cp; need mv; need rm; need mkdir; need rmdir; need date; need sort; need head
[ -d "$APP_DIR" ] || fail "Missing deployment directory: $APP_DIR"
[ -f "$APP_DIR/compose.yaml" ] || fail "Missing compose.yaml in $APP_DIR"
[ -f "$APP_DIR/compose.prod.yaml" ] || fail "Missing compose.prod.yaml in $APP_DIR"
[ -f "$ENV_FILE" ] || fail "Missing production environment file: $ENV_FILE"
cd "$APP_DIR"

compose() {
  # shellcheck disable=SC2086 # Fixed pair of Compose file arguments.
  docker compose --env-file "$ENV_FILE" --env-file "$RELEASE_ENV" $COMPOSE_FILES "$@"
}
release_lock() { [ "$LOCK_HELD" -eq 1 ] && rmdir "$LOCK_DIR" >/dev/null 2>&1 || :; }
cleanup() { status=$?; release_lock; [ -z "$TEMP_FILE" ] || rm -f "$TEMP_FILE" >/dev/null 2>&1 || :; trap - 0 HUP INT TERM; exit "$status"; }
acquire_lock() {
  if [ "$DRY_RUN" -eq 1 ]; then
    log "would acquire deployment lock $LOCK_DIR"
    return
  fi
  mkdir -p "$APP_ROOT/shared" "$BACKUP_DIR" "$RELEASE_DIR"
  mkdir "$LOCK_DIR" 2>/dev/null || fail "Another deployment is already running: $LOCK_DIR"
  LOCK_HELD=1
  trap cleanup 0 HUP INT TERM
}

json_value() { sed -n "s/.*\"$2\":\"\([^\"]*\)\".*/\1/p" "$1"; }
manifest_for() {
  if [ "$ROLLBACK" -eq 1 ]; then
    if [ -n "$ROLLBACK_SHA" ]; then printf '%s\n' "$RELEASE_DIR/$ROLLBACK_SHA.json"; else printf '%s\n' "$RELEASE_DIR/previous.json"; fi
  else
    printf '%s\n' "$RELEASE_DIR/current.json"
  fi
}
read_manifest() {
  manifest=$1
  [ -f "$manifest" ] || fail "Release manifest not found: $manifest"
  SHA=$(json_value "$manifest" sha); BACKEND_IMAGE=$(json_value "$manifest" backend_image); FRONT_IMAGE=$(json_value "$manifest" front_image)
  BACKEND_ID=$(json_value "$manifest" backend_image_id); FRONT_ID=$(json_value "$manifest" front_image_id)
  valid_sha "$SHA" || fail "Invalid SHA in manifest: $manifest"
  [ "$BACKEND_IMAGE" = "eldercare-backend:$SHA" ] && [ "$FRONT_IMAGE" = "eldercare-front:$SHA" ] || fail "Invalid image tags in manifest: $manifest"
  [ -n "$BACKEND_ID" ] && [ -n "$FRONT_ID" ] || fail "Missing image IDs in manifest: $manifest"
}
write_release_env() {
  if [ "$DRY_RUN" -eq 1 ]; then
    log "would atomically write $RELEASE_ENV with exact image tags"
    return
  fi
  TEMP_FILE=$RELEASE_ENV.$$.tmp
  umask 077
  printf 'BACKEND_IMAGE=%s\nFRONT_IMAGE=%s\n' "$BACKEND_IMAGE" "$FRONT_IMAGE" > "$TEMP_FILE"
  mv "$TEMP_FILE" "$RELEASE_ENV"
  TEMP_FILE=
}

preflight() {
  memory_mb=$(free -m | awk '/^Mem:/ { mem=$7 } /^Swap:/ { swap=$4 } END { print mem + swap }')
  disk_mb=$(df -Pm "$APP_ROOT" | awk 'NR == 2 { print $4 }')
  case "$memory_mb:$disk_mb" in *[!0-9:]*|:*|*:) fail 'Unable to determine available memory plus swap or disk.';; esac
  log "preflight available_memory_plus_swap_mb=$memory_mb available_disk_mb=$disk_mb"
  [ "$memory_mb" -ge "$MEMORY_MIN_MB" ] || fail "Insufficient available memory plus swap: ${memory_mb}MiB (need ${MEMORY_MIN_MB}MiB)."
  [ "$disk_mb" -ge "$DISK_MIN_MB" ] || fail "Insufficient available disk: ${disk_mb}MiB (need ${DISK_MIN_MB}MiB)."
}

sync_app_role() { compose exec -T db sh < backend/prisma/init/02-sync-app-role.sh; }
prisma_migration_rows() { compose exec -T db sh -c 'psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" -Atc "SELECT CASE WHEN to_regclass('\''public._prisma_migrations'\'') IS NULL THEN -1 ELSE (SELECT count(*) FROM public._prisma_migrations) END;"'; }
domain_table_rows() { compose exec -T db sh -c 'psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" -Atc "SELECT count(*) FROM information_schema.tables WHERE table_schema = '\''public'\'' AND table_type = '\''BASE TABLE'\'' AND table_name <> '\''_prisma_migrations'\'';"'; }
assert_prisma_managed() {
  rows=$(prisma_migration_rows); tables=$(domain_table_rows)
  [ "$rows" -gt 0 ] || [ "$tables" -eq 0 ] || fail 'Refusing migration: existing domain tables lack Prisma migration tracking.'
}
run_migrations() { log 'docker compose run backend pnpm exec prisma migrate deploy'; compose run --rm --no-deps backend pnpm exec prisma migrate deploy --schema prisma/schema.prisma; }
bootstrap_super_admin() { compose run --rm --no-deps backend node dist/prisma/seed-super-admin.js; }

rotate_dumps() {
  baseline=$(sed -n '1p' "$BACKUP_DIR/baseline.marker" 2>/dev/null || :)
  log "dump retention: retain newest five normal dumps and baseline ${baseline:-to be-created}"
  dumps=$(for dump in "$BACKUP_DIR"/normal-*.dump; do [ -f "$dump" ] && printf '%s\n' "$dump"; done | sort)
  count=$(printf '%s\n' "$dumps" | grep -c . || :)
  if [ "$count" -gt 5 ]; then
    remove=$((count - 5))
    if [ "$DRY_RUN" -eq 1 ]; then printf '%s\n' "$dumps" | head -n "$remove" | while IFS= read -r dump; do log "would remove $dump"; done
    else printf '%s\n' "$dumps" | head -n "$remove" | while IFS= read -r dump; do rm -f "$dump"; done; fi
  fi
}
backup_and_validate() {
  PRE_DUMP=normal-$(date -u +%Y%m%d-%H%M%S)-$SHA.dump
  dump=$BACKUP_DIR/$PRE_DUMP
  log "docker compose exec db pg_dump -Fc > $dump"
  compose exec -T db sh -c 'pg_dump --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" -Fc' > "$dump"
  compose exec -T db pg_restore --list < "$dump" >/dev/null
  if [ ! -f "$BACKUP_DIR/baseline.marker" ]; then
    baseline=baseline-$(date -u +%Y%m%d-%H%M%S)-$SHA.dump
    cp "$dump" "$BACKUP_DIR/$baseline"; TEMP_FILE=$BACKUP_DIR/.baseline.$$.tmp; printf '%s\n' "$baseline" > "$TEMP_FILE"; mv "$TEMP_FILE" "$BACKUP_DIR/baseline.marker"; TEMP_FILE=
  fi
  rotate_dumps
}

image_id() { docker image inspect --format '{{.Id}}' "$1"; }
verify_image_ids() { [ "$(image_id "$BACKEND_IMAGE")" = "$BACKEND_ID" ] || fail "Backend image ID differs from manifest."; [ "$(image_id "$FRONT_IMAGE")" = "$FRONT_ID" ] || fail "Frontend image ID differs from manifest."; }
verify_services() {
  # SC2016: the JavaScript reads EXPECTED_SHA inside the backend container.
  deadline=$(( $(date +%s) + 120 ))
  while :; do
    if compose exec -T -e EXPECTED_SHA="$SHA" backend node -e 'fetch("http://127.0.0.1:8080/health").then(async r=>{const b=await r.json();process.exit(r.ok && b.sha===process.env.EXPECTED_SHA && b.database==="ok" ? 0 : 1)}).catch(()=>process.exit(1))' && [ "$(curl -fsS http://127.0.0.1:3000/version.txt 2>/dev/null || :)" = "$SHA" ]; then return 0; fi
    [ "$(date +%s)" -lt "$deadline" ] || fail 'Backend health or frontend version check did not pass within 120 seconds.'
    sleep 2
  done
}

write_manifest() {
  if [ "$DRY_RUN" -eq 1 ]; then
    log "would atomically write $RELEASE_DIR/$SHA.json, previous.json, and current.json"
    return
  fi
  compose_hash=$(sha256sum compose.yaml compose.prod.yaml | sha256sum | awk '{print $1}')
  env_hash=$(sha256sum "$ENV_FILE" | awk '{print $1}')
  manifest=$RELEASE_DIR/$SHA.json
  TEMP_FILE=$RELEASE_DIR/.$SHA.$$.tmp
  umask 077
  printf '{"sha":"%s","backend_image":"%s","backend_image_id":"%s","front_image":"%s","front_image_id":"%s","compose_sha256":"%s","env_sha256":"%s","pre_migration_dump":"%s","timestamp":"%s"}\n' "$SHA" "$BACKEND_IMAGE" "$BACKEND_ID" "$FRONT_IMAGE" "$FRONT_ID" "$compose_hash" "$env_hash" "$PRE_DUMP" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$TEMP_FILE"
  mv "$TEMP_FILE" "$manifest"
  TEMP_FILE=
  if [ -f "$RELEASE_DIR/current.json" ]; then
    TEMP_FILE=$RELEASE_DIR/.previous.$$.tmp
    cp "$RELEASE_DIR/current.json" "$TEMP_FILE"
    mv "$TEMP_FILE" "$RELEASE_DIR/previous.json"
    TEMP_FILE=
  fi
  TEMP_FILE=$RELEASE_DIR/.current.$$.tmp
  cp "$manifest" "$TEMP_FILE"
  mv "$TEMP_FILE" "$RELEASE_DIR/current.json"
  TEMP_FILE=
}
protected_images() { printf '%s\n' "$BACKEND_IMAGE" "$FRONT_IMAGE"; for manifest in "$RELEASE_DIR/current.json" "$RELEASE_DIR/previous.json"; do [ ! -f "$manifest" ] || { json_value "$manifest" backend_image; json_value "$manifest" front_image; }; done; return 0; }
prune_images() {
  protected=$(protected_images); log "protected image tags: $protected"
  docker images --format '{{.Repository}}:{{.Tag}}' | while IFS= read -r image; do
    case "$image" in eldercare-backend:*|eldercare-front:*)
      printf '%s\n' "$protected" | grep -Fx "$image" >/dev/null || { log "docker image rm $image"; [ "$DRY_RUN" -eq 1 ] || docker image rm "$image" >/dev/null; };; esac
  done
}

acquire_lock
if [ "$ROLLBACK" -eq 1 ] || [ -n "$RESTORE_DUMP" ]; then read_manifest "$(manifest_for)"; else BACKEND_IMAGE=eldercare-backend:$SHA; FRONT_IMAGE=eldercare-front:$SHA; fi
write_release_env
preflight
run compose config >/dev/null
run compose pull db
run compose up -d --wait db

if [ -n "$RESTORE_DUMP" ]; then
  [ -f "$RESTORE_DUMP" ] || fail "Database dump not found: $RESTORE_DUMP"
  run compose stop front backend
  log "docker compose exec db pg_restore --list < $RESTORE_DUMP"
  [ "$DRY_RUN" -eq 1 ] || compose exec -T db pg_restore --list < "$RESTORE_DUMP" >/dev/null
  if [ "$DRY_RUN" -eq 1 ]; then
    log "would restore database from $RESTORE_DUMP with pg_restore --clean --if-exists"
  else
    compose exec -T db pg_restore --clean --if-exists --no-owner --no-privileges < "$RESTORE_DUMP"
  fi
fi

if [ "$ROLLBACK" -eq 1 ]; then
  if [ "$DRY_RUN" -eq 1 ]; then
    log "would verify manifest image IDs for $BACKEND_IMAGE and $FRONT_IMAGE"
  else
    verify_image_ids
  fi
  run compose stop front backend
  run compose up -d --wait backend front
  [ "$DRY_RUN" -eq 1 ] || verify_services
  write_manifest
  prune_images
  exit 0
fi

if [ -n "$RESTORE_DUMP" ]; then
  run compose up -d --wait backend front
  [ "$DRY_RUN" -eq 1 ] || verify_services
  prune_images
  exit 0
fi

run docker image inspect "$BACKEND_IMAGE" >/dev/null
run docker image inspect "$FRONT_IMAGE" >/dev/null
run compose stop front backend
if [ "$DRY_RUN" -eq 1 ]; then log 'would create and validate pre-migration dump, create baseline if absent, and rotate normal dumps'; rotate_dumps; log 'would sync app role, assert Prisma tracking, run migrate deploy, and bootstrap super-admin'; else
  backup_and_validate; sync_app_role; assert_prisma_managed; run_migrations; bootstrap_super_admin
fi
run compose up -d --wait backend front
[ "$DRY_RUN" -eq 1 ] || verify_services
if [ "$DRY_RUN" -eq 1 ]; then
  BACKEND_ID='<resolved-at-deploy>'
  FRONT_ID='<resolved-at-deploy>'
else
  BACKEND_ID=$(image_id "$BACKEND_IMAGE")
  FRONT_ID=$(image_id "$FRONT_IMAGE")
fi
write_manifest
prune_images
printf 'Deploy complete. sha=%s\n' "$SHA"
