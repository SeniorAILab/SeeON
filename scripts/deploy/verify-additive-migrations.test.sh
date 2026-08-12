#!/usr/bin/env sh
set -eu

REPO_ROOT=$(CDPATH='' cd -- "$(dirname "$0")/../.." && pwd)
SCRIPT=$REPO_ROOT/scripts/deploy/verify-additive-migrations.sh
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT HUP INT TERM
REPO=$TMP/repo
mkdir -p "$REPO/backend/prisma/migrations/20260812000000_additive"
git -C "$REPO" init -q
git -C "$REPO" config user.email test@example.invalid
git -C "$REPO" config user.name test
printf '%s\n' 'CREATE TABLE existing (id text PRIMARY KEY);' > "$REPO/backend/prisma/migrations/20260811000000_existing.sql"
git -C "$REPO" add .
git -C "$REPO" commit -qm base
BASE=$(git -C "$REPO" rev-parse HEAD)
printf '%s\n' 'ALTER TABLE existing ADD COLUMN note text;' > "$REPO/backend/prisma/migrations/20260812000000_additive/migration.sql"
git -C "$REPO" add .
git -C "$REPO" commit -qm additive
ADDITIVE=$(git -C "$REPO" rev-parse HEAD)

output=$(APP_DIR="$REPO" sh "$SCRIPT" "$BASE" "$ADDITIVE")
case "$output" in *'candidate migrations are additive/non-destructive'*) ;; *) printf '%s\n' "$output" >&2; exit 1;; esac

for statement in \
  'DROP TABLE existing;' \
  'TRUNCATE TABLE existing;' \
  'DELETE FROM existing;' \
  'ALTER TABLE existing DROP COLUMN note;' \
  'ALTER TABLE existing RENAME COLUMN note TO old_note;'
do
  mkdir -p "$REPO/backend/prisma/migrations/20260813000000_destructive"
  printf '%s\n' "$statement" > "$REPO/backend/prisma/migrations/20260813000000_destructive/migration.sql"
  git -C "$REPO" add .
  git -C "$REPO" commit -qm destructive
  candidate=$(git -C "$REPO" rev-parse HEAD)
  set +e
  output=$(APP_DIR="$REPO" sh "$SCRIPT" "$ADDITIVE" "$candidate" 2>&1); status=$?
  set -e
  [ "$status" -ne 0 ] || { printf 'destructive migration passed: %s\n' "$statement" >&2; exit 1; }
  case "$output" in *'candidate migration contains a destructive statement'*) ;; *) printf '%s\n' "$output" >&2; exit 1;; esac
  git -C "$REPO" checkout -q --detach "$ADDITIVE"
done

# Historical destructive text before the current release is out of scope; only newly added migrations are classified.
printf '%s\n' '-- DROP TABLE documentation only' >> "$REPO/backend/prisma/migrations/20260811000000_existing.sql"
git -C "$REPO" add .
git -C "$REPO" commit -qm historical-comment-change
COMMENT_ONLY=$(git -C "$REPO" rev-parse HEAD)
APP_DIR="$REPO" sh "$SCRIPT" "$ADDITIVE" "$COMMENT_ONLY" >/dev/null

printf '%s\n' 'additive migration classifier tests passed'
