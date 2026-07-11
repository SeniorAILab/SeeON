#!/usr/bin/env sh
set -eu

REPO_ROOT=$(CDPATH='' cd -- "$(dirname "$0")/../.." && pwd)
SCRIPT=$REPO_ROOT/scripts/deploy/iwinv-deploy.sh
JENKINSFILE=$REPO_ROOT/Jenkinsfile
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT HUP INT TERM
mkdir -p "$TMP/bin" "$TMP/root/shared" "$TMP/root/backups/db" "$TMP/root/releases"

cat > "$TMP/bin/docker" <<'EOF'
#!/usr/bin/env sh
log=${MOCK_LOG:-}
[ -z "$log" ] || printf '%s\n' "docker $*" >> "$log"
if [ "${1:-}" = images ]; then
  [ "${MOCK_IMAGES_FAIL:-0}" != 1 ] || exit 1
  printf '%s\n' "eldercare-backend:${MOCK_SHA}" "eldercare-front:${MOCK_SHA}" "eldercare-backend:cccccccccccccccccccccccccccccccccccccccc"
  exit 0
fi
if [ "${1:-}" = image ] && [ "${2:-}" = inspect ]; then
  image=${5:-}
  image_sha=${MOCK_IMAGE_ID_SHA:-${image#*:}}
  case "$image" in
    eldercare-backend:*) printf 'sha256:backend-%s\n' "$image_sha" ;;
    eldercare-front:*) printf 'sha256:front-%s\n' "$image_sha" ;;
    *) exit 1 ;;
  esac
  exit 0
fi
if [ "${1:-}" = image ] && [ "${2:-}" = rm ]; then
  [ "${MOCK_IMAGE_RM_FAIL:-0}" != 1 ] || exit 1
  exit 0
fi
if [ "${1:-}" = compose ]; then
  case " $* " in
    *pg_dump*) printf 'mock dump\n' ;;
    *'pg_restore --list'*) ;;
    *'pg_restore --clean --if-exists --no-owner'*) ;;
    *has_table_privilege*) printf '%s\n' "${MOCK_AUTH_RESULT:-ok}" ;;
    *psql*) printf '0\n' ;;
    *'exec -T db sh'*) ;;
    *'backend node'*)
      if [ "${MOCK_BACKEND_FAIL:-0}" = 1 ]; then printf 'status=503\nbody={"sha":"wrong","database":"down"}\n'; exit 1; fi
      printf 'status=200\nbody={"sha":"%s","database":"ok"}\n' "$MOCK_SHA" ;;
    *' config '*) ;;
    *' pull db '*) ;;
    *' up -d --wait --wait-timeout 120 db '*) ;;
    *' up -d --wait --wait-timeout 120 backend front '*) ;;
    *' stop front backend '*) ;;
    *'prisma migrate deploy'*) ;;
    *'seed-super-admin.js'*) ;;
    *) printf 'unexpected docker compose command: %s\n' "$*" >&2; exit 1 ;;
  esac
  exit 0
fi
exit 1
EOF
cat > "$TMP/bin/curl" <<'EOF'
#!/usr/bin/env sh
headers='' body=''
log=${MOCK_LOG:-}
[ -z "$log" ] || printf '%s\n' "curl $*" >> "$log"
while [ "$#" -gt 0 ]; do
  case "$1" in
    --dump-header) headers=$2; shift 2 ;;
    --output) body=$2; shift 2 ;;
    *) shift ;;
  esac
done
printf 'HTTP/1.1 200 OK\r\n\r\n' > "$headers"
printf '%s\n' "${MOCK_FRONT_VERSION:-$MOCK_SHA}" > "$body"
EOF
cat > "$TMP/bin/free" <<'EOF'
#!/usr/bin/env sh
printf '%s\n' 'Mem: 6144 1024 1024 0 4096 4096' 'Swap: 4096 0 4096'
EOF
cat > "$TMP/bin/sha256sum" <<'EOF'
#!/usr/bin/env sh
printf '%s  %s\n' '0000000000000000000000000000000000000000000000000000000000000000' "${1:--}"
EOF
cat > "$TMP/bin/rmdir" <<'EOF'
#!/usr/bin/env sh
[ "${FAIL_RMDIR:-0}" != 1 ] || exit 1
exec /bin/rmdir "$@"
EOF
chmod +x "$TMP/bin/docker" "$TMP/bin/curl" "$TMP/bin/free" "$TMP/bin/sha256sum" "$TMP/bin/rmdir"

cat > "$TMP/host.env" <<'EOF'
POSTGRES_USER=fall
POSTGRES_PASSWORD=test
POSTGRES_DB=fall_prod
BACKEND_IMAGE=unused
FRONT_IMAGE=unused
EOF

SHA=0123456789abcdef0123456789abcdef01234567
ROLLBACK_SHA=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
CURRENT_SHA=bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
manifest() {
  printf '{"sha":"%s","backend_image":"eldercare-backend:%s","backend_image_id":"sha256:backend-%s","front_image":"eldercare-front:%s","front_image_id":"sha256:front-%s","compose_sha256":"compose","env_sha256":"env","pre_migration_dump":"normal-test.dump","timestamp":"2026-07-11T00:00:00Z"}\n' "$1" "$1" "$1" "$1" "$1"
}
run_deploy() {
  PATH="$TMP/bin:$PATH" APP_ROOT="$TMP/root" APP_DIR="$REPO_ROOT" ENV_FILE="$TMP/host.env" \
  MEMORY_MIN_MB="${TEST_MEMORY_MIN_MB:-1}" DISK_MIN_MB=1 MOCK_SHA="${MOCK_SHA:-$SHA}" MOCK_LOG="$TMP/mock.log" \
  sh "$SCRIPT" "$@" 2>&1
}
assert_contains() { case "$1" in *"$2"*) ;; *) printf 'missing expected output: %s\n%s\n' "$2" "$1" >&2; exit 1;; esac; }
assert_not_contains() { case "$1" in *"$2"*) printf 'unexpected output: %s\n%s\n' "$2" "$1" >&2; exit 1;; *) ;; esac; }
assert_failure() { [ "$1" -ne 0 ] || { printf 'command unexpectedly passed\n' >&2; exit 1; }; }
assert_order() {
  first=$(printf '%s\n' "$1" | grep -n -F "$2" | sed -n '1s/:.*//p')
  second=$(printf '%s\n' "$1" | grep -n -F "$3" | sed -n '1s/:.*//p')
  [ -n "$first" ] && [ -n "$second" ] && [ "$first" -lt "$second" ] || {
    printf 'expected command ordering %s before %s\n%s\n' "$2" "$3" "$1" >&2
    exit 1
  }
}
release_state() {
  (
    cd "$TMP/root/releases"
    for release_file in ./*.json; do
      [ -f "$release_file" ] && cksum "$release_file"
    done | sort
  )
}

# Source-controlled webhook contract: exact JSONPaths, credential, main-only filter, and quiet logging.
jenkins=$(sed -n '1,120p' "$JENKINSFILE")
assert_contains "$jenkins" "value: '$.workflow_run.head_sha'"
assert_contains "$jenkins" "value: '$.ref'"
assert_contains "$jenkins" "tokenCredentialId: 'eldercare-webhook-token'"
assert_contains "$jenkins" "regexpFilterExpression: '^refs/heads/main$'"
assert_contains "$jenkins" 'printContributedVariables: false'
assert_contains "$jenkins" 'printPostContent: false'
assert_contains "$jenkins" "string(name: 'REF', defaultValue: ''"

# Strict mode parser rejects duplicate and conflicting primary modes before any Docker command.
: > "$TMP/mock.log"
set +e
output=$(run_deploy --sha "$SHA" --sha "$SHA" --dry-run); status=$?
set -e
assert_failure "$status"; assert_not_contains "$output" 'docker compose'
set +e
output=$(run_deploy --sha "$SHA" --rollback --dry-run); status=$?
set -e
assert_failure "$status"; assert_not_contains "$output" 'docker compose'
: > "$TMP/mock.log"
set +e
output=$(run_deploy --restore-db "$TMP/restore.dump"); status=$?
set -e
assert_failure "$status"; assert_contains "$output" '--restore-db requires --ack-data-loss.'
log=$(sed -n '1,200p' "$TMP/mock.log")
assert_not_contains "$log" 'docker '

# Dry-run exposes the db-only pull, protected-image pruning, retention, and preflight gates.
output=$(run_deploy --sha "$SHA" --dry-run)
assert_contains "$output" 'compose pull db'
assert_not_contains "$output" 'compose pull backend'
assert_not_contains "$output" 'compose pull front'
assert_contains "$output" "would verify exact local images eldercare-backend:$SHA and eldercare-front:$SHA"
assert_contains "$output" 'would create and validate pre-migration dump'
assert_contains "$output" 'would sync app role, assert Prisma tracking, run migrate deploy, and bootstrap super-admin'
assert_not_contains "$output" "docker image rm eldercare-backend:$SHA"
assert_not_contains "$output" "docker image rm eldercare-front:$SHA"
# Normal deploy rejects a preexisting target manifest or current SHA before Docker, backups, or database work.
manifest "$SHA" > "$TMP/root/releases/$SHA.json"
: > "$TMP/mock.log"
set +e
output=$(run_deploy --sha "$SHA"); status=$?
set -e
assert_failure "$status"; assert_contains "$output" 'Immutable release manifest already exists'
log=$(sed -n '1,200p' "$TMP/mock.log")
assert_not_contains "$log" 'docker '
rm -f "$TMP/root/releases/$SHA.json"
manifest "$SHA" > "$TMP/root/releases/current.json"
: > "$TMP/mock.log"
set +e
output=$(run_deploy --sha "$SHA"); status=$?
set -e
assert_failure "$status"; assert_contains "$output" 'Refusing deploy of already-current SHA'
log=$(sed -n '1,200p' "$TMP/mock.log")
assert_not_contains "$log" 'docker '
rm -f "$TMP/root/releases/current.json"

set +e
output=$(TEST_MEMORY_MIN_MB=999999 run_deploy --sha "$SHA" --dry-run); status=$?
set -e
assert_failure "$status"
assert_contains "$output" 'Insufficient available memory plus swap'
assert_not_contains "$output" 'compose pull db'

for index in 01 02 03 04 05 06 07; do
  : > "$TMP/root/backups/db/normal-20260711-0000${index}-$SHA.dump"
done
baseline=baseline-20260711-$SHA.dump
: > "$TMP/root/backups/db/$baseline"
printf '%s\n' "$baseline" > "$TMP/root/backups/db/baseline.marker"
output=$(run_deploy --sha "$SHA" --dry-run)
assert_contains "$output" "would remove $TMP/root/backups/db/normal-20260711-000001-$SHA.dump"
assert_contains "$output" "would remove $TMP/root/backups/db/normal-20260711-000002-$SHA.dump"
assert_not_contains "$output" "would remove $TMP/root/backups/db/$baseline"

# Requested rollback SHA must match the immutable manifest, not merely its filename.
manifest "$CURRENT_SHA" > "$TMP/root/releases/current.json"
manifest "$SHA" > "$TMP/root/releases/$ROLLBACK_SHA.json"
set +e
output=$(run_deploy --rollback "$ROLLBACK_SHA"); status=$?
set -e
assert_failure "$status"; assert_contains "$output" 'Rollback manifest SHA does not match requested SHA'

# Restore proves target code images before validating or restoring the database.
manifest "$SHA" > "$TMP/root/releases/current.json"
: > "$TMP/restore.dump"; : > "$TMP/mock.log"
set +e
output=$(MOCK_IMAGE_ID_SHA="$ROLLBACK_SHA" run_deploy --restore-db "$TMP/restore.dump" --ack-data-loss); status=$?
set -e
assert_failure "$status"; assert_contains "$output" 'Backend image ID differs from manifest'
log=$(sed -n '1,200p' "$TMP/mock.log")
assert_not_contains "$log" 'pg_restore --clean'

# Restore always recreates the runtime role, restores dump ACLs, and verifies authorization invariants.
: > "$TMP/mock.log"
output=$(run_deploy --restore-db "$TMP/restore.dump" --ack-data-loss)
log=$(sed -n '1,240p' "$TMP/mock.log")
assert_contains "$log" 'pg_restore --clean --if-exists --no-owner'
assert_not_contains "$log" '--no-privileges'
assert_contains "$log" 'exec -T db sh'
assert_contains "$log" 'has_table_privilege'
assert_contains "$output" 'compose up -d --wait --wait-timeout 120 backend front'
assert_order "$log" 'exec -T db sh' 'pg_restore --clean --if-exists --no-owner'
assert_order "$log" 'pg_restore --clean --if-exists --no-owner' 'has_table_privilege'
: > "$TMP/mock.log"
set +e
output=$(MOCK_AUTH_RESULT=invalid run_deploy --restore-db "$TMP/restore.dump" --ack-data-loss); status=$?
set -e
assert_failure "$status"; assert_contains "$output" 'Post-restore authorization invariant failed: invalid'
log=$(sed -n '1,240p' "$TMP/mock.log")
assert_order "$log" 'exec -T db sh' 'pg_restore --clean --if-exists --no-owner'
assert_order "$log" 'pg_restore --clean --if-exists --no-owner' 'has_table_privilege'
assert_not_contains "$log" 'up -d --wait --wait-timeout 120 backend front'

# Rollback plus acknowledged restore executes the same authorization-preserving restore before starting target code.
manifest "$ROLLBACK_SHA" > "$TMP/root/releases/$ROLLBACK_SHA.json"
: > "$TMP/mock.log"
output=$(MOCK_SHA="$ROLLBACK_SHA" run_deploy --rollback "$ROLLBACK_SHA" --restore-db "$TMP/restore.dump" --ack-data-loss)
log=$(sed -n '1,240p' "$TMP/mock.log")
assert_contains "$log" 'pg_restore --clean --if-exists --no-owner'
assert_not_contains "$log" '--no-privileges'
assert_contains "$log" 'has_function_privilege'
assert_contains "$output" 'compose up -d --wait --wait-timeout 120 backend front'
manifest "$SHA" > "$TMP/root/releases/$SHA.json"
# The post-readiness check is one attempt and includes the backend HTTP/body diagnostic.
: > "$TMP/mock.log"
set +e
output=$(MOCK_BACKEND_FAIL=1 run_deploy --rollback "$SHA"); status=$?
set -e
assert_failure "$status"; assert_contains "$output" 'Backend exact-SHA health verification failed'
assert_contains "$output" 'status=503'; assert_contains "$output" 'body={"sha":"wrong","database":"down"}'
log=$(sed -n '1,200p' "$TMP/mock.log")
health_calls=$(printf '%s\n' "$log" | grep -c 'backend node' || :)
[ "$health_calls" -eq 1 ] || { printf 'expected exactly one backend health attempt, got %s\n' "$health_calls" >&2; exit 1; }
# A wrong or malformed frontend version fails after one request and includes the response diagnostic.
for front_version in "$ROLLBACK_SHA" 'not-a-sha'; do
  : > "$TMP/mock.log"
  set +e
  output=$(MOCK_FRONT_VERSION="$front_version" run_deploy --rollback "$SHA"); status=$?
  set -e
  assert_failure "$status"; assert_contains "$output" 'Frontend exact-SHA verification failed'
  assert_contains "$output" "$front_version"
  log=$(sed -n '1,200p' "$TMP/mock.log")
  front_version_calls=$(printf '%s\n' "$log" | grep -c '^curl ' || :)
  [ "$front_version_calls" -eq 1 ] || { printf 'expected exactly one frontend version attempt, got %s\n' "$front_version_calls" >&2; exit 1; }
done
: > "$TMP/mock.log"
set +e
output=$(MOCK_FRONT_VERSION="$(printf '%s\nextra' "$SHA")" run_deploy --rollback "$SHA"); status=$?
set -e
assert_failure "$status"; assert_contains "$output" 'Frontend exact-SHA verification failed'
log=$(sed -n '1,200p' "$TMP/mock.log")
front_version_calls=$(printf '%s\n' "$log" | grep -c '^curl ' || :)
[ "$front_version_calls" -eq 1 ] || { printf 'expected exactly one frontend version attempt, got %s\n' "$front_version_calls" >&2; exit 1; }


# Explicit rollback to the active release is rejected before any service, database, pointer, manifest, or image change.
manifest "$CURRENT_SHA" > "$TMP/root/releases/current.json"
manifest "$ROLLBACK_SHA" > "$TMP/root/releases/previous.json"
manifest "$CURRENT_SHA" > "$TMP/root/releases/$CURRENT_SHA.json"
manifest "$ROLLBACK_SHA" > "$TMP/root/releases/$ROLLBACK_SHA.json"
: > "$TMP/mock.log"
set +e
output=$(MOCK_SHA="$CURRENT_SHA" run_deploy --rollback "$CURRENT_SHA"); status=$?
set -e
assert_failure "$status"; assert_contains "$output" 'Refusing rollback to already-current SHA'
log=$(sed -n '1,200p' "$TMP/mock.log")
assert_not_contains "$log" 'docker compose'
[ "$(sed -n 's/.*"sha":"\([^"]*\)".*/\1/p' "$TMP/root/releases/current.json")" = "$CURRENT_SHA" ]
[ "$(sed -n 's/.*"sha":"\([^"]*\)".*/\1/p' "$TMP/root/releases/previous.json")" = "$ROLLBACK_SHA" ]
[ -f "$TMP/root/releases/$CURRENT_SHA.json" ] || { printf 'current immutable manifest was removed\n' >&2; exit 1; }
[ -f "$TMP/root/releases/$ROLLBACK_SHA.json" ] || { printf 'previous immutable manifest was removed\n' >&2; exit 1; }
# Bare rollback to an identical previous release is rejected before any service or database work.
manifest "$CURRENT_SHA" > "$TMP/root/releases/previous.json"
: > "$TMP/mock.log"
set +e
output=$(MOCK_SHA="$CURRENT_SHA" run_deploy --rollback); status=$?
set -e
assert_failure "$status"; assert_contains "$output" 'Refusing rollback to already-current SHA'
log=$(sed -n '1,200p' "$TMP/mock.log")
assert_not_contains "$log" 'docker compose'
[ "$(sed -n 's/.*"sha":"\([^"]*\)".*/\1/p' "$TMP/root/releases/current.json")" = "$CURRENT_SHA" ]
[ "$(sed -n 's/.*"sha":"\([^"]*\)".*/\1/p' "$TMP/root/releases/previous.json")" = "$CURRENT_SHA" ]
# A malformed existing pointer blocks every mode before Docker or release-state effects.
manifest "$CURRENT_SHA" > "$TMP/root/releases/current.json"
printf '{"sha":"not-a-sha"}\n' > "$TMP/root/releases/previous.json"
manifest "$ROLLBACK_SHA" > "$TMP/root/releases/$ROLLBACK_SHA.json"
manifest "$SHA" > "$TMP/root/releases/$SHA.json"
printf 'BACKEND_IMAGE=sentinel\nFRONT_IMAGE=sentinel\n' > "$TMP/root/shared/release-images.env"
cp "$TMP/root/shared/release-images.env" "$TMP/release-images.env.before"
release_state_before=$(release_state)
: > "$TMP/mock.log"
set +e
output=$(MOCK_SHA="$ROLLBACK_SHA" run_deploy --rollback "$ROLLBACK_SHA"); status=$?
set -e
assert_failure "$status"; assert_contains "$output" 'Invalid SHA in manifest'
log=$(sed -n '1,240p' "$TMP/mock.log")
assert_not_contains "$log" 'docker '
cmp -s "$TMP/release-images.env.before" "$TMP/root/shared/release-images.env" || {
  printf 'release-images.env changed after malformed previous pointer rollback\n' >&2; exit 1
}
[ "$release_state_before" = "$(release_state)" ] || {
  printf 'release pointers or manifests changed after malformed previous pointer rollback\n' >&2; exit 1
}
: > "$TMP/mock.log"
set +e
output=$(run_deploy --sha "$SHA"); status=$?
set -e
assert_failure "$status"; assert_contains "$output" 'Invalid SHA in manifest'
log=$(sed -n '1,240p' "$TMP/mock.log")
assert_not_contains "$log" 'docker '
cmp -s "$TMP/release-images.env.before" "$TMP/root/shared/release-images.env" || {
  printf 'release-images.env changed after malformed previous pointer normal deploy\n' >&2; exit 1
}
[ "$release_state_before" = "$(release_state)" ] || {
  printf 'release pointers or manifests changed after malformed previous pointer normal deploy\n' >&2; exit 1
}
# Rollback activates the existing immutable manifest, retains only current/previous immutable releases, and prunes stale images.
manifest "$CURRENT_SHA" > "$TMP/root/releases/current.json"
manifest "$ROLLBACK_SHA" > "$TMP/root/releases/previous.json"
manifest "$ROLLBACK_SHA" > "$TMP/root/releases/$ROLLBACK_SHA.json"
manifest "$CURRENT_SHA" > "$TMP/root/releases/$CURRENT_SHA.json"
manifest "$SHA" > "$TMP/root/releases/$SHA.json"
: > "$TMP/mock.log"
output=$(MOCK_SHA="$ROLLBACK_SHA" run_deploy --rollback "$ROLLBACK_SHA")
assert_contains "$output" "compose up -d --wait --wait-timeout 120 backend front"
[ "$(sed -n 's/.*"sha":"\([^"]*\)".*/\1/p' "$TMP/root/releases/current.json")" = "$ROLLBACK_SHA" ]
[ "$(sed -n 's/.*"sha":"\([^"]*\)".*/\1/p' "$TMP/root/releases/previous.json")" = "$CURRENT_SHA" ]
[ ! -e "$TMP/root/releases/$SHA.json" ] || { printf 'stale immutable manifest was retained\n' >&2; exit 1; }

# An image-prune failure fails an otherwise successful deployment; a cleanup failure does too.
manifest "$SHA" > "$TMP/root/releases/$SHA.json"
set +e
output=$(MOCK_IMAGE_RM_FAIL=1 MOCK_SHA="$CURRENT_SHA" run_deploy --rollback "$CURRENT_SHA"); status=$?
set -e
assert_failure "$status"; assert_contains "$output" 'docker image rm'
set +e
output=$(MOCK_IMAGES_FAIL=1 MOCK_SHA="$ROLLBACK_SHA" run_deploy --rollback "$ROLLBACK_SHA"); status=$?
set -e
assert_failure "$status"; assert_contains "$output" 'Unable to list Docker images for pruning.'
set +e
output=$(FAIL_RMDIR=1 MOCK_SHA="$CURRENT_SHA" run_deploy --rollback "$CURRENT_SHA"); status=$?
set -e
assert_failure "$status"; assert_contains "$output" 'Failed to release deployment lock'
/bin/rmdir "$TMP/root/shared/deploy.lock"

printf 'iwinv deploy contract tests passed\n'
