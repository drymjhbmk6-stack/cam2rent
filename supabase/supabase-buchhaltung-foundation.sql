-- ============================================================================
-- Buchhaltungs-Fundament: account_code + internal_beleg_no
-- ============================================================================
-- Etappe A1+A2 des Buchhaltungs-Refactors.
--
-- Wirkung HEUTE: nichts. Beide Spalten sind nullable, alle bestehenden
-- Datensaetze bleiben unangetastet, alle bestehenden Queries laufen weiter.
--
-- Wirkung MORGEN: Sobald die App auf Regelbesteuerung umstellt oder ein
-- Belegjournal gebraucht wird, ist das Fundament da:
--   - account_code: SKR03-Konto pro Beleg (wird ueber kontenrahmen_mapping
--     in admin_settings aufgeloest)
--   - internal_beleg_no: lueckenlose interne Belegnummer pro Geschaeftsjahr
--     (Format: BELEG-YYYY-NNNNN, im Test-Modus TEST-BELEG-YYYY-NNNNN)
--
-- Idempotent: kann mehrfach ausgefuehrt werden, ALTER TABLE ... ADD COLUMN
-- IF NOT EXISTS ist seit Postgres 9.6 vorhanden.
-- ============================================================================

-- 1) Spalten ergaenzen — alle nullable, kein Default-Backfill noetig
ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS account_code TEXT,
  ADD COLUMN IF NOT EXISTS internal_beleg_no TEXT;

ALTER TABLE expenses
  ADD COLUMN IF NOT EXISTS account_code TEXT,
  ADD COLUMN IF NOT EXISTS internal_beleg_no TEXT;

ALTER TABLE credit_notes
  ADD COLUMN IF NOT EXISTS account_code TEXT,
  ADD COLUMN IF NOT EXISTS internal_beleg_no TEXT;

ALTER TABLE purchases
  ADD COLUMN IF NOT EXISTS internal_beleg_no TEXT;

ALTER TABLE purchase_items
  ADD COLUMN IF NOT EXISTS account_code TEXT;

ALTER TABLE assets
  ADD COLUMN IF NOT EXISTS account_code TEXT;

-- 2) Indizes fuer Belegnummer-Lookup (lueckenlose Sequenz, Audit)
CREATE INDEX IF NOT EXISTS idx_invoices_internal_beleg_no
  ON invoices(internal_beleg_no) WHERE internal_beleg_no IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_expenses_internal_beleg_no
  ON expenses(internal_beleg_no) WHERE internal_beleg_no IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_credit_notes_internal_beleg_no
  ON credit_notes(internal_beleg_no) WHERE internal_beleg_no IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_purchases_internal_beleg_no
  ON purchases(internal_beleg_no) WHERE internal_beleg_no IS NOT NULL;

-- 3) Indizes fuer account_code (spaetere Konto-Aggregationen)
CREATE INDEX IF NOT EXISTS idx_invoices_account_code
  ON invoices(account_code) WHERE account_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_expenses_account_code
  ON expenses(account_code) WHERE account_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_purchase_items_account_code
  ON purchase_items(account_code) WHERE account_code IS NOT NULL;

-- 4) Period-Lock-Setting initialisieren (leeres Objekt) falls nicht vorhanden.
--    Format: { "2026-04": { "locked_at": "2026-05-03T10:00:00Z", "locked_by": "owner" } }
INSERT INTO admin_settings (key, value)
VALUES ('period_locks', '{}'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- 5) Kontenrahmen-Mapping initialisieren mit cam2rent-Defaults (SKR03).
--    Wird in einer separaten App-Lib (lib/accounting/kontenrahmen.ts) konsumiert.
--    Kommentare in den Werten erklaeren die Zuordnung.
INSERT INTO admin_settings (key, value)
VALUES ('kontenrahmen_mapping', jsonb_build_object(
  'erloese', jsonb_build_object(
    'mietumsatz', '8400',          -- Erloese 19% USt (im Klein-Modus: 8200)
    'mietumsatz_kleinunternehmer', '8200',
    'versand_an_kunden', '8400',
    'haftungsschutz', '8400'
  ),
  'aufwand', jsonb_build_object(
    'wareneingang', '3400',
    'reparaturen', '4805',
    'porto_versand', '4910',
    'stripe_fees', '4970',
    'software', '4860',
    'marketing', '4980',
    'office', '4950',
    'travel', '4673',
    'insurance', '4360',
    'legal', '4950',
    'depreciation', '4830',        -- Abschreibungen
    'asset_purchase', '4855',      -- GWG-Sofortabzug
    'other', '4900'
  ),
  'bestand', jsonb_build_object(
    'rental_camera', '0420',
    'rental_accessory', '0490',
    'office_equipment', '0410',
    'vehicle', '0320',
    'software_asset', '0125'
  ),
  'forderungen', '1400',
  'verbindlichkeiten', '3300',
  'stripe_konto', '1361',          -- Bank: Stripe-Verrechnungskonto
  'kasse', '1000',
  'bank_giro', '1200',
  'ust_19', '1776',                -- USt-Konto Regelbesteuerung
  'vorsteuer_19', '1576'
))
ON CONFLICT (key) DO NOTHING;
