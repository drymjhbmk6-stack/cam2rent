-- ============================================================
-- Migration: damage_reports.accessory_unit_id für Phase 3B
-- Erstellt: 2026-04-29
-- ============================================================
--
-- Voraussetzung: supabase-accessory-units.sql ist gelaufen.
--
-- Ziel: Pro physisch beschädigtes Exemplar (Akku/Stativ/etc.) eine
-- damage_reports-Row, statt nur einer pro Buchung. Macht Schadens-
-- abwicklung rechtssicher (§ 249 BGB) — Admin kann pro Exemplar den
-- Wiederbeschaffungswert dokumentieren und die Kaution anteilig
-- einbehalten.
--
-- Idempotent.
-- ============================================================

ALTER TABLE damage_reports
  ADD COLUMN IF NOT EXISTS accessory_unit_id UUID
  REFERENCES accessory_units(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_damage_reports_accessory_unit
  ON damage_reports(accessory_unit_id)
  WHERE accessory_unit_id IS NOT NULL;

COMMENT ON COLUMN damage_reports.accessory_unit_id IS
  'FK auf accessory_units(id) wenn die Schadensmeldung ein einzelnes Zubehoer-Exemplar betrifft. NULL = generischer Buchungs-Schaden (z.B. Kamera oder pauschal).';
