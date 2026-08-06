-- Admin-Performance-Indizes (Adminbereich-Modernisierung Schritt 2, 2026-08-06)
--
-- Schliesst NUR die verifizierten Index-Luecken der heissen Admin-Queries.
-- Es werden bewusst KEINE Duplikate angelegt — vorhandene Indizes decken
-- bookings(created_at/status/user_id/product-period), email_log(sent_at),
-- admin_audit_log(created_at/entity_type/admin_user_id) etc. bereits ab.
--
-- Wichtig: die bestehenden is_test-Indizes sind PARTIELL (WHERE is_test = TRUE)
-- und bedienen den LIVE-Modus (is_test = false) NICHT. Genau dort greifen die
-- neuen Composite-Indizes.
--
-- Rein additiv, idempotent, null Laufzeitrisiko (Indizes beschleunigen nur
-- Reads; ungenutzt = harmlos). Komplett in den Supabase-SQL-Editor kopieren,
-- "Run" klicken. DO-Bloecke skippen automatisch fehlende Tabellen — kein Error.
-- CONCURRENTLY geht in DO-Bloecken nicht (impliziter Transaktion); bei den
-- aktuellen Tabellen-Groessen ist der Lock < 1 s.

-- ─────────────────────────────────────────────────────────────────────
-- 1) bookings(is_test, created_at DESC)
-- Dashboard-Umsatz (heute/Woche/Monat), recent_bookings, activity_feed:
-- .eq('is_test', mode).gte('created_at', …) bzw. .order('created_at', desc).
-- Der partielle is_test-Index deckt den Live-Modus (is_test=false) nicht.
-- ─────────────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema = 'public' AND table_name = 'bookings') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_bookings_is_test_created
             ON bookings (is_test, created_at DESC)';
    EXECUTE 'ANALYZE bookings';
    RAISE NOTICE 'Index idx_bookings_is_test_created angelegt/bestaetigt.';
  ELSE
    RAISE NOTICE 'Tabelle bookings existiert nicht — Index uebersprungen.';
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────
-- 2) bookings(is_test, status)
-- Dashboard pending_shipments/active_bookings/action_queue/upcoming_returns:
-- .eq('is_test', mode).eq/in('status', …). Wieder Live-Modus-Luecke.
-- ─────────────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema = 'public' AND table_name = 'bookings') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_bookings_is_test_status
             ON bookings (is_test, status)';
    EXECUTE 'ANALYZE bookings';
    RAISE NOTICE 'Index idx_bookings_is_test_status angelegt/bestaetigt.';
  ELSE
    RAISE NOTICE 'Tabelle bookings existiert nicht — Index uebersprungen.';
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────
-- 3) profiles(created_at DESC)
-- Kundenliste (/admin/kunden) sortiert IMMER nach created_at DESC; Dashboard
-- new_customers_week filtert .gte('created_at', …). Auf profiles gab es bisher
-- KEINEN created_at-Index.
-- ─────────────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema = 'public' AND table_name = 'profiles') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_profiles_created_at
             ON profiles (created_at DESC)';
    EXECUTE 'ANALYZE profiles';
    RAISE NOTICE 'Index idx_profiles_created_at angelegt/bestaetigt.';
  ELSE
    RAISE NOTICE 'Tabelle profiles existiert nicht — Index uebersprungen.';
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────
-- 4) admin_audit_log(action)
-- Aktivitaetsprotokoll filtert nach action; bisher nur entity_type +
-- admin_user_id indiziert.
-- ─────────────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema = 'public' AND table_name = 'admin_audit_log') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_audit_log_action
             ON admin_audit_log (action)';
    EXECUTE 'ANALYZE admin_audit_log';
    RAISE NOTICE 'Index idx_audit_log_action angelegt/bestaetigt.';
  ELSE
    RAISE NOTICE 'Tabelle admin_audit_log existiert nicht — Index uebersprungen.';
  END IF;
END $$;
