-- Performance-Indizes nach Reliability-Audit Welle 1 (2026-05-08)
--
-- Drei zusaetzliche Indizes, die durch die parallelen Audit-Agents als
-- Hot-Path-Engpaesse identifiziert wurden. Additiv und idempotent —
-- aenderten KEINE Daten, beschleunigen nur READ-Pfade.
--
-- ─────────────────────────────────────────────────────────────────────
-- WICHTIG: SUPABASE SQL-EDITOR wraps mehrere Statements in eine
-- IMPLICIT TRANSACTION. CREATE INDEX CONCURRENTLY funktioniert dort
-- NICHT — wirft "25001: CREATE INDEX CONCURRENTLY cannot run inside
-- a transaction block".
-- ─────────────────────────────────────────────────────────────────────
--
-- Empfohlene Vorgehensweise — Variante A (alles auf einmal, ohne CONCURRENTLY):
--   Die Tabellen sind aktuell klein (Live seit 2026-05-01). CREATE INDEX
--   ohne CONCURRENTLY lockt die Tabelle nur kurz waehrend der Erstellung
--   (typisch < 1 s bei wenigen tausend Zeilen). Fuer cam2rent unproblematisch.
--   → Diese Datei komplett in den SQL-Editor kopieren und "Run" klicken.
--
-- Variante B — fuer grosse Tabellen oder live-kritische Last:
--   Jedes CREATE INDEX-Statement EINZELN markieren und ausfuehren, mit
--   CONCURRENTLY (siehe auskommentierte Zeilen unten). Pro Statement ein
--   "Run". Postgres erlaubt CONCURRENTLY nur ausserhalb einer Transaktion.

-- ─────────────────────────────────────────────────────────────────────
-- 1) invoices(is_test, invoice_date DESC)
-- Buchhaltung filtert IMMER auf is_test=false und sortiert haeufig nach
-- invoice_date DESC. Composite-Index passt zur Query-Form von
-- /admin/buchhaltung/invoices.
-- ─────────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_invoices_test_date
  ON invoices (is_test, invoice_date DESC);

-- Variante B (einzeln ausfuehren):
-- CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_invoices_test_date
--   ON invoices (is_test, invoice_date DESC);

-- ─────────────────────────────────────────────────────────────────────
-- 2) expenses(category) WHERE deleted_at IS NULL
-- EÜR-Pfad + Ausgaben-Tab filtern auf category. Partial-Index spart Platz,
-- weil weichgeloeschte Eintraege irrelevant sind.
-- ─────────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_expenses_category_active
  ON expenses (category)
  WHERE deleted_at IS NULL;

-- Variante B:
-- CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_expenses_category_active
--   ON expenses (category)
--   WHERE deleted_at IS NULL;

-- ─────────────────────────────────────────────────────────────────────
-- 3) inventar_verknuepfung(beleg_position_id) — NUR wenn neue
-- Buchhaltungs-Welt schon migriert ist (Migrations-Schritt 5, siehe
-- CLAUDE.md "Buchhaltungs-/Inventar-Konsolidierung").
--
-- Pruefen ob Tabelle existiert:
--   SELECT EXISTS (SELECT 1 FROM information_schema.tables
--                  WHERE table_schema='public' AND table_name='inventar_verknuepfung');
-- Wenn TRUE -> nachfolgendes Statement entkommentieren und mit-ausfuehren.
-- Wenn FALSE -> dieses Statement ueberspringen.
-- ─────────────────────────────────────────────────────────────────────

-- CREATE INDEX IF NOT EXISTS idx_inventar_verknuepfung_beleg_position
--   ON inventar_verknuepfung (beleg_position_id);

-- ─────────────────────────────────────────────────────────────────────
-- Statistik-Update damit der Query-Planner die neuen Indizes sofort nutzt.
-- ─────────────────────────────────────────────────────────────────────

ANALYZE invoices;
ANALYZE expenses;
-- ANALYZE inventar_verknuepfung;  -- nur wenn Index 3 oben gelaufen ist
