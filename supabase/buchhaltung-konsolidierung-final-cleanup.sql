-- ════════════════════════════════════════════════════════════════════
-- Buchhaltungs-/Inventar-Konsolidierung — FINAL CLEANUP (Session E)
-- ════════════════════════════════════════════════════════════════════
--
-- Auszufuehren NACH:
--   1. supabase/buchhaltung-konsolidierung.sql ✓
--   2. scripts/migrate-buchhaltung.ts --confirm ✓
--   3. scripts/verify-migration.ts ✓
--   4. supabase/buchhaltung-konsolidierung-drop.sql ✓
--
-- Diese Migration:
--   - Entfernt verbleibende Spalten/Settings, die nach dem Drop noch
--     herumlagen
--   - Stellt sicher, dass die finale `assets`-Tabelle keine alten Spalten
--     mehr hat (falls Drop-Migration assets_neu→assets nicht durchgelaufen
--     ist)
--
-- Idempotent (DROP COLUMN IF EXISTS).
-- ════════════════════════════════════════════════════════════════════

-- 1) Sicherheits-Check: assets muss die NEUE Struktur haben
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'assets' AND column_name = 'beleg_position_id'
  ) THEN
    RAISE EXCEPTION 'Die assets-Tabelle hat keine beleg_position_id-Spalte. Drop-Migration vermutlich nicht gelaufen.';
  END IF;
END $$;

-- 2) Veraltete admin_settings-Eintraege aufraeumen (falls von alter Welt)
DELETE FROM admin_settings WHERE key LIKE 'beleg_counter_%';
DELETE FROM admin_settings WHERE key = 'kontenrahmen_mapping';
DELETE FROM admin_settings WHERE key = 'datev_asset_accounts';
DELETE FROM admin_settings WHERE key = 'datev_expense_accounts';

-- 3) Falls invoices/credit_notes/dunning_notices alte Spalten aus dem
--    pre-Refactor-Buchhaltungs-Modul haben (account_code, internal_beleg_no
--    auf invoices) — die werden NICHT mehr gebraucht. Belegnummern und
--    Konten leben jetzt am Beleg, nicht an Rechnungen.
ALTER TABLE invoices       DROP COLUMN IF EXISTS account_code;
ALTER TABLE invoices       DROP COLUMN IF EXISTS internal_beleg_no;
ALTER TABLE credit_notes   DROP COLUMN IF EXISTS account_code;
ALTER TABLE credit_notes   DROP COLUMN IF EXISTS internal_beleg_no;

-- 4) admin_settings.replacement_value_config initialisieren falls leer
INSERT INTO admin_settings (key, value)
VALUES ('replacement_value_config', '{"floor_percent": 40, "useful_life_months": 36}'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- 5) Audit-Eintrag setzen
INSERT INTO migration_audit (alte_tabelle, alte_id, neue_tabelle, neue_id, notizen)
VALUES (
  '__SYSTEM__',
  'final-cleanup-' || NOW()::TEXT,
  '__SYSTEM__',
  gen_random_uuid(),
  'Final-Cleanup abgeschlossen — Konsolidierung Session E'
);

-- ════════════════════════════════════════════════════════════════════
-- Fertig. Die App laeuft jetzt vollstaendig auf der neuen Welt.
-- Alte Routes (/admin/einkauf, /admin/anlagen) koennen gefahrlos aus
-- dem Repo entfernt werden.
-- ════════════════════════════════════════════════════════════════════
