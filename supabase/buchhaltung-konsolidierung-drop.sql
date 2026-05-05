-- ════════════════════════════════════════════════════════════════════
-- Buchhaltungs-/Inventar-Konsolidierung — Drop alte Tabellen
-- Session A Schritt 4 (NACH erfolgreicher Migration + Verifikation!)
-- ════════════════════════════════════════════════════════════════════
--
-- WARNUNG: Diese Migration ist DESTRUKTIV. Sie loescht die alten
-- Buchhaltungs- und Inventar-Tabellen und benennt assets_neu zu
-- assets um. NUR ausfuehren wenn:
--
--   1. supabase/buchhaltung-konsolidierung.sql gelaufen ist
--   2. npx tsx scripts/migrate-buchhaltung.ts --confirm gelaufen ist
--   3. npx tsx scripts/verify-migration.ts grün ist
--   4. Lennart hat den Verifikations-Output manuell bestaetigt
--   5. EIN BACKUP DER DB EXISTIERT (Supabase Dashboard → Database → Backups)
--
-- Nach diesem Drop:
--   - Sessions B-D koennen die neuen Tabellen voll nutzen
--   - Die alten Routes (/admin/einkauf, /admin/anlagen) wirft 500
--     bis sie in Session E entfernt werden — DAS IST GEWOLLT
-- ════════════════════════════════════════════════════════════════════

-- Sicherheits-Pre-Check: migration_audit muss befuellt sein
DO $$
DECLARE
  audit_count INT;
BEGIN
  SELECT COUNT(*) INTO audit_count FROM migration_audit;
  IF audit_count = 0 THEN
    RAISE EXCEPTION 'migration_audit ist leer. Migration scheint nicht gelaufen zu sein. Drop abgebrochen.';
  END IF;
  RAISE NOTICE 'migration_audit hat % Eintraege — Drop wird ausgefuehrt.', audit_count;
END $$;


-- ────────────────────────────────────────────────────────────────────
-- 1. Alte Tabellen loeschen (Reihenfolge wegen FKs wichtig)
-- ────────────────────────────────────────────────────────────────────

-- purchase_attachments → FK auf purchases
DROP TABLE IF EXISTS purchase_attachments CASCADE;

-- purchase_items → FKs auf purchases + assets + expenses
DROP TABLE IF EXISTS purchase_items CASCADE;

-- expenses → FK auf assets + purchases (purchase_id)
DROP TABLE IF EXISTS expenses CASCADE;

-- purchases → FK auf suppliers
DROP TABLE IF EXISTS purchases CASCADE;

-- accessory_units → FK auf accessories
-- ACHTUNG: bookings.accessory_unit_ids referenziert via UUID[] — kein FK,
-- daher kann Tabelle einfach gedroppt werden, aber die Buchungs-Spalte
-- bleibt mit verwaisten UUIDs. Sessions B-D muessen das beachten.
DROP TABLE IF EXISTS accessory_units CASCADE;

-- product_units → bookings.unit_id ist FK auf product_units
-- Wir muessen den FK zuerst entfernen, dann die Tabelle.
ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_unit_id_fkey;
DROP TABLE IF EXISTS product_units CASCADE;

-- accessories → wird komplett ersetzt durch produkte + inventar_units
-- Vorsicht: bookings.accessories TEXT[] und sets.accessory_items JSONB
-- referenzieren accessories.id als TEXT — keine FKs, aber semantische
-- Verknuepfung. Sessions B-D muessen darauf vorbereitet sein.
DROP TABLE IF EXISTS accessories CASCADE;

-- suppliers → ersetzt durch lieferanten
DROP TABLE IF EXISTS suppliers CASCADE;

-- accessories_with_stats VIEW — referenziert accessory_units, das eben gedroppt wurde
DROP VIEW IF EXISTS accessories_with_stats CASCADE;


-- ────────────────────────────────────────────────────────────────────
-- 2. assets_neu → assets umbenennen
-- ────────────────────────────────────────────────────────────────────

-- Erst die alte assets-Tabelle droppen
DROP TABLE IF EXISTS assets CASCADE;

-- Dann die neue umbenennen
ALTER TABLE assets_neu RENAME TO assets;

-- Indexnamen mit umbenennen
ALTER INDEX IF EXISTS idx_assets_neu_beleg_position RENAME TO idx_assets_beleg_position;
ALTER INDEX IF EXISTS idx_assets_neu_status         RENAME TO idx_assets_status;
ALTER INDEX IF EXISTS idx_assets_neu_methode        RENAME TO idx_assets_methode;
ALTER INDEX IF EXISTS idx_assets_neu_is_test        RENAME TO idx_assets_is_test;

-- Trigger umbenennen
DROP TRIGGER IF EXISTS trg_assets_neu_updated_at ON assets;
CREATE TRIGGER trg_assets_updated_at
  BEFORE UPDATE ON assets
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Policy umbenennen
DROP POLICY IF EXISTS "assets_neu service role" ON assets;
CREATE POLICY "assets service role"
  ON assets FOR ALL USING (true) WITH CHECK (true);

-- FK von beleg_positionen.folgekosten_asset_id auf assets_neu zeigt jetzt
-- automatisch auf die umbenannte Tabelle (Postgres folgt der Referenz).


-- ────────────────────────────────────────────────────────────────────
-- 3. Veraltete admin_settings-Eintraege aufraeumen
-- ────────────────────────────────────────────────────────────────────

DELETE FROM admin_settings WHERE key LIKE 'beleg_counter_%';
DELETE FROM admin_settings WHERE key = 'kontenrahmen_mapping';
DELETE FROM admin_settings WHERE key = 'datev_asset_accounts';
DELETE FROM admin_settings WHERE key = 'datev_expense_accounts';

-- ────────────────────────────────────────────────────────────────────
-- 4. Audit-Eintrag, dass die Konsolidierung abgeschlossen ist
-- ────────────────────────────────────────────────────────────────────

INSERT INTO migration_audit (alte_tabelle, alte_id, neue_tabelle, neue_id, notizen)
VALUES (
  '__SYSTEM__',
  'drop-completed-' || NOW()::TEXT,
  '__SYSTEM__',
  gen_random_uuid(),
  'Buchhaltungs-/Inventar-Konsolidierung abgeschlossen, alte Tabellen gedroppt'
);


-- ════════════════════════════════════════════════════════════════════
-- Fertig. Sessions B-E koennen jetzt die neuen Tabellen voll nutzen.
-- ════════════════════════════════════════════════════════════════════
