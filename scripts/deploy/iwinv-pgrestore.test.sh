#!/usr/bin/env sh
set -eu

TMP=$(mktemp -d)
CONTAINER="iwinv-pgrestore-test-$$"
cleanup() {
  status=$?
  if ! docker rm -f "$CONTAINER" >/dev/null; then
    printf 'failed to remove test container: %s\n' "$CONTAINER" >&2
    [ "$status" -ne 0 ] || status=1
  fi
  if ! rm -rf "$TMP"; then
    printf 'failed to remove test artifacts: %s\n' "$TMP" >&2
    [ "$status" -ne 0 ] || status=1
  fi
  trap - EXIT HUP INT TERM
  exit "$status"
}
trap cleanup EXIT HUP INT TERM

archive=$TMP/source.dump
broken_archive=$TMP/source-truncated.dump

docker run -d --name "$CONTAINER" \
  -e POSTGRES_USER=restore_admin \
  -e POSTGRES_PASSWORD=restore_password \
  -e POSTGRES_DB=restore_target \
  postgres:17-alpine >/dev/null

ready=0
for attempt in 1 2 3 4 5 6 7 8 9 10 11 12; do
  if docker exec "$CONTAINER" pg_isready --username restore_admin --dbname restore_target >/dev/null; then
    ready=1
    break
  fi
  sleep 1
done
[ "$ready" -eq 1 ] || { printf 'PostgreSQL was not ready after %s attempts.\n' "$attempt" >&2; docker logs "$CONTAINER" >&2; exit 1; }

# The dump contains both data and the runtime role's explicit ACL contract.
docker exec "$CONTAINER" sh -ceu '
  createuser --username "$POSTGRES_USER" --no-superuser --no-createdb --no-createrole --no-replication fall_app
  createdb --username "$POSTGRES_USER" restore_source
  psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname restore_source <<SQL
CREATE TABLE sentinel (id integer PRIMARY KEY, value text NOT NULL);
INSERT INTO sentinel VALUES (1, '\''restored sentinel'\'');
CREATE TABLE payload (id integer PRIMARY KEY, value text NOT NULL);
INSERT INTO payload SELECT id, md5(id::text) FROM generate_series(1, 10000) AS id;
REVOKE ALL ON TABLE sentinel FROM PUBLIC;
GRANT SELECT, INSERT ON TABLE sentinel TO fall_app;
SQL
  pg_dump --username "$POSTGRES_USER" --dbname restore_source -Fc --file /tmp/source.dump
'
docker cp "$CONTAINER:/tmp/source.dump" "$archive" >/dev/null

docker exec "$CONTAINER" sh -ceu '
  psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<SQL
CREATE TABLE sentinel (id integer PRIMARY KEY, value text NOT NULL);
INSERT INTO sentinel VALUES (1, '\''old target state'\'');
GRANT SELECT, UPDATE ON TABLE sentinel TO fall_app;
SQL
'

# This is the exact production restore command: it targets POSTGRES_DB and restores ACLs.
docker exec -i "$CONTAINER" sh -ceu 'pg_restore --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" --clean --if-exists --no-owner --exit-on-error --single-transaction' < "$archive"
restored=$(docker exec "$CONTAINER" sh -ceu 'psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" -Atc "SELECT value FROM sentinel WHERE id = 1"')
[ "$restored" = 'restored sentinel' ] || { printf 'successful restore did not replace sentinel: %s\n' "$restored" >&2; exit 1; }
acls=$(docker exec "$CONTAINER" sh -ceu 'psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" -Atc "SELECT has_table_privilege('\''fall_app'\'', '\''public.sentinel'\'', '\''SELECT'\'')::text || '\''/ '\'' || has_table_privilege('\''fall_app'\'', '\''public.sentinel'\'', '\''INSERT'\'')::text || '\''/ '\'' || has_table_privilege('\''fall_app'\'', '\''public.sentinel'\'', '\''UPDATE'\'')::text"')
[ "$acls" = 'true/ true/ false' ] || { printf 'restore did not preserve expected ACLs: %s\n' "$acls" >&2; exit 1; }

# A truncated late archive block makes pg_restore fail after it has started replaying; single-transaction must retain target state.
docker exec "$CONTAINER" sh -ceu '
  psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<SQL
DROP TABLE sentinel;
CREATE TABLE sentinel (id integer PRIMARY KEY, value text NOT NULL);
INSERT INTO sentinel VALUES (1, '\''pre-restore sentinel'\'');
SQL
'
cp "$archive" "$broken_archive"
size=$(wc -c < "$broken_archive")
[ "$size" -gt 64 ] || { printf 'archive unexpectedly too small to truncate\n' >&2; exit 1; }
truncate -s $((size - 32)) "$broken_archive"
set +e
docker exec -i "$CONTAINER" sh -ceu 'pg_restore --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" --clean --if-exists --no-owner --exit-on-error --single-transaction' < "$broken_archive"
restore_status=$?
set -e
[ "$restore_status" -ne 0 ] || { printf 'truncated archive unexpectedly restored\n' >&2; exit 1; }
unchanged=$(docker exec "$CONTAINER" sh -ceu 'psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" -Atc "SELECT value FROM sentinel WHERE id = 1"')
[ "$unchanged" = 'pre-restore sentinel' ] || { printf 'failed restore changed target state: %s\n' "$unchanged" >&2; exit 1; }

printf 'iwinv PostgreSQL restore transaction test passed\n'
