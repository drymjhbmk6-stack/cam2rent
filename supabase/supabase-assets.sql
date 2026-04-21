-- ============================================================
-- Anlagenbuchhaltung (assets), Rechnungs-OCR-Erweiterungen,
-- AfA-Vorbereitung, Pre-existing-Bug-Fix
-- Erstellt: 2026-04-21
-- ============================================================
--
-- Voraussetzungen (muessen bereits liefen):
--   - erledigte supabase/supabase-aufgabe17-suppliers.sql (suppliers, purchases, purchase_items)
--   - supabase/buchhaltung-vollausbau.sql (expenses, invoices, credit_notes, ...)
--   - erledigte supabase/supabase-product-units.sql (product_units)
--   - supabase-env-toggle.sql (is_test-Spalten auf bookings, invoices, credit_notes,
--     expenses, email_log, admin_audit_log, stripe_transactions)
--
-- Idempotent (ALTER TABLE ... ADD COLUMN IF NOT EXISTS, CREATE TABLE IF NOT EXISTS).
-- Kann mehrfach ausgefuehrt werden.

-- ────────────────────────────────────────────────────────────────
-- 1. Neue Tabelle: assets (generisches Anlagengut)
-- ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Klassifikation
  kind TEXT NOT NULL CHECK (kind IN (
    'rental_camera',    -- Vermietkamera (verknuepft mit product_units)
    'rental_accessory', -- Vermietbares Zubehoer
    'office_equipment', -- Buero (Laptop, Drucker, Moebel)
    'tool',             -- Werkzeug, Reparaturausruestung
    'other'
  )),

  -- Basisdaten
  name TEXT NOT NULL,
  description TEXT,
  serial_number TEXT,
  manufacturer TEXT,
  model TEXT,

  -- Finanzdaten (Brutto-Werte)
  purchase_price NUMERIC(10, 2) NOT NULL,
  purchase_date DATE NOT NULL,
  supplier_id UUID REFERENCES suppliers(id) ON DELETE SET NULL,
  purchase_id UUID REFERENCES purchases(id) ON DELETE SET NULL,

  -- AfA-Parameter
  useful_life_months INTEGER NOT NULL DEFAULT 36,
  depreciation_method TEXT NOT NULL DEFAULT 'linear'
    CHECK (depreciation_method IN ('linear', 'none', 'immediate')),
  residual_value NUMERIC(10, 2) DEFAULT 0,

  -- Aktueller Zeitwert (wird vom AfA-Cron fortgeschrieben)
  current_value NUMERIC(10, 2) NOT NULL,
  last_depreciation_at DATE,

  -- Verknuepfung zu Vermiet-Einheit (wenn kind = rental_camera|rental_accessory)
  product_id TEXT,
  unit_id UUID REFERENCES product_units(id) ON DELETE SET NULL,

  -- Lifecycle-Status
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'disposed', 'sold', 'lost')),
  disposed_at DATE,
  disposal_proceeds NUMERIC(10, 2),

  -- GoBD / Test-Modus
  is_test BOOLEAN NOT NULL DEFAULT FALSE,

  -- Audit
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_assets_kind      ON assets(kind);
CREATE INDEX IF NOT EXISTS idx_assets_unit      ON assets(unit_id);
CREATE INDEX IF NOT EXISTS idx_assets_purchase  ON assets(purchase_id);
CREATE INDEX IF NOT EXISTS idx_assets_supplier  ON assets(supplier_id);
CREATE INDEX IF NOT EXISTS idx_assets_status    ON assets(status);
CREATE INDEX IF NOT EXISTS idx_assets_is_test   ON assets(is_test) WHERE is_test = TRUE;

-- updated_at-Trigger (set_updated_at existiert bereits aus suppliers-Migration)
DROP TRIGGER IF EXISTS trg_assets_updated_at ON assets;
CREATE TRIGGER trg_assets_updated_at
  BEFORE UPDATE ON assets
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- RLS (alle Routen laufen ueber Service-Role — nur defensiver Default)
ALTER TABLE assets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "assets service role" ON assets;
CREATE POLICY "assets service role"
  ON assets
  FOR ALL
  USING (true)
  WITH CHECK (true);


-- ────────────────────────────────────────────────────────────────
-- 2. Erweiterung: purchases (Rechnungs-OCR-Felder + Netto/Steuer)
-- ────────────────────────────────────────────────────────────────

ALTER TABLE purchases ADD COLUMN IF NOT EXISTS payment_method       TEXT;
ALTER TABLE purchases ADD COLUMN IF NOT EXISTS invoice_storage_path TEXT;
ALTER TABLE purchases ADD COLUMN IF NOT EXISTS invoice_date         DATE;
ALTER TABLE purchases ADD COLUMN IF NOT EXISTS ai_extracted_at      TIMESTAMPTZ;
ALTER TABLE purchases ADD COLUMN IF NOT EXISTS ai_raw_response      JSONB;
ALTER TABLE purchases ADD COLUMN IF NOT EXISTS net_amount           NUMERIC(10, 2);
ALTER TABLE purchases ADD COLUMN IF NOT EXISTS tax_amount           NUMERIC(10, 2);
ALTER TABLE purchases ADD COLUMN IF NOT EXISTS is_test              BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_purchases_is_test ON purchases(is_test) WHERE is_test = TRUE;


-- ────────────────────────────────────────────────────────────────
-- 3. Erweiterung: purchase_items (Klassifikations-Workflow)
-- ────────────────────────────────────────────────────────────────

ALTER TABLE purchase_items ADD COLUMN IF NOT EXISTS asset_id       UUID REFERENCES assets(id) ON DELETE SET NULL;
ALTER TABLE purchase_items ADD COLUMN IF NOT EXISTS expense_id     UUID;  -- FK weiter unten nach expenses-Check
ALTER TABLE purchase_items ADD COLUMN IF NOT EXISTS classification TEXT
  CHECK (classification IN ('asset', 'expense', 'pending', 'ignored'));
ALTER TABLE purchase_items ADD COLUMN IF NOT EXISTS tax_rate       NUMERIC(5, 2);
ALTER TABLE purchase_items ADD COLUMN IF NOT EXISTS net_price      NUMERIC(10, 2);
ALTER TABLE purchase_items ADD COLUMN IF NOT EXISTS ai_suggestion  JSONB;

CREATE INDEX IF NOT EXISTS idx_purchase_items_asset        ON purchase_items(asset_id);
CREATE INDEX IF NOT EXISTS idx_purchase_items_expense      ON purchase_items(expense_id);
CREATE INDEX IF NOT EXISTS idx_purchase_items_classification ON purchase_items(classification);


-- ────────────────────────────────────────────────────────────────
-- 4. Erweiterung: expenses (AfA, Asset-Verknuepfung, erweiterter CHECK)
-- ────────────────────────────────────────────────────────────────

ALTER TABLE expenses ADD COLUMN IF NOT EXISTS asset_id UUID REFERENCES assets(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_expenses_asset ON expenses(asset_id);

-- WICHTIG: Alte CHECK-Constraints auf category ZUERST droppen, damit die
-- folgenden UPDATE-Statements nicht gegen den alten (ggf. abweichenden)
-- Constraint laufen. Fruehere Migrationen hatten ggf. andere Werte-Listen
-- (z.B. 'fees' statt 'stripe_fees').
DO $$
DECLARE
  con_name TEXT;
BEGIN
  FOR con_name IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.expenses'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%category%'
  LOOP
    EXECUTE 'ALTER TABLE expenses DROP CONSTRAINT ' || quote_ident(con_name);
  END LOOP;
END $$;

-- Datenbereinigung jetzt OHNE Constraint (keine Verletzung mehr moeglich):
-- Pre-existing Bug-Fix: 'fees' auf 'stripe_fees' umbiegen.
UPDATE expenses SET category = 'stripe_fees' WHERE category = 'fees';

-- Defensive: alle sonst nicht-erlaubten Kategorien auf 'other' zwingen.
UPDATE expenses
   SET category = 'other'
 WHERE category NOT IN (
   'stripe_fees', 'shipping', 'software', 'hardware', 'marketing',
   'office', 'travel', 'insurance', 'legal',
   'depreciation', 'asset_purchase',
   'other'
 );

-- Neuen CHECK-Constraint anlegen (inkl. 'depreciation' + 'asset_purchase').
ALTER TABLE expenses ADD CONSTRAINT expenses_category_check CHECK (category IN (
  'stripe_fees', 'shipping', 'software', 'hardware', 'marketing',
  'office', 'travel', 'insurance', 'legal',
  'depreciation', 'asset_purchase',
  'other'
));

-- FK purchase_items.expense_id -> expenses.id (jetzt wo beide Tabellen existieren)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'purchase_items_expense_id_fkey'
      AND table_name = 'purchase_items'
  ) THEN
    ALTER TABLE purchase_items
      ADD CONSTRAINT purchase_items_expense_id_fkey
      FOREIGN KEY (expense_id) REFERENCES expenses(id) ON DELETE SET NULL;
  END IF;
END $$;


-- ────────────────────────────────────────────────────────────────
-- 5. Storage-Bucket purchase-invoices (manuell in Supabase-UI anlegen)
-- ────────────────────────────────────────────────────────────────
-- Im Supabase-Dashboard -> Storage -> "New Bucket":
--   Name: purchase-invoices
--   Public: OFF
--   File size limit: 20 MB
--   Allowed MIME types: application/pdf, image/jpeg, image/png, image/webp, image/heic
--
-- Danach untenstehende Policies ausfuehren (kopiert aus Muster contracts).

-- Zugriff nur ueber Service-Role (Admin-Routen). Keine Kunden-Policy.
-- DO-Block idempotent.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='storage' AND table_name='objects') THEN
    -- RLS auf storage.objects ist von Supabase per default aktiv - wir brauchen nur
    -- die implizite Deny-All-Regel. Service-Role umgeht RLS.
    -- Optionaler Admin-Lese-Policy falls wir mal ueber auth lesen wollen:
    -- (aktuell NICHT gesetzt - alle Zugriffe laufen ueber Service-Role Signed URLs)
    NULL;
  END IF;
END $$;


-- ────────────────────────────────────────────────────────────────
-- 6. Default-DATEV-Konten-Erweiterung (optional, nur wenn Setting existiert)
-- ────────────────────────────────────────────────────────────────
-- Wenn admin_settings.datev_expense_accounts existiert, neue Kategorien
-- mit Standard-Konten nachtragen (SKR03/04-aehnlich, kann im Admin-UI
-- angepasst werden).

INSERT INTO admin_settings (key, value)
VALUES ('datev_asset_accounts', jsonb_build_object(
  'rental_camera',    '0420',
  'rental_accessory', '0430',
  'office_equipment', '0400',
  'tool',             '0490',
  'other',            '0490',
  'depreciation',     '4830'
))
ON CONFLICT (key) DO NOTHING;


-- ────────────────────────────────────────────────────────────────
-- Fertig.
-- ────────────────────────────────────────────────────────────────
