-- ============================================================
-- Schaden pro physischer Kamera-Einheit
-- Erstellt: 2026-05-18
-- ============================================================
--
-- Spiegel zu `damage_reports.accessory_unit_id`: bei Mehrkamera-
-- Buchungen muss der Admin angeben, WELCHE Kamera beschaedigt ist.
-- NULL = generischer Buchungs-/Legacy-Schaden.
--
-- Idempotent.
-- ============================================================

ALTER TABLE damage_reports
  ADD COLUMN IF NOT EXISTS camera_unit_id uuid REFERENCES product_units(id);

CREATE INDEX IF NOT EXISTS idx_damage_reports_camera_unit_id
  ON damage_reports(camera_unit_id)
  WHERE camera_unit_id IS NOT NULL;
