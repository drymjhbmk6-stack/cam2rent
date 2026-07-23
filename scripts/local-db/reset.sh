#!/usr/bin/env bash
# Baut die LOKALE Datenbank komplett neu auf (Schema + Rechte + Testdaten).
# Nutzt den gesicherten Abzug supabase/local-schema.sql (schnell), Fallback:
# scripts/local-db/apply.sh (aus den einzelnen SQL-Dateien).
#
# Aufruf:  bash scripts/local-db/reset.sh
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"; cd "$ROOT"

DB="$(docker ps --format '{{.Names}}' | grep -E 'supabase_db' | head -1)"
if [ -z "$DB" ]; then echo "FEHLER: 'npx supabase start' zuerst ausfuehren."; exit 1; fi
echo "DB-Container: $DB"

echo "1/4  public-Schema leeren..."
docker exec -i "$DB" psql -U postgres -d postgres -q \
  -c "DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;" >/dev/null

echo "2/4  Schema laden (supabase/local-schema.sql)..."
if [ -f supabase/local-schema.sql ]; then
  docker exec -i "$DB" psql -U postgres -d postgres -q -v ON_ERROR_STOP=0 \
    < supabase/local-schema.sql 2>&1 | grep -c '^ERROR:' | xargs -I{} echo "   ({} ERROR-Zeilen, meist unkritisch)"
else
  echo "   Kein Abzug gefunden -> baue aus SQL-Dateien (dauert laenger)..."
  bash scripts/local-db/apply.sh 4
fi

echo "3/4  Rechte fuer Supabase-Rollen vergeben..."
docker exec -i "$DB" psql -U postgres -d postgres -q >/dev/null <<'SQL'
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;
SQL

echo "4/4  Testdaten anlegen..."
node --env-file=.env.local scripts/local-db/seed.mjs 2>&1 | grep -vE "Assertion failed|async\.c"

echo ""
echo "Fertig. Lokale DB neu aufgebaut."
