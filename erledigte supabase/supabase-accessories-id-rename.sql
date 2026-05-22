-- ============================================================
-- Migration: ID-Rename fuer accessories ermoeglichen
-- Erstellt: 2026-05-02
--
-- Hintergrund:
-- accessories.id ist Primary Key + wird in vielen FKs referenziert.
-- Damit der Admin die ID umbenennen kann (z.B. um den hässlichen
-- Auto-Slug "befestigungsschraube-mnz3t4va" auf "BEF-SCHR-01" zu
-- aendern), muss die FK-Constraint auf accessory_units ON UPDATE
-- CASCADE setzen.
--
-- JSONB-Felder (bookings.accessory_items, sets.accessory_items) und
-- TEXT[]-Felder (bookings.accessories) werden NICHT automatisch
-- aktualisiert — der Backend-Endpoint blockt deshalb das ID-Rename
-- wenn solche Verwendungen existieren.
--
-- Idempotent.
-- ============================================================

-- FK auf accessory_units um ON UPDATE CASCADE erweitern
ALTER TABLE accessory_units
  DROP CONSTRAINT IF EXISTS accessory_units_accessory_id_fkey;

ALTER TABLE accessory_units
  ADD CONSTRAINT accessory_units_accessory_id_fkey
    FOREIGN KEY (accessory_id) REFERENCES accessories(id)
    ON UPDATE CASCADE ON DELETE CASCADE;
