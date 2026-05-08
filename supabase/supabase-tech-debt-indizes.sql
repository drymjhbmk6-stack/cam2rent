-- Performance-Indizes nach Reliability-Audit Welle 1 (2026-05-08)
--
-- Defensive Variante: jeder Index in einem DO-Block, der zuerst prueft
-- ob die Tabelle existiert. Funktioniert in jedem Migrations-Stand
-- (alte Buchhaltungs-Welt, neue Welt nach Konsolidierungs-Drop, oder
-- waehrend der Koexistenz-Phase).
--
-- Komplett in den Supabase-SQL-Editor kopieren, "Run" klicken. Skipt
-- automatisch alle Indizes auf Tabellen, die nicht existieren — kein Error.
-- CONCURRENTLY waere besser bei sehr grossen Tabellen, geht aber nicht in
-- DO-Bloecken (impliziter Transaktion). Bei aktuellen Tabellen-Groessen
-- (cam2rent live seit 2026-05-01) ist das unkritisch — Lock < 1 s.

-- ─────────────────────────────────────────────────────────────────────
-- 1) invoices(is_test, invoice_date DESC)
-- Buchhaltung filtert IMMER auf is_test=false und sortiert haeufig nach
-- invoice_date DESC. Composite-Index passt zur Query-Form von
-- /admin/buchhaltung/invoices.
-- ─────────────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema = 'public' AND table_name = 'invoices') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_invoices_test_date
             ON invoices (is_test, invoice_date DESC)';
    EXECUTE 'ANALYZE invoices';
    RAISE NOTICE 'Index idx_invoices_test_date angelegt/bestaetigt.';
  ELSE
    RAISE NOTICE 'Tabelle invoices existiert nicht — Index uebersprungen.';
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────
-- 2) expenses(category) WHERE deleted_at IS NULL
-- ALTE BUCHHALTUNGS-WELT — falls Konsolidierungs-Drop-Schritt 5 schon
-- gelaufen ist, existiert die Tabelle nicht mehr (Ausgaben sind dann in
-- beleg_positionen.klassifizierung='ausgabe'). DO-Block skipt automatisch.
-- ─────────────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema = 'public' AND table_name = 'expenses') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_expenses_category_active
             ON expenses (category)
             WHERE deleted_at IS NULL';
    EXECUTE 'ANALYZE expenses';
    RAISE NOTICE 'Index idx_expenses_category_active angelegt/bestaetigt.';
  ELSE
    RAISE NOTICE 'Tabelle expenses existiert nicht (Konsolidierungs-Drop ist durch) — Index uebersprungen.';
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────
-- 3) inventar_verknuepfung(beleg_position_id)
-- NEUE BUCHHALTUNGS-WELT — Belege-Detail laedt N Verknuepfungen pro
-- Beleg via .in('beleg_position_id', positionIds). Wenn die Tabelle noch
-- nicht existiert (alte Welt), wird der Index uebersprungen.
-- ─────────────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema = 'public' AND table_name = 'inventar_verknuepfung') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_inventar_verknuepfung_beleg_position
             ON inventar_verknuepfung (beleg_position_id)';
    EXECUTE 'ANALYZE inventar_verknuepfung';
    RAISE NOTICE 'Index idx_inventar_verknuepfung_beleg_position angelegt/bestaetigt.';
  ELSE
    RAISE NOTICE 'Tabelle inventar_verknuepfung existiert nicht — Index uebersprungen.';
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────
-- BONUS — fuer die NEUE BUCHHALTUNGS-WELT:
-- 4) beleg_positionen(klassifizierung)
-- EÜR + Ausgaben-Liste filtern auf klassifizierung='ausgabe'/'afa'/'gwg'.
-- Ersetzt funktional den weggefallenen expenses-Index aus Block 2.
-- ─────────────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema = 'public' AND table_name = 'beleg_positionen') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_beleg_positionen_klassifizierung
             ON beleg_positionen (klassifizierung)';
    EXECUTE 'ANALYZE beleg_positionen';
    RAISE NOTICE 'Index idx_beleg_positionen_klassifizierung angelegt/bestaetigt.';
  ELSE
    RAISE NOTICE 'Tabelle beleg_positionen existiert nicht — Index uebersprungen.';
  END IF;
END $$;
