#!/usr/bin/env sh
set -eu
set +x

APP_DIR=${APP_DIR:-/opt/eldercare-fall-ai/repo}

fail() {
  printf '%s\n' "$1" >&2
  exit 1
}
valid_sha() {
  [ "${#1}" -eq 40 ] && printf '%s' "$1" | grep -Eq '^[0-9a-f]{40}$'
}

[ "$#" -eq 2 ] || fail 'Usage: verify-additive-migrations.sh <current-sha> <candidate-sha>'
CURRENT_SHA=$1
CANDIDATE_SHA=$2
if ! valid_sha "$CURRENT_SHA" || ! valid_sha "$CANDIDATE_SHA"; then
  fail 'migration classifier SHAs must be exactly 40 lowercase hexadecimal characters'
fi
[ -d "$APP_DIR/.git" ] || git -C "$APP_DIR" rev-parse --git-dir >/dev/null 2>&1 || fail 'application Git repository is required for migration classification'
for tool in git grep sed tr; do
  command -v "$tool" >/dev/null 2>&1 || fail "required migration classification tool is missing: $tool"
done

git -C "$APP_DIR" cat-file -e "$CURRENT_SHA^{commit}" 2>/dev/null || fail 'current release commit is unavailable for migration classification'
git -C "$APP_DIR" cat-file -e "$CANDIDATE_SHA^{commit}" 2>/dev/null || fail 'candidate release commit is unavailable for migration classification'
git -C "$APP_DIR" merge-base --is-ancestor "$CURRENT_SHA" "$CANDIDATE_SHA" || fail 'candidate release must descend from the current release'

migration_files=$(git -C "$APP_DIR" diff --diff-filter=A --name-only "$CURRENT_SHA" "$CANDIDATE_SHA" -- 'backend/prisma/migrations/*/migration.sql') || fail 'unable to enumerate candidate migrations'
for migration_file in $migration_files; do
  printf '%s\n' "$migration_file" | grep -Eq '^backend/prisma/migrations/[0-9]{14}_[a-z0-9_]+/migration[.]sql$' || fail 'candidate migration path is invalid'
  normalized=$(git -C "$APP_DIR" show "$CANDIDATE_SHA:$migration_file" | sed 's/--.*$//' | tr '[:lower:]' '[:upper:]') || fail "unable to inspect candidate migration: $migration_file"
  if printf '%s\n' "$normalized" | grep -Eq '(^|[^A-Z_])(DROP[[:space:]]+(TABLE|SCHEMA|DATABASE|TYPE|INDEX)|TRUNCATE([[:space:]]+TABLE)?|DELETE[[:space:]]+FROM|ALTER[[:space:]]+TABLE[^;]*(DROP|RENAME)|ALTER[[:space:]]+TYPE[^;]*RENAME)([^A-Z_]|$)'; then
    fail "candidate migration contains a destructive statement: $migration_file"
  fi
done

printf '%s\n' 'candidate migrations are additive/non-destructive'
