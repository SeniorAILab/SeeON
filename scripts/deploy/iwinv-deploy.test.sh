#!/usr/bin/env sh
set -eu

REPO_ROOT=$(CDPATH='' cd -- "$(dirname "$0")/../.." && pwd)
SCRIPT=$REPO_ROOT/scripts/deploy/iwinv-deploy.sh
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT HUP INT TERM

mkdir -p "$TMP/bin" "$TMP/root/shared" "$TMP/root/backups/db" "$TMP/root/releases"

cat > "$TMP/bin/docker" <<'EOF'
#!/usr/bin/env sh
if [ "${1:-}" = images ]; then
  printf '%s\n' \
    'eldercare-backend:0123456789abcdef0123456789abcdef01234567' \
    'eldercare-front:0123456789abcdef0123456789abcdef01234567' \
    'eldercare-backend:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
fi
EOF

cat > "$TMP/bin/free" <<'EOF'
#!/usr/bin/env sh
printf '%s\n' \
  '              total        used        free      shared  buff/cache   available' \
  'Mem:           6144        1024        1024           0        4096        4096' \
  'Swap:          4096           0        4096'
EOF

cat > "$TMP/bin/sha256sum" <<'EOF'
#!/usr/bin/env sh
printf '%s  %s\n' '0000000000000000000000000000000000000000000000000000000000000000' "${1:--}"
EOF
chmod +x "$TMP/bin/docker" "$TMP/bin/free" "$TMP/bin/sha256sum"

cat > "$TMP/host.env" <<'EOF'
POSTGRES_USER=fall
POSTGRES_PASSWORD=test
POSTGRES_DB=fall_prod
BACKEND_IMAGE=unused
FRONT_IMAGE=unused
EOF

run_deploy() {
  PATH="$TMP/bin:$PATH" \
  APP_ROOT="$TMP/root" \
  APP_DIR="$REPO_ROOT" \
  ENV_FILE="$TMP/host.env" \
  MEMORY_MIN_MB="${MEMORY_MIN_MB:-1}" \
  DISK_MIN_MB="${DISK_MIN_MB:-1}" \
    sh "$SCRIPT" "$@" 2>&1
}

assert_contains() {
  case "$1" in
    *"$2"*) ;;
    *) printf 'missing expected output: %s\n%s\n' "$2" "$1" >&2; exit 1 ;;
  esac
}

assert_not_contains() {
  case "$1" in
    *"$2"*) printf 'unexpected output: %s\n%s\n' "$2" "$1" >&2; exit 1 ;;
    *) ;;
  esac
}

SHA=0123456789abcdef0123456789abcdef01234567
output=$(run_deploy --sha "$SHA" --dry-run)
assert_contains "$output" 'compose pull db'
assert_contains "$output" "protected image tags: eldercare-backend:$SHA"
assert_contains "$output" 'would create and validate pre-migration dump'
assert_contains "$output" 'would atomically write'
assert_not_contains "$output" 'compose pull backend'
assert_not_contains "$output" 'compose pull front'

set +e
output=$(MEMORY_MIN_MB=999999 run_deploy --sha "$SHA" --dry-run)
status=$?
set -e
[ "$status" -ne 0 ] || { printf 'preflight unexpectedly passed\n' >&2; exit 1; }
assert_contains "$output" 'Insufficient available memory plus swap'
assert_not_contains "$output" 'compose pull db'

for index in 01 02 03 04 05 06 07; do
  : > "$TMP/root/backups/db/normal-20260711-0000${index}-$SHA.dump"
done
printf '%s\n' "baseline-20260711-$SHA.dump" > "$TMP/root/backups/db/baseline.marker"
: > "$TMP/root/backups/db/baseline-20260711-$SHA.dump"
output=$(run_deploy --sha "$SHA" --dry-run)
assert_contains "$output" "would remove $TMP/root/backups/db/normal-20260711-000001-$SHA.dump"
assert_contains "$output" "would remove $TMP/root/backups/db/normal-20260711-000002-$SHA.dump"
assert_not_contains "$output" 'would remove baseline-'

ROLLBACK_SHA=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
cat > "$TMP/root/releases/previous.json" <<EOF
{"sha":"$ROLLBACK_SHA","backend_image":"eldercare-backend:$ROLLBACK_SHA","backend_image_id":"sha256:backend","front_image":"eldercare-front:$ROLLBACK_SHA","front_image_id":"sha256:front","compose_sha256":"compose","env_sha256":"env","pre_migration_dump":"normal-test.dump","timestamp":"2026-07-11T00:00:00Z"}
EOF
output=$(run_deploy --rollback --dry-run)
assert_contains "$output" 'would verify manifest image IDs'
assert_contains "$output" 'compose up -d --wait backend front'
assert_not_contains "$output" 'pg_dump'
assert_not_contains "$output" 'migrate deploy'

set +e
output=$(run_deploy --restore-db "$TMP/missing.dump" --dry-run)
status=$?
set -e
[ "$status" -ne 0 ] || { printf 'restore without acknowledgement unexpectedly passed\n' >&2; exit 1; }
assert_contains "$output" '--restore-db requires --ack-data-loss'

printf 'iwinv deploy contract tests passed\n'
