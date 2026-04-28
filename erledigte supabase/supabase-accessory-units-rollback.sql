-- ============================================================
-- ROLLBACK: Einzelexemplar-Tracking fuer Zubehoer rueckgaengig machen
-- Erstellt: 2026-04-28
-- ============================================================
--
-- ACHTUNG: Loescht alle accessory_units-Daten, die accessory_unit_ids
-- auf bookings und die Zuweisungs-RPC. Schadensabwicklungs-Historie
-- (Status damaged/lost/Zustandsnotizen) geht verloren.
--
-- Nur ausfuehren, wenn die Migration komplett zurueckgerollt werden soll.
--
-- Reihenfolge wichtig:
--   1. RPC vor Tabelle entfernen, sonst hangen Function-Definitions
--   2. View vor Tabelle entfernen, sonst Dependency-Error
--   3. Spalte auf bookings vor Tabelle entfernen, sonst FK-Constraints
--   4. Tabelle entfernen
--   5. Marker auf accessories entfernen
-- ============================================================

-- 1. RPC entfernen
DROP FUNCTION IF EXISTS assign_free_accessory_units(text, integer, date, date, text);

-- 2. View entfernen
DROP VIEW IF EXISTS accessories_with_stats;

-- 3. Spalte auf bookings entfernen (mitsamt GIN-Index)
DROP INDEX IF EXISTS idx_bookings_accessory_unit_ids;
ALTER TABLE bookings DROP COLUMN IF EXISTS accessory_unit_ids;

-- 4. Tabelle entfernen (CASCADE entfernt auch Indizes/Trigger/Policies)
DROP TABLE IF EXISTS accessory_units CASCADE;

-- 5. Marker auf accessories zuruecksetzen
ALTER TABLE accessories DROP COLUMN IF EXISTS migrated_to_units;
