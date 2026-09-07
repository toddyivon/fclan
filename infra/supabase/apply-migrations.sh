#!/usr/bin/env bash
# Applies the app's SQL migrations (../../supabase/migrations) to the
# self-hosted stack, with supabase-CLI-compatible tracking so a future
# `supabase db push --db-url ...` sees them as already applied.
#
# Run AFTER the stack is healthy (the auth service creates the auth schema
# on first boot, and migration 003 depends on auth.users).
#
# Usage: ./apply-migrations.sh
set -euo pipefail
cd "$(dirname "$0")"

psql_exec() {
  docker compose exec -T db psql -U postgres -d postgres -v ON_ERROR_STOP=1 "$@"
}

echo "==> Waiting for the auth schema (gotrue first boot)..."
for i in $(seq 1 30); do
  ok=$(psql_exec -tAc "SELECT 1 FROM information_schema.tables WHERE table_schema='auth' AND table_name='users'" || true)
  [ "$ok" = "1" ] && break
  sleep 2
done
[ "${ok:-}" = "1" ] || { echo "auth.users not found — is the auth container healthy?"; exit 1; }

echo "==> Ensuring realtime publication exists..."
psql_exec -c "DO \$\$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname='supabase_realtime') THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;
END \$\$;"

echo "==> Ensuring migration tracking table..."
psql_exec -c "CREATE SCHEMA IF NOT EXISTS supabase_migrations;
CREATE TABLE IF NOT EXISTS supabase_migrations.schema_migrations (
  version text PRIMARY KEY, statements text[], name text);"

for f in ../../supabase/migrations/*.sql; do
  base=$(basename "$f" .sql)
  version=${base%%_*}
  name=${base#*_}
  applied=$(psql_exec -tAc "SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='${version}'" || true)
  if [ "$applied" = "1" ]; then
    echo "==> Skipping ${version} (${name}) — already applied"
    continue
  fi
  echo "==> Applying ${version} (${name})..."
  psql_exec < "$f"
  psql_exec -c "INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('${version}', '${name}')"
done

echo "==> All migrations applied."
