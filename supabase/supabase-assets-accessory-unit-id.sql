-- ============================================================
-- Migration: assets.accessory_unit_id für Zubehör-Exemplare
-- Erstellt: 2026-04-29
-- ============================================================
--
-- Voraussetzung: supabase-accessory-units.sql ist gelaufen
-- (Tabelle accessory_units existiert).
--
-- Hintergrund: assets.unit_id ist hardcoded FK auf product_units(id)
-- und kann daher keine accessory_unit referenzieren. Phase 3A braucht
-- aber genau diese Verknüpfung, damit der Mietvertrag bei Schadensfall
-- (Phase 3B) den Zeitwert pro Exemplar als WBW ziehen kann.
--
-- Lösung: zweite Spalte assets.accessory_unit_id mit FK auf
-- accessory_units(id). Eine assets-Row gehört entweder zu einer
-- product_unit (Kamera) ODER zu einer accessory_unit (Zubehör) -- nicht
-- beiden gleichzeitig. kind='rental_camera' / 'rental_accessory' bleibt
-- als zusätzlicher Marker bestehen.
--
-- Idempotent: ALTER TABLE ... ADD COLUMN IF NOT EXISTS, CREATE INDEX
-- IF NOT EXISTS. Mehrfach laufenlassen unkritisch.
-- ============================================================

ALTER TABLE assets
  ADD COLUMN IF NOT EXISTS accessory_unit_id UUID
  REFERENCES accessory_units(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_assets_accessory_unit
  ON assets(accessory_unit_id)
  WHERE accessory_unit_id IS NOT NULL;

COMMENT ON COLUMN assets.accessory_unit_id IS
  'FK auf accessory_units(id) wenn kind=rental_accessory. Parallel zu unit_id (für product_units/Kameras). Mietvertrag zieht bei Schaden den current_value als WBW.';
