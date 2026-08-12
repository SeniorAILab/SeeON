#!/usr/bin/env sh
set -eu
set +x
HISTFILE=/dev/null
export HISTFILE
umask 077

TARGET=''
ENV_FILE=''
EMAIL=''
PREFLIGHT=0
PASSWORD_FD=${ADMIN_PASSWORD_FD:-0}
unset ADMIN_PASSWORD_FD

# The iwinv Jenkins/Compose service account owns every trusted deployment path.
# It is intentionally fixed here rather than accepted as an operator argument.
TRUSTED_OPERATOR=seniorsailab

fail() {
  printf '%s\n' "$1" >&2
  exit 1
}

usage() {
  printf '%s\n' 'Usage: rotate-admin-password.sh --target <ssh-target> --env-file <absolute-remote-env> --email <admin-email> | --preflight --target <ssh-target> --env-file <absolute-remote-env>' >&2
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
    --preflight) [ "$PREFLIGHT" -eq 0 ] || usage; PREFLIGHT=1; shift ;;
    *) usage ;;
  esac
done

case "$TARGET" in ''|-*|*[!A-Za-z0-9._@:-]*) usage ;; esac
case "$ENV_FILE" in
  /*) ;;
  *) fail 'remote production environment path must be absolute' ;;
esac
case "$ENV_FILE" in *[!A-Za-z0-9._/-]*|*/../*|*/..|*/) fail 'remote production environment path is invalid' ;; esac
if [ "$PREFLIGHT" -eq 0 ]; then
  case "$EMAIL" in *@*.*) ;; *) fail 'ADMIN email is invalid' ;; esac
  case "$EMAIL" in *[!A-Za-z0-9._@+-]*|*@*@*|@*|*@) fail 'ADMIN email is invalid' ;; esac
else
  [ -z "$EMAIL" ] || usage
fi
if [ "$PREFLIGHT" -eq 0 ]; then
  case "$PASSWORD_FD" in ''|*[!0-9]*) fail 'ADMIN_PASSWORD_FD must be a descriptor number' ;; esac
  [ -r "/dev/fd/$PASSWORD_FD" ] || fail 'ADMIN password descriptor is not readable'
fi
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
preflight=$3
env_dir=$(dirname "$env_file")
lock_dir=$env_dir/deploy.lock
app_root=$(dirname "$env_dir")
app_dir=$app_root/repo
release_env=$env_dir/release-images.env
feature_env=$env_dir/event-clips-runtime.env
lock_held=0
secret_base64=""
feature_present=0
trusted_uid=""

fail() { printf "%s\n" "$1" >&2; exit 1; }
need() { command -v "$1" >/dev/null 2>&1 || fail "missing required remote command: $1"; }
mode_is_not_shared_writable() {
  inspected_mode=$1
  inspected_label=$2
  case "$inspected_mode" in
    *[2367][0-7]|*[0-7][2367]) fail "$inspected_label must not be group/world-writable" ;;
  esac
}
trusted_directory() {
  inspected_path=$1
  inspected_label=$2
  [ -d "$inspected_path" ] && [ ! -L "$inspected_path" ] || fail "$inspected_label must be a regular directory"
  canonical_path=$(CDPATH="" cd -- "$inspected_path" 2>/dev/null && pwd -P) || fail "unable to canonicalize $inspected_label"
  [ "$canonical_path" = "$inspected_path" ] || fail "$inspected_label path must be canonical"
  inspected_owner=$(stat -c "%u" "$inspected_path" 2>/dev/null || stat -f "%u" "$inspected_path") || fail "unable to inspect $inspected_label owner"
  [ "$inspected_owner" = "$trusted_uid" ] || fail "$inspected_label must be owned by the privileged operator"
  inspected_mode=$(stat -c "%a" "$inspected_path" 2>/dev/null || stat -f "%Lp" "$inspected_path") || fail "unable to inspect $inspected_label permissions"
  mode_is_not_shared_writable "$inspected_mode" "$inspected_label"
}
trusted_file() {
  inspected_path=$1
  inspected_label=$2
  owner_only=$3
  [ ! -L "$inspected_path" ] || fail "$inspected_label must not be a symbolic link"
  [ -f "$inspected_path" ] || fail "$inspected_label must be a regular file"
  inspected_owner=$(stat -c "%u" "$inspected_path" 2>/dev/null || stat -f "%u" "$inspected_path") || fail "unable to inspect $inspected_label owner"
  [ "$inspected_owner" = "$trusted_uid" ] || fail "$inspected_label must be owned by the privileged operator"
  inspected_mode=$(stat -c "%a" "$inspected_path" 2>/dev/null || stat -f "%Lp" "$inspected_path") || fail "unable to inspect $inspected_label permissions"
  mode_is_not_shared_writable "$inspected_mode" "$inspected_label"
  if [ "$owner_only" -eq 1 ]; then
    case "$inspected_mode" in 400|600) ;; *) fail "$inspected_label permissions must be 400 or 600" ;; esac
  fi
}
validate_inputs() {
  trusted_directory "$app_root" "application root directory"
  trusted_directory "$env_dir" "production environment directory"
  trusted_directory "$app_dir" "application directory"
  trusted_file "$env_file" "production environment file" 1
  trusted_file "$release_env" "release image environment" 1
  trusted_file "$app_dir/compose.yaml" "compose.yaml" 0
  trusted_file "$app_dir/compose.prod.yaml" "compose.prod.yaml" 0
  feature_present=0
  if [ -e "$feature_env" ] || [ -L "$feature_env" ]; then
    trusted_file "$feature_env" "event clip feature environment" 1
    feature_present=1
  fi
}
cleanup() {
  status=$?
  cleanup_status=0
  unset secret_base64 command_output
  if [ "$lock_held" -eq 1 ] && ! rmdir "$lock_dir"; then cleanup_status=1; fi
  trap - 0 HUP INT TERM
  [ "$status" -ne 0 ] && exit "$status"
  exit "$cleanup_status"
}

need dirname
need id
need stat
case "$preflight" in 0|1) ;; *) fail "invalid preflight mode" ;; esac
trusted_uid=$(id -u)
trap "exit 129" HUP
trap "exit 130" INT
trap "exit 143" TERM
validate_inputs
if [ "$preflight" -eq 1 ]; then
  printf "%s\n" "ADMIN_PASSWORD_ROTATION_PREFLIGHT_OK"
  exit 0
fi

need base64
need docker
need head
need mkdir
need rmdir
need tr
need wc
secret_base64=$(head -c 513 | base64)
secret_bytes=$(printf "%s" "$secret_base64" | base64 -d | wc -c | tr -d " ")
[ "$secret_bytes" -le 512 ] || fail "ADMIN password input is too large"
[ "$secret_bytes" -gt 0 ] || fail "ADMIN password descriptor is empty"
non_nul_bytes=$(printf "%s" "$secret_base64" | base64 -d | LC_ALL=C tr -d "\000" | wc -c | tr -d " ")
[ "$non_nul_bytes" -eq "$secret_bytes" ] || fail "ADMIN password must not contain NUL"
non_newline_bytes=$(printf "%s" "$secret_base64" | base64 -d | LC_ALL=C tr -d "\n" | wc -c | tr -d " ")
[ "$non_newline_bytes" -eq "$secret_bytes" ] || fail "ADMIN password must not contain a newline"
unset non_newline_bytes non_nul_bytes secret_bytes

mkdir "$lock_dir" 2>/dev/null || fail "another deployment or ADMIN password rotation is running"
lock_held=1
trap cleanup 0

cd "$app_dir"
set -- docker compose --env-file "$env_file" --env-file "$release_env"
if [ "$feature_present" -eq 1 ]; then set -- "$@" --env-file "$feature_env"; fi
set -- "$@" -f compose.yaml -f compose.prod.yaml run --rm --no-deps -T backend \
  node dist-tools/prisma/reset-admin-password.js --email "$email"
validate_inputs
if command_output=$(printf "%s" "$secret_base64" | base64 -d | ADMIN_ROTATION_REMOTE_PID=$$ "$@" 2>/dev/null); then
  command_status=0
else
  command_status=$?
fi
unset secret_base64
if [ "$command_status" -eq 2 ] && [ "$command_output" = "ADMIN_PASSWORD_RESET_POST_COMMIT_DISCONNECT" ]; then
  printf "%s\n" "ADMIN_PASSWORD_ROTATION_POST_COMMIT_DISCONNECT"
  exit 2
fi
[ "$command_status" -eq 0 ] || fail "ADMIN password rotation command failed"
case "$command_output" in
  "ADMIN_PASSWORD_RESET_RESULT action=update") action=update ;;
  "ADMIN_PASSWORD_RESET_RESULT action=noop") action=noop ;;
  *) fail "ADMIN password rotation command returned an invalid result" ;;
esac
unset command_output
printf "%s\n" "ADMIN_PASSWORD_ROTATION_RESULT action=$action"
'

REMOTE_COMMAND="sudo -n -u $TRUSTED_OPERATOR sh -c '$REMOTE_SCRIPT' admin-password-remote '$ENV_FILE' '$EMAIL' '$PREFLIGHT'"
# shellcheck disable=SC2029 # The validated remote command is intentionally expanded on the client.
if [ "$PREFLIGHT" -eq 1 ]; then
  remote_output=$(ssh "$TARGET" "$REMOTE_COMMAND" 2>/dev/null) || {
    printf '%s\n' 'ADMIN_PASSWORD_ROTATION_PREFLIGHT_FAILED action=redacted' >&2
    exit 1
  }
  [ "$remote_output" = 'ADMIN_PASSWORD_ROTATION_PREFLIGHT_OK' ] || {
    printf '%s\n' 'ADMIN_PASSWORD_ROTATION_PREFLIGHT_FAILED action=redacted' >&2
    exit 1
  }
  printf '%s\n' 'ADMIN_PASSWORD_ROTATION_PREFLIGHT_OK'
  exit 0
fi
# shellcheck disable=SC2029 # The validated remote command is intentionally expanded on the client.
if remote_output=$(ssh "$TARGET" "$REMOTE_COMMAND" < "/dev/fd/$PASSWORD_FD" 2>/dev/null); then
  case "$remote_output" in
    'ADMIN_PASSWORD_ROTATION_RESULT action=update') action=update ;;
    'ADMIN_PASSWORD_ROTATION_RESULT action=noop') action=noop ;;
    *) printf '%s\n' 'ADMIN_PASSWORD_ROTATION_FAILED action=redacted' >&2; exit 1 ;;
  esac
  printf '%s\n' "ADMIN_PASSWORD_ROTATION_OK action=$action"
else
  status=$?
  if [ "$status" -eq 2 ] && [ "$remote_output" = 'ADMIN_PASSWORD_ROTATION_POST_COMMIT_DISCONNECT' ]; then
    printf '%s\n' 'ADMIN_PASSWORD_ROTATION_FAILED state=post-commit-disconnect' >&2
    exit 2
  fi
  printf '%s\n' 'ADMIN_PASSWORD_ROTATION_FAILED action=redacted' >&2
  exit 1
fi
