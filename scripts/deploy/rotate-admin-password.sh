#!/usr/bin/env sh
set -eu
set +x
HISTFILE=/dev/null
export HISTFILE
umask 077

TARGET=''
ENV_FILE=''
EMAIL=''
PASSWORD_FD=${ADMIN_PASSWORD_FD:-0}
unset ADMIN_PASSWORD_FD

fail() {
  printf '%s\n' "$1" >&2
  exit 1
}

usage() {
  printf '%s\n' 'Usage: rotate-admin-password.sh --target <ssh-target> --env-file <absolute-remote-env> --email <admin-email>' >&2
  exit 2
}

need() {
  command -v "$1" >/dev/null 2>&1 || fail "missing required command: $1"
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --target) [ "$#" -ge 2 ] && [ -z "$TARGET" ] || usage; TARGET=$2; shift 2 ;;
    --env-file) [ "$#" -ge 2 ] && [ -z "$ENV_FILE" ] || usage; ENV_FILE=$2; shift 2 ;;
    --email) [ "$#" -ge 2 ] && [ -z "$EMAIL" ] || usage; EMAIL=$2; shift 2 ;;
    *) usage ;;
  esac
done

case "$TARGET" in ''|-*|*[!A-Za-z0-9._@:-]*) usage ;; esac
case "$ENV_FILE" in
  /*) ;;
  *) fail 'remote production environment path must be absolute' ;;
esac
case "$ENV_FILE" in *[!A-Za-z0-9._/-]*|*/../*|*/..|*/) fail 'remote production environment path is invalid' ;; esac
case "$EMAIL" in *@*.*) ;; *) fail 'ADMIN email is invalid' ;; esac
case "$EMAIL" in *[!A-Za-z0-9._@+-]*|*@*@*|@*|*@) fail 'ADMIN email is invalid' ;; esac
case "$PASSWORD_FD" in ''|*[!0-9]*) fail 'ADMIN_PASSWORD_FD must be a descriptor number' ;; esac
[ -r "/dev/fd/$PASSWORD_FD" ] || fail 'ADMIN password descriptor is not readable'
need ssh

# The remote script is single-quote-free so it can be one protected sh -c
# argument after OpenSSH serializes its command arguments. Validated path/email
# inputs cannot terminate that quoting boundary. The password remains on stdin.
# shellcheck disable=SC2016 # Expansion belongs to the privileged remote shell.
REMOTE_SCRIPT='
set -eu
set +x
HISTFILE=/dev/null
export HISTFILE
umask 077

env_file=$1
email=$2
env_dir=$(dirname "$env_file")
lock_dir=$env_dir/deploy.lock
app_root=$(dirname "$env_dir")
app_dir=$app_root/repo
release_env=$env_dir/release-images.env
feature_env=$env_dir/event-clips-runtime.env
lock_held=0
secret=""
secret_with_marker=""

fail() { printf "%s\n" "$1" >&2; exit 1; }
need() { command -v "$1" >/dev/null 2>&1 || fail "missing required remote command: $1"; }
owner_only_file() {
  file=$1
  label=$2
  [ ! -L "$file" ] || fail "$label must not be a symbolic link"
  [ -f "$file" ] || fail "$label must be a regular file"
  mode=$(stat -c "%a" "$file" 2>/dev/null || stat -f "%Lp" "$file") || fail "unable to inspect $label permissions"
  case "$mode" in 400|600) ;; *) fail "$label permissions must be 400 or 600" ;; esac
}
cleanup() {
  status=$?
  cleanup_status=0
  unset secret secret_with_marker
  if [ "$lock_held" -eq 1 ] && ! rmdir "$lock_dir"; then cleanup_status=1; fi
  trap - 0 HUP INT TERM
  [ "$status" -ne 0 ] && exit "$status"
  exit "$cleanup_status"
}

need cat
need dirname
need docker
need mkdir
need rmdir
need stat
owner_only_file "$env_file" "production environment file"
owner_only_file "$release_env" "release image environment"
[ -d "$app_dir" ] && [ ! -L "$app_dir" ] || fail "application directory must be a regular directory"
[ -f "$app_dir/compose.yaml" ] && [ ! -L "$app_dir/compose.yaml" ] || fail "compose.yaml must be a regular non-symbolic file"
[ -f "$app_dir/compose.prod.yaml" ] && [ ! -L "$app_dir/compose.prod.yaml" ] || fail "compose.prod.yaml must be a regular non-symbolic file"
if [ -e "$feature_env" ] || [ -L "$feature_env" ]; then owner_only_file "$feature_env" "event clip feature environment"; fi

mkdir "$lock_dir" 2>/dev/null || fail "another deployment or ADMIN password rotation is running"
lock_held=1
trap cleanup 0 HUP INT TERM

marker=__ROTATE_ADMIN_PASSWORD_EOF__
secret_with_marker=$(cat; printf "%s" "$marker")
secret=${secret_with_marker%"$marker"}
unset secret_with_marker
[ -n "$secret" ] || fail "ADMIN password descriptor is empty"
newline="
"
case "$secret" in *"$newline"*) fail "ADMIN password must not contain a newline" ;; esac
unset newline marker

cd "$app_dir"
set -- docker compose --env-file "$env_file" --env-file "$release_env"
if [ -f "$feature_env" ]; then set -- "$@" --env-file "$feature_env"; fi
set -- "$@" -f compose.yaml -f compose.prod.yaml run --rm --no-deps -T backend \
  node dist-tools/prisma/reset-admin-password.js --email "$email"
if printf "%s" "$secret" | "$@" >/dev/null 2>&1; then
  command_status=0
else
  command_status=$?
fi
unset secret
[ "$command_status" -eq 0 ] || fail "ADMIN password rotation command failed"
'

REMOTE_COMMAND="sudo -n sh -c '$REMOTE_SCRIPT' admin-password-remote '$ENV_FILE' '$EMAIL'"
# shellcheck disable=SC2029 # The validated remote command is intentionally expanded on the client.
if ssh "$TARGET" "$REMOTE_COMMAND" < "/dev/fd/$PASSWORD_FD" >/dev/null 2>&1; then
  printf '%s\n' 'ADMIN_PASSWORD_ROTATION_OK action=redacted'
else
  printf '%s\n' 'ADMIN_PASSWORD_ROTATION_FAILED action=redacted' >&2
  exit 1
fi
