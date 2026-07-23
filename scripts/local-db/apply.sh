#!/usr/bin/env bash
# Baut das lokale Schema aus den SQL-Dateien im Repo auf.
# Strategie: Dateien sind idempotent (IF NOT EXISTS) -> in mehreren Durchlaeufen
# anwenden, damit sich Abhaengigkeiten (Reihenfolge) von selbst aufloesen.
#
# Voraussetzung: `npx supabase start` laeuft (DB-Container aktiv).
# Aufruf:  bash scripts/local-db/apply.sh
set -uo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

DB_CONTAINER="$(docker ps --format '{{.Names}}' | grep -E 'supabase_db' | head -1)"
if [ -z "$DB_CONTAINER" ]; then
  echo "FEHLER: Kein Supabase-DB-Container gefunden. Laeuft 'npx supabase start'?"
  exit 1
fi
echo "DB-Container: $DB_CONTAINER"

# Dateien, die NICHT ausgefuehrt werden duerfen (loeschen/leeren/backfill/recovery).
DENY=(
  "supabase-accessory-units-rollback.sql"
  "supabase-accessory-units-data-migration.sql"
  "supabase-belege-bezahl-datum-backfill.sql"
  "cleanup-asset-duplikate-beleg-position.sql"
  "finanzen-reset.sql"
  "go-live-reset.sql"
  "recovery-after-drop.sql"
)

# Basis-Tabellen zuerst (der Rest loest sich per Mehrfach-Durchlauf).
BASE=(
  "erledigte supabase/supabase-setup.sql"
  "erledigte supabase/supabase-preise.sql"
  "erledigte supabase/supabase-session4.sql"
  "erledigte supabase/supabase-verifizierung.sql"
  "erledigte supabase/supabase-zubehoer.sql"
  "erledigte supabase/supabase-sets.sql"
  "erledigte supabase/supabase-gutscheine.sql"
  "erledigte supabase/supabase-product-units.sql"
  "erledigte supabase/supabase-aufgabe17-suppliers.sql"
)

is_denied() {
  local base="$(basename "$1")"
  for d in "${DENY[@]}"; do [ "$base" = "$d" ] && return 0; done
  return 1
}

# Geordnete Dateiliste bauen: BASE zuerst, dann Rest (sortiert), Deny raus.
ORDERED=()
declare -A SEEN
for f in "${BASE[@]}"; do
  [ -f "$f" ] || continue
  is_denied "$f" && continue
  ORDERED+=("$f"); SEEN["$f"]=1
done
while IFS= read -r f; do
  [ -n "${SEEN[$f]:-}" ] && continue
  is_denied "$f" && continue
  ORDERED+=("$f")
done < <(ls -1 "erledigte supabase/"*.sql supabase/*.sql 2>/dev/null | sort)

echo "Anzuwendende Dateien: ${#ORDERED[@]}"

run_file() {
  # gibt Anzahl ERROR-Zeilen dieser Datei zurueck
  local f="$1"
  docker exec -i "$DB_CONTAINER" psql -U postgres -d postgres -v ON_ERROR_STOP=0 \
    < "$f" 2>&1 | grep -c '^ERROR:'
}

PASSES="${1:-4}"
for pass in $(seq 1 "$PASSES"); do
  echo ""
  echo "===== DURCHLAUF $pass / $PASSES ====="
  total_err=0
  : > "/tmp/localdb_pass_${pass}.log"
  for f in "${ORDERED[@]}"; do
    errs="$(docker exec -i "$DB_CONTAINER" psql -U postgres -d postgres -v ON_ERROR_STOP=0 \
      < "$f" 2>&1 | tee -a "/tmp/localdb_pass_${pass}.log" | grep -c '^ERROR:')"
    total_err=$((total_err + errs))
    [ "$errs" -gt 0 ] && printf '  %3s Fehler  %s\n' "$errs" "$(basename "$f")"
  done
  echo "----- Durchlauf $pass: $total_err ERROR-Zeilen gesamt -----"
  if [ "$total_err" -eq 0 ]; then
    echo "Keine Fehler mehr -> Schema vollstaendig."
    break
  fi
done

echo ""
echo "Fertig. Letzte Fehler (falls vorhanden) einzeln pruefen mit:"
echo "  grep '^ERROR:' /tmp/localdb_pass_${PASSES}.log | sort | uniq -c | sort -rn"
