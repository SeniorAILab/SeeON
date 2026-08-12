#!/usr/bin/env sh
set -eu

REPO_ROOT=$(CDPATH='' cd -- "$(dirname "$0")/../.." && pwd)
SCRIPT=$REPO_ROOT/scripts/deploy/rotate-admin-password.sh
TMP=$(mktemp -d "${TMPDIR:-/tmp}/rotate-admin-password-test.XXXXXX")
TMP=$(CDPATH='' cd -- "$TMP" && pwd -P)
cleanup() {
  trap - 0 HUP INT TERM
  rm -rf "$TMP"
}
trap cleanup 0 HUP INT TERM

mkdir -p "$TMP/bin" "$TMP/remote/repo" "$TMP/remote/shared"
printf '%s\n' 'services: {}' > "$TMP/remote/repo/compose.yaml"
printf '%s\n' 'services: {}' > "$TMP/remote/repo/compose.prod.yaml"
printf '%s\n' 'DATABASE_URL=postgresql://fixture.invalid/product' > "$TMP/remote/shared/.env"
printf '%s\n' 'BACKEND_IMAGE=eldercare-backend:0123456789abcdef0123456789abcdef01234567' \
  'FRONT_IMAGE=eldercare-front:0123456789abcdef0123456789abcdef01234567' \
  > "$TMP/remote/shared/release-images.env"
printf '%s\n' 'EVENT_CLIPS_ENABLED=false' > "$TMP/remote/shared/event-clips-runtime.env"
chmod 600 "$TMP/remote/shared/.env" "$TMP/remote/shared/release-images.env" \
  "$TMP/remote/shared/event-clips-runtime.env"

cat > "$TMP/bin/ssh" <<'EOF'
#!/usr/bin/env sh
set -eu
[ "$#" -eq 2 ] || { printf 'unexpected ssh argument count: %s\n' "$#" >&2; exit 91; }
printf 'target=[%s]\ncommand=[%s]\n' "$1" "$2" >> "$MOCK_SSH_LOG"
[ "${MOCK_SSH_STATUS:-0}" -eq 0 ] || exit "$MOCK_SSH_STATUS"
exec /bin/sh -c "$2"
EOF

cat > "$TMP/bin/sudo" <<'EOF'
#!/usr/bin/env sh
set -eu
[ "${1:-}" = -n ] || exit 92
shift
exec "$@"
EOF

cat > "$TMP/bin/docker" <<'EOF'
#!/usr/bin/env sh
set -eu
{
  printf '%s\n' invocation-start
  for argument do printf 'arg=[%s]\n' "$argument"; done
  printf 'pwd=[%s]\n' "$PWD"
  printf '%s\n' invocation-end
} >> "$MOCK_DOCKER_LOG"
env | sort > "$MOCK_DOCKER_ENV_LOG"
marker=__ROTATE_ADMIN_PASSWORD_EOF__
secret_with_marker=$(cat; printf '%s' "$marker")
secret=${secret_with_marker%"$marker"}
unset secret_with_marker
printf '%s' "$secret" | cksum > "$MOCK_STDIN_CKSUM_LOG"
unset secret
case "${MOCK_DOCKER_MODE:-ok}" in
  ok) exit 0 ;;
  fail) printf '%s\n' 'container reset failed without secret' >&2; exit 47 ;;
  misleading) printf '%s\n' 'ADMIN_PASSWORD_ROTATION_OK action=redacted'; exit 48 ;;
  signal) kill -TERM "$PPID"; exit 143 ;;
  *) exit 93 ;;
esac
EOF
chmod +x "$TMP/bin/ssh" "$TMP/bin/sudo" "$TMP/bin/docker"

assert_contains() {
  case "$1" in *"$2"*) ;; *) printf 'missing expected text: %s\n' "$2" >&2; exit 1;; esac
}
assert_not_contains() {
  case "$1" in *"$2"*) printf 'unexpected text: %s\n' "$2" >&2; exit 1;; *) ;; esac
}
assert_failure() {
  [ "$1" -ne 0 ] || { printf '%s\n' "$2 unexpectedly passed" >&2; exit 1; }
}
assert_no_runtime_residue() {
  [ ! -e "$TMP/remote/shared/deploy.lock" ] || { printf '%s\n' 'deployment lock leaked' >&2; exit 1; }
  residue=$(find "$TMP/remote" "$TMP" -type f \( -name '*admin-password*.tmp' -o -name '*admin-password-secret*' \) -print)
  [ -z "$residue" ] || { printf 'secret temporary file leaked: %s\n' "$residue" >&2; exit 1; }
}
reset_logs() {
  : > "$TMP/ssh.log"
  : > "$TMP/docker.log"
  : > "$TMP/docker-env.log"
  : > "$TMP/stdin.cksum"
}
run_with_fd() {
  PATH="$TMP/bin:$PATH" \
  MOCK_SSH_LOG="$TMP/ssh.log" \
  MOCK_DOCKER_LOG="$TMP/docker.log" \
  MOCK_DOCKER_ENV_LOG="$TMP/docker-env.log" \
  MOCK_STDIN_CKSUM_LOG="$TMP/stdin.cksum" \
  ADMIN_PASSWORD_FD=9 \
    sh "$SCRIPT" --target fixture-host --env-file "$TMP/remote/shared/.env" \
      --email operator@example.test 9< "$1"
}
run_with_stdin() {
  PATH="$TMP/bin:$PATH" \
  MOCK_SSH_LOG="$TMP/ssh.log" \
  MOCK_DOCKER_LOG="$TMP/docker.log" \
  MOCK_DOCKER_ENV_LOG="$TMP/docker-env.log" \
  MOCK_STDIN_CKSUM_LOG="$TMP/stdin.cksum" \
    sh "$SCRIPT" --target fixture-host --env-file "$TMP/remote/shared/.env" \
      --email operator@example.test < "$1"
}

# Build the fixture at runtime so no complete password is stored in source.
FIXTURE_PASSWORD=$(printf '%s%s%s' 'fixture-' 'descriptor-' 'value!$')
printf '%s' "$FIXTURE_PASSWORD" > "$TMP/password.source"
chmod 600 "$TMP/password.source"
EXPECTED_CKSUM=$(printf '%s' "$FIXTURE_PASSWORD" | cksum)
ENV_BEFORE=$(cksum "$TMP/remote/shared/.env")
RELEASE_BEFORE=$(cksum "$TMP/remote/shared/release-images.env")
FEATURE_BEFORE=$(cksum "$TMP/remote/shared/event-clips-runtime.env")
COMPOSE_BEFORE=$(cksum "$TMP/remote/repo/compose.yaml" "$TMP/remote/repo/compose.prod.yaml")

# Happy path: one released backend Compose run receives the password on stdin.
reset_logs
output=$(run_with_fd "$TMP/password.source" 2>&1)
[ "$output" = 'ADMIN_PASSWORD_ROTATION_OK action=redacted' ] || {
  printf 'unexpected success output: %s\n' "$output" >&2; exit 1
}
[ "$(cat "$TMP/stdin.cksum")" = "$EXPECTED_CKSUM" ] || { printf '%s\n' 'password FD was not forwarded exactly' >&2; exit 1; }
ssh_log=$(cat "$TMP/ssh.log")
docker_log=$(cat "$TMP/docker.log")
docker_env=$(cat "$TMP/docker-env.log")
assert_not_contains "$output$ssh_log$docker_log$docker_env" "$FIXTURE_PASSWORD"
[ "$(grep -c -F 'operator@example.test' "$TMP/ssh.log")" -eq 1 ] || { printf '%s\n' 'email was not passed exactly once over SSH' >&2; exit 1; }
[ "$(grep -c -F 'arg=[operator@example.test]' "$TMP/docker.log")" -eq 1 ] || { printf '%s\n' 'email was not passed exactly once to the command' >&2; exit 1; }
for expected in \
  'arg=[compose]' \
  "arg=[${TMP}/remote/shared/.env]" \
  "arg=[${TMP}/remote/shared/release-images.env]" \
  "arg=[${TMP}/remote/shared/event-clips-runtime.env]" \
  'arg=[-f]' \
  'arg=[compose.yaml]' \
  'arg=[compose.prod.yaml]' \
  'arg=[run]' \
  'arg=[--rm]' \
  'arg=[--no-deps]' \
  'arg=[-T]' \
  'arg=[backend]' \
  'arg=[node]' \
  'arg=[dist-tools/prisma/reset-admin-password.js]' \
  'arg=[--email]'
do
  assert_contains "$docker_log" "$expected"
done
assert_contains "$docker_log" "pwd=[${TMP}/remote/repo]"
assert_not_contains "$docker_log" 'ADMIN_PASSWORD='
assert_not_contains "$docker_env" 'ADMIN_PASSWORD='
assert_not_contains "$docker_env" 'ADMIN_PASSWORD_FD='
[ "$ENV_BEFORE" = "$(cksum "$TMP/remote/shared/.env")" ]
[ "$RELEASE_BEFORE" = "$(cksum "$TMP/remote/shared/release-images.env")" ]
[ "$FEATURE_BEFORE" = "$(cksum "$TMP/remote/shared/event-clips-runtime.env")" ]
[ "$COMPOSE_BEFORE" = "$(cksum "$TMP/remote/repo/compose.yaml" "$TMP/remote/repo/compose.prod.yaml")" ]
assert_no_runtime_residue

# ADMIN_PASSWORD_FD defaults to stdin and the optional feature env is omitted only when absent.
mv "$TMP/remote/shared/event-clips-runtime.env" "$TMP/feature.saved"
reset_logs
output=$(run_with_stdin "$TMP/password.source" 2>&1)
[ "$output" = 'ADMIN_PASSWORD_ROTATION_OK action=redacted' ]
[ "$(cat "$TMP/stdin.cksum")" = "$EXPECTED_CKSUM" ]
assert_not_contains "$(cat "$TMP/docker.log")" 'event-clips-runtime.env'
mv "$TMP/feature.saved" "$TMP/remote/shared/event-clips-runtime.env"
assert_no_runtime_residue

# An unreadable descriptor fails locally before SSH.
reset_logs
set +e
output=$(PATH="$TMP/bin:$PATH" MOCK_SSH_LOG="$TMP/ssh.log" ADMIN_PASSWORD_FD=8 \
  sh "$SCRIPT" --target fixture-host --env-file "$TMP/remote/shared/.env" --email operator@example.test 2>&1)
status=$?
set -e
assert_failure "$status" 'bad descriptor'
assert_not_contains "$output" "$FIXTURE_PASSWORD"
[ ! -s "$TMP/ssh.log" ] || { printf '%s\n' 'bad descriptor reached SSH' >&2; exit 1; }

# Empty and newline-bearing input fail before Docker, release the lock, and reveal no input.
: > "$TMP/empty.source"
printf '%s\n%s' 'line-one-fixture' 'line-two-fixture' > "$TMP/newline.source"
for invalid in "$TMP/empty.source" "$TMP/newline.source"; do
  reset_logs
  set +e
  output=$(run_with_fd "$invalid" 2>&1)
  status=$?
  set -e
  assert_failure "$status" 'malformed password input'
  assert_not_contains "$output" 'line-one-fixture'
  assert_not_contains "$output" 'line-two-fixture'
  assert_not_contains "$output" "$FIXTURE_PASSWORD"
  [ ! -s "$TMP/docker.log" ] || { printf '%s\n' 'malformed password reached Docker' >&2; exit 1; }
  assert_no_runtime_residue
done

# Malformed or duplicate inputs fail before SSH.
for arguments in \
  '--target bad;host --env-file /safe/.env --email operator@example.test' \
  '--target fixture-host --env-file relative.env --email operator@example.test' \
  '--target fixture-host --env-file /safe/../shared/.env --email operator@example.test' \
  '--target fixture-host --env-file /safe/.env --email not-an-email' \
  '--target fixture-host --env-file /safe/.env --email first@example.test --email second@example.test' \
  '--target fixture-host --env-file /safe/.env'
do
  reset_logs
  set +e
  # Arguments contain only fixture-safe bytes and deliberately exercise parser rejection.
  # shellcheck disable=SC2086
  output=$(PATH="$TMP/bin:$PATH" MOCK_SSH_LOG="$TMP/ssh.log" ADMIN_PASSWORD_FD=9 \
    sh "$SCRIPT" $arguments 9< "$TMP/password.source" 2>&1)
  status=$?
  set -e
  assert_failure "$status" 'malformed arguments'
  assert_not_contains "$output" "$FIXTURE_PASSWORD"
  [ ! -s "$TMP/ssh.log" ] || { printf '%s\n' 'malformed arguments reached SSH' >&2; exit 1; }
done

# The exact shared deploy lock excludes concurrent deployment/reset work.
mkdir "$TMP/remote/shared/deploy.lock"
reset_logs
set +e
output=$(run_with_fd "$TMP/password.source" 2>&1)
status=$?
set -e
assert_failure "$status" 'held deployment lock'
assert_not_contains "$output" "$FIXTURE_PASSWORD"
[ ! -s "$TMP/docker.log" ] || { printf '%s\n' 'held lock reached Docker' >&2; exit 1; }
[ -d "$TMP/remote/shared/deploy.lock" ] || { printf '%s\n' 'wrapper removed another process lock' >&2; exit 1; }
rmdir "$TMP/remote/shared/deploy.lock"

# A symlinked production input fails closed and does not alter the target.
mv "$TMP/remote/shared/.env" "$TMP/remote/shared/env.real"
ln -s "$TMP/remote/shared/env.real" "$TMP/remote/shared/.env"
reset_logs
set +e
output=$(run_with_fd "$TMP/password.source" 2>&1)
status=$?
set -e
assert_failure "$status" 'symlinked environment'
assert_not_contains "$output" "$FIXTURE_PASSWORD"
[ ! -s "$TMP/docker.log" ] || { printf '%s\n' 'symlinked environment reached Docker' >&2; exit 1; }
[ "$(cat "$TMP/remote/shared/env.real")" = 'DATABASE_URL=postgresql://fixture.invalid/product' ]
rm "$TMP/remote/shared/.env"
mv "$TMP/remote/shared/env.real" "$TMP/remote/shared/.env"
assert_no_runtime_residue

# Container/SSH failures cannot be turned into a misleading success and always clean up.
for mode in fail misleading; do
  reset_logs
  set +e
  output=$(MOCK_DOCKER_MODE=$mode run_with_fd "$TMP/password.source" 2>&1)
  status=$?
  set -e
  assert_failure "$status" "$mode container path"
  [ "$output" = 'ADMIN_PASSWORD_ROTATION_FAILED action=redacted' ] || {
    printf 'failure was not redacted: %s\n' "$output" >&2; exit 1
  }
  assert_not_contains "$output" "$FIXTURE_PASSWORD"
  assert_no_runtime_residue
done

reset_logs
set +e
output=$(MOCK_SSH_STATUS=255 run_with_fd "$TMP/password.source" 2>&1)
status=$?
set -e
assert_failure "$status" 'SSH failure'
[ "$output" = 'ADMIN_PASSWORD_ROTATION_FAILED action=redacted' ]
assert_not_contains "$output" "$FIXTURE_PASSWORD"
[ ! -s "$TMP/docker.log" ]
assert_no_runtime_residue

# A dirty checkout is neither trusted for an image build nor modified; Compose still uses release-images.env.
printf '%s\n' dirty-fixture > "$TMP/remote/repo/.dirty-probe"
dirty_before=$(cksum "$TMP/remote/repo/.dirty-probe")
reset_logs
output=$(run_with_fd "$TMP/password.source" 2>&1)
[ "$output" = 'ADMIN_PASSWORD_ROTATION_OK action=redacted' ]
[ "$dirty_before" = "$(cksum "$TMP/remote/repo/.dirty-probe")" ]
assert_contains "$(cat "$TMP/docker.log")" "arg=[${TMP}/remote/shared/release-images.env]"
rm "$TMP/remote/repo/.dirty-probe"
assert_no_runtime_residue

# Repeated signal-like remote termination never leaves this wrapper lock or secret artifacts.
for attempt in 1 2 3; do
  reset_logs
  set +e
  output=$(MOCK_DOCKER_MODE=signal run_with_fd "$TMP/password.source" 2>&1)
  status=$?
  set -e
  assert_failure "$status" "interruption $attempt"
  assert_not_contains "$output" "$FIXTURE_PASSWORD"
  assert_no_runtime_residue
done

# No fixture password survives the test once the assertions no longer need it.
unset FIXTURE_PASSWORD
rm -f "$TMP/password.source" "$TMP/empty.source" "$TMP/newline.source"
printf '%s\n' 'ROTATE_ADMIN_PASSWORD_FIXTURE_OK'
