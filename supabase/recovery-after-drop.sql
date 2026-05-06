-- ============================================================
-- Recovery: alte Buchhaltungs-/Inventar-Tabellen wiederherstellen
-- Erstellt: 2026-05-06
-- ============================================================
--
-- Wenn `supabase/buchhaltung-konsolidierung-drop.sql` schon gelaufen ist
-- aber der Admin-Code noch die alten Tabellen liest (Pre-Phase-2-Cleanup),
-- erscheinen leere Listen + "Could not find the table 'public.accessories'".
--
-- Dieses Script legt die alten Tabellen wieder an (mit allen historischen
-- Spalten-Erweiterungen), damit der Mirror-Pfad funktioniert. Daten werden
-- danach durch den /admin/inventar Mirror-Backfill aus migration_audit +
-- inventar_units zurueckgespielt.
--
-- Idempotent: alle Statements sind CREATE TABLE IF NOT EXISTS / ALTER TABLE
-- ADD COLUMN IF NOT EXISTS / DROP CONSTRAINT IF EXISTS + ADD CONSTRAINT.
-- Kann gefahrlos mehrfach ausgefuehrt werden.
--
-- AUSFUEHREN VIA SUPABASE SQL EDITOR — danach in der App auf
-- /admin/inventar den Button "Mirror-Backfill" klicken.
-- ============================================================


-- ────────────────────────────────────────────────────────────────
-- 1. accessories (Zubehoer-Stammdaten + Listing fuer Shop)
-- ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS accessories (
  id               TEXT PRIMARY KEY,
  name             TEXT NOT NULL,
  category         TEXT NOT NULL DEFAULT 'sonstiges',
  description      TEXT,
  pricing_mode     TEXT NOT NULL DEFAULT 'perDay'
                     CHECK (pricing_mode IN ('perDay', 'flat')),
  price            DECIMAL(10,2) NOT NULL DEFAULT 0,
  available_qty    INTEGER NOT NULL DEFAULT 1,
  available        BOOLEAN NOT NULL DEFAULT TRUE,
  image_url        TEXT,
  sort_order       INTEGER NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

-- Spaeter ergaenzte Spalten — alle defensiv:
ALTER TABLE accessories ADD COLUMN IF NOT EXISTS internal               BOOLEAN DEFAULT FALSE;
ALTER TABLE accessories ADD COLUMN IF NOT EXISTS upgrade_group          TEXT DEFAULT NULL;
ALTER TABLE accessories ADD COLUMN IF NOT EXISTS is_upgrade_base        BOOLEAN DEFAULT FALSE;
ALTER TABLE accessories ADD COLUMN IF NOT EXISTS allow_multi_qty        BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE accessories ADD COLUMN IF NOT EXISTS max_qty_per_booking    INT NULL;
ALTER TABLE accessories ADD COLUMN IF NOT EXISTS replacement_value      NUMERIC(10,2) NOT NULL DEFAULT 0;
ALTER TABLE accessories ADD COLUMN IF NOT EXISTS compatible_product_ids TEXT[] DEFAULT '{}';
ALTER TABLE accessories ADD COLUMN IF NOT EXISTS is_bulk                BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE accessories ADD COLUMN IF NOT EXISTS included_parts         TEXT[] DEFAULT '{}';
ALTER TABLE accessories ADD COLUMN IF NOT EXISTS specs                  JSONB DEFAULT '{}'::jsonb;

ALTER TABLE accessories ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "accessories_public_read"   ON accessories;
DROP POLICY IF EXISTS "accessories_service_write" ON accessories;
CREATE POLICY "accessories_public_read"   ON accessories FOR SELECT USING (true);
CREATE POLICY "accessories_service_write" ON accessories FOR ALL    USING (auth.role() = 'service_role');


-- ────────────────────────────────────────────────────────────────
-- 2. product_units (Kamera-Exemplare, FK-Ziel von bookings.unit_id)
-- ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS product_units (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id    TEXT NOT NULL,
  serial_number TEXT NOT NULL,
  label         TEXT,
  status        TEXT DEFAULT 'available'
                  CHECK (status IN ('available','rented','maintenance','retired')),
  notes         TEXT,
  purchased_at  DATE,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_product_units_product_id ON product_units(product_id);

ALTER TABLE product_units DROP CONSTRAINT IF EXISTS unique_serial_per_product;
ALTER TABLE product_units ADD CONSTRAINT unique_serial_per_product UNIQUE (product_id, serial_number);

ALTER TABLE product_units ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "product_units_public_read" ON product_units;
DROP POLICY IF EXISTS "product_units_admin_all"   ON product_units;
CREATE POLICY "product_units_public_read" ON product_units FOR SELECT USING (true);
CREATE POLICY "product_units_admin_all"   ON product_units FOR ALL    USING (true) WITH CHECK (true);

-- bookings.unit_id (FK auf product_units) — bei CASCADE-Drop wurde die
-- Spalte ggf. mitgenommen. Spalte und FK defensiv neu anlegen.
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS unit_id UUID;
CREATE INDEX IF NOT EXISTS idx_bookings_unit_id ON bookings(unit_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'bookings_unit_id_fkey'
      AND table_name = 'bookings'
  ) THEN
    BEGIN
      ALTER TABLE bookings
        ADD CONSTRAINT bookings_unit_id_fkey
        FOREIGN KEY (unit_id) REFERENCES product_units(id) ON DELETE SET NULL;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'bookings.unit_id FK konnte nicht angelegt werden: %', SQLERRM;
    END;
  END IF;
END $$;


-- ────────────────────────────────────────────────────────────────
-- 3. accessory_units (Zubehoer-Exemplare)
-- ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS accessory_units (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  accessory_id    TEXT NOT NULL REFERENCES accessories(id) ON DELETE CASCADE,
  exemplar_code   TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'available'
                    CHECK (status IN ('available','rented','maintenance','damaged','lost','retired')),
  notes           TEXT,
  purchased_at    DATE,
  retired_at      DATE,
  retirement_reason TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE accessory_units DROP CONSTRAINT IF EXISTS unique_exemplar_code_per_accessory;
ALTER TABLE accessory_units ADD CONSTRAINT unique_exemplar_code_per_accessory UNIQUE (accessory_id, exemplar_code);

CREATE INDEX IF NOT EXISTS idx_accessory_units_accessory_id ON accessory_units(accessory_id);
CREATE INDEX IF NOT EXISTS idx_accessory_units_status        ON accessory_units(status);

ALTER TABLE accessory_units ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "accessory_units_public_read" ON accessory_units;
DROP POLICY IF EXISTS "accessory_units_admin_all"   ON accessory_units;
CREATE POLICY "accessory_units_public_read" ON accessory_units FOR SELECT USING (true);
CREATE POLICY "accessory_units_admin_all"   ON accessory_units FOR ALL    USING (true) WITH CHECK (true);

-- bookings.accessory_unit_ids (UUID[]) — nach CASCADE-Drop ggf. weg.
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS accessory_unit_ids UUID[] NOT NULL DEFAULT '{}';
CREATE INDEX IF NOT EXISTS idx_bookings_accessory_unit_ids ON bookings USING GIN (accessory_unit_ids);


-- ────────────────────────────────────────────────────────────────
-- 4. assets (Anlagenverzeichnis) — NICHT NEU ANLEGEN
-- ────────────────────────────────────────────────────────────────
-- Die alte `assets`-Tabelle (mit unit_id, current_value, purchase_price)
-- wurde im Drop-Step durch die neue Konsolidierungs-Variante ersetzt
-- (assets_neu → assets-Rename). Die neue Tabelle hat eine vollkommen
-- andere Struktur (beleg_position_id, aktueller_buchwert, etc.) und ist
-- die finale Wahrheit fuer Anlagen.
--
-- Konsequenz: Mietvertraege koennen die alten Spalten nicht mehr lesen
-- und fallen auf opts.deposit als Wiederbeschaffungswert zurueck — das
-- ist OK fuer den Uebergang. Asset-spezifische Werte koennen spaeter
-- ueber Belege + Anlagen neu gepflegt werden.


-- ────────────────────────────────────────────────────────────────
-- 5. accessories_with_stats VIEW
-- ────────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW accessories_with_stats AS
SELECT
  a.*,
  COALESCE(u.available_count,   0) AS units_available_count,
  COALESCE(u.rented_count,      0) AS units_rented_count,
  COALESCE(u.maintenance_count, 0) AS units_maintenance_count,
  COALESCE(u.damaged_count,     0) AS units_damaged_count,
  COALESCE(u.lost_count,        0) AS units_lost_count,
  COALESCE(u.retired_count,     0) AS units_retired_count,
  COALESCE(u.total_count,       0) AS units_total_count,
  u.oldest_purchase_date,
  u.newest_purchase_date
FROM accessories a
LEFT JOIN (
  SELECT
    accessory_id,
    COUNT(*) FILTER (WHERE status = 'available')   AS available_count,
    COUNT(*) FILTER (WHERE status = 'rented')      AS rented_count,
    COUNT(*) FILTER (WHERE status = 'maintenance') AS maintenance_count,
    COUNT(*) FILTER (WHERE status = 'damaged')     AS damaged_count,
    COUNT(*) FILTER (WHERE status = 'lost')        AS lost_count,
    COUNT(*) FILTER (WHERE status = 'retired')     AS retired_count,
    COUNT(*)                                       AS total_count,
    MIN(purchased_at)                              AS oldest_purchase_date,
    MAX(purchased_at)                              AS newest_purchase_date
  FROM accessory_units
  GROUP BY accessory_id
) u ON u.accessory_id = a.id;


-- ────────────────────────────────────────────────────────────────
-- 6. Datenrestore aus migration_audit + produkte
-- ────────────────────────────────────────────────────────────────

-- 6a) accessories aus produkte (via migration_audit)
INSERT INTO accessories (id, name, category, replacement_value, image_url, available_qty, available, sort_order)
SELECT
  ma.alte_id,
  p.name,
  COALESCE(p.modell, 'sonstiges'),
  COALESCE(p.default_wbw, 0),
  p.bild_url,
  0, -- wird durch syncAccessoryQty / Mirror gefuellt
  TRUE,
  999
FROM migration_audit ma
JOIN produkte p ON p.id = ma.neue_id
WHERE ma.alte_tabelle = 'accessories' AND ma.neue_tabelle = 'produkte'
ON CONFLICT (id) DO NOTHING;

-- 6b) Hinweis: product_units / accessory_units werden NICHT direkt aus
-- inventar_units restored — das macht der TypeScript-Mirror-Backfill, weil
-- er die richtige Status-Mapping-Logik hat (verfuegbar→available, etc.)
-- und auch neue migration_audit-Eintraege erzeugt.

-- ============================================================
-- FERTIG. Naechster Schritt:
--   1. Diese SQL hier ausfuehren (Supabase SQL Editor)
--   2. /admin/inventar oeffnen → Button "Mirror-Backfill" klicken
--   3. /admin/zubehoer pruefen — Listings sollten wieder da sein
--   4. /admin/preise/kameras/[id]/qr-codes pruefen — QR-Codes sollten gehen
-- ============================================================
