-- Performance-Indizes nach Reliability-Audit Welle 1 (2026-05-08)
--
-- Drei zusaetzliche Indizes, die durch die parallelen Audit-Agents als
-- Hot-Path-Engpaesse identifiziert wurden. Additiv und idempotent —
-- aenderten KEINE Daten, beschleunigen nur READ-Pfade.
--
-- Manuell im Supabase-SQL-Editor ausfuehren. CONCURRENTLY verhindert
-- Tabellen-Locks waehrend der Erstellung — kann gefahrlos bei laufendem
-- Live-Betrieb laufen. Wichtig: jedes Statement EINZELN ausfuehren
-- (Statements mit CONCURRENTLY duerfen nicht in einer Transaktion stehen).
--
-- Verifikation: Vor + nach mit `EXPLAIN ANALYZE` der jeweiligen Query
-- vergleichen. Bei volumigen Tabellen lohnt's sich, bei kleinen nicht
-- (Postgres entscheidet selbst, was er nutzt).

-- ─────────────────────────────────────────────────────────────────────
-- 1) invoices(is_test, invoice_date DESC)
-- ─────────────────────────────────────────────────────────────────────
-- Buchhaltung filtert IMMER auf is_test=false und sortiert haeufig nach
-- invoice_date DESC. Composite-Index passt zur Query-Form von
-- /admin/buchhaltung/invoices.

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_invoices_test_date
  ON invoices (is_test, invoice_date DESC);

-- ─────────────────────────────────────────────────────────────────────
-- 2) expenses(category) WHERE deleted_at IS NULL
-- ─────────────────────────────────────────────────────────────────────
-- EÜR-Pfad + Ausgaben-Tab filtern auf category. Partial-Index spart Platz,
-- weil weichgeloeschte Eintraege irrelevant sind.

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_expenses_category_active
  ON expenses (category)
  WHERE deleted_at IS NULL;

-- ─────────────────────────────────────────────────────────────────────
-- 3) inventar_verknuepfung(beleg_position_id)  — OPTIONAL
-- ─────────────────────────────────────────────────────────────────────
-- Belege-Detail laedt N Verknuepfungen pro Beleg via
-- .in('beleg_position_id', positionIds). Nur ausfuehren wenn die neue
-- Buchhaltungs-Welt schon migriert ist (CLAUDE.md "Buchhaltungs-/
-- Inventar-Konsolidierung", Migrations-Schritt 5).
--
-- Pruefen ob Tabelle existiert:
--   SELECT EXISTS (SELECT 1 FROM information_schema.tables
--                  WHERE table_schema='public' AND table_name='inventar_verknuepfung');
-- Wenn TRUE -> nachfolgendes Statement ausfuehren, sonst skippen.

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_inventar_verknuepfung_beleg_position
  ON inventar_verknuepfung (beleg_position_id);

-- ─────────────────────────────────────────────────────────────────────
-- Statistik-Update damit der Query-Planner die Indizes sofort nutzt.
-- ─────────────────────────────────────────────────────────────────────

ANALYZE invoices;
ANALYZE expenses;
-- ANALYZE inventar_verknuepfung;  -- nur wenn Index oben gelaufen ist
