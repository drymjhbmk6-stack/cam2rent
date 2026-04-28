-- ============================================================
-- Migration: Einzelexemplar-Tracking fuer Zubehoer
-- Erstellt: 2026-04-28
-- ============================================================
--
-- Voraussetzungen (muessen bereits gelaufen sein):
--   - erledigte supabase/supabase-zubehoer.sql              (accessories-Tabelle)
--   - erledigte supabase/supabase-accessory-multi-qty.sql   (accessory_items, replacement_value)
--   - erledigte supabase/supabase-product-units.sql         (Vorbild-Pattern)
--   - erledigte supabase/supabase-aufgabe17-suppliers.sql   (set_updated_at-Trigger)
--
-- Idempotent: ALTER ... IF NOT EXISTS, CREATE ... IF NOT EXISTS, DROP ... IF EXISTS.
-- Kann mehrfach ausgefuehrt werden.
--
-- Ziel: Statt nur accessories.available_qty (Mengenfeld) verfolgt das System
-- jetzt einzelne Exemplare. Wertverfolgung lauft komplett ueber die bestehende
-- assets-Tabelle (kind='rental_accessory') -- KEINE eigene Depreciation-Logik
-- in dieser Tabelle.
-- ============================================================

-- ────────────────────────────────────────────────────────────────
-- 1. Tabelle accessory_units (analog product_units)
-- ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS accessory_units (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  accessory_id TEXT NOT NULL REFERENCES accessories(id) ON DELETE CASCADE,
  exemplar_code TEXT NOT NULL,

  -- Lifecycle-Status (entspricht product_units, plus damaged + lost
  -- fuer Schadensabwicklung)
  status TEXT NOT NULL DEFAULT 'available'
    CHECK (status IN ('available', 'rented', 'maintenance', 'damaged', 'lost', 'retired')),

  -- Operative Daten
  notes TEXT,
  purchased_at DATE,
  retired_at DATE,
  retirement_reason TEXT,

  -- Audit
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Unique Constraint: exemplar_code muss pro accessory_id eindeutig sein
-- (DROP+ADD damit das Skript bei wiederholtem Lauf ohne Fehler durchlaeuft)
ALTER TABLE accessory_units
  DROP CONSTRAINT IF EXISTS unique_exemplar_code_per_accessory;
ALTER TABLE accessory_units
  ADD CONSTRAINT unique_exemplar_code_per_accessory UNIQUE (accessory_id, exemplar_code);

-- Indizes
CREATE INDEX IF NOT EXISTS idx_accessory_units_accessory_id ON accessory_units(accessory_id);
CREATE INDEX IF NOT EXISTS idx_accessory_units_status ON accessory_units(status);
CREATE INDEX IF NOT EXISTS idx_accessory_units_purchased_at ON accessory_units(purchased_at);

-- updated_at-Trigger (set_updated_at existiert aus suppliers-Migration)
DROP TRIGGER IF EXISTS trg_accessory_units_updated_at ON accessory_units;
CREATE TRIGGER trg_accessory_units_updated_at
  BEFORE UPDATE ON accessory_units
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- RLS aktivieren (alle Routen laufen ueber Service-Role -- nur defensiver Default,
-- analog product_units und assets)
ALTER TABLE accessory_units ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "accessory_units service role" ON accessory_units;
CREATE POLICY "accessory_units service role"
  ON accessory_units
  FOR ALL
  USING (true)
  WITH CHECK (true);


-- ────────────────────────────────────────────────────────────────
-- 2. Buchungsverknuepfung: accessory_unit_ids UUID[] auf bookings
-- ────────────────────────────────────────────────────────────────
--
-- Parallel zu bookings.accessory_items (JSONB mit accessory_id+qty).
-- Die Zuordnung welche Unit zu welchem accessory_id gehoert ergibt sich
-- aus accessory_units.accessory_id -- kein zusaetzliches Mapping noetig.
--
-- Das alte bookings.accessories (TEXT[]) bleibt unangetastet.

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS accessory_unit_ids UUID[] NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_bookings_accessory_unit_ids
  ON bookings USING GIN (accessory_unit_ids);


-- ────────────────────────────────────────────────────────────────
-- 3. Migrations-Marker auf accessories
-- ────────────────────────────────────────────────────────────────

ALTER TABLE accessories
  ADD COLUMN IF NOT EXISTS migrated_to_units BOOLEAN NOT NULL DEFAULT FALSE;


-- ────────────────────────────────────────────────────────────────
-- 4. View accessories_with_stats
-- ────────────────────────────────────────────────────────────────
--
-- Liefert pro accessories-Row die Counts pro Status + Kaufdaten-Range.
-- Ersetzt mittelfristig die direkte Nutzung von available_qty in der
-- Verfuegbarkeitspruefung.

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
    COUNT(*)                                        AS total_count,
    MIN(purchased_at)                               AS oldest_purchase_date,
    MAX(purchased_at)                               AS newest_purchase_date
  FROM accessory_units
  GROUP BY accessory_id
) u ON u.accessory_id = a.id;

GRANT SELECT ON accessories_with_stats TO service_role, authenticated, anon;
