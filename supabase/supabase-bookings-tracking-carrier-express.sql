-- =====================================================================
-- DHL Express als zulaessiger Carrier
-- =====================================================================
-- Hintergrund: Sendcloud kann KEINE DHL-Express-Etiketten erzeugen. Eil-
-- Sendungen werden direkt bei DHL gekauft und die Trackingnummer im
-- Buchungsdetail (/admin/buchungen/[id] -> Versand & Rueckgabe) manuell
-- eingetragen. Der bisherige CHECK erlaubte nur 'DHL' und 'DPD' -> das
-- Speichern von 'DHL Express' waere mit einer Constraint-Verletzung
-- gescheitert.
--
-- Idempotent + additiv: erweitert nur die erlaubte Wertemenge. Bestehende
-- Werte ('DHL', 'DPD', NULL) bleiben unveraendert gueltig, es werden keine
-- Daten angefasst.
--
-- OHNE diese Migration: Alles laeuft wie bisher weiter, nur die Auswahl
-- "DHL Express" im Dropdown scheitert beim Speichern (Fehlermeldung im UI).
-- =====================================================================

DO $$
BEGIN
  -- Hin-Versand
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'bookings_tracking_carrier_check') THEN
    ALTER TABLE bookings DROP CONSTRAINT bookings_tracking_carrier_check;
  END IF;
  ALTER TABLE bookings
    ADD CONSTRAINT bookings_tracking_carrier_check
    CHECK (tracking_carrier IS NULL OR tracking_carrier IN ('DHL', 'DHL Express', 'DPD'));

  -- Rueck-Versand (Retoure)
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'bookings_return_tracking_carrier_check') THEN
    ALTER TABLE bookings DROP CONSTRAINT bookings_return_tracking_carrier_check;
  END IF;
  ALTER TABLE bookings
    ADD CONSTRAINT bookings_return_tracking_carrier_check
    CHECK (return_tracking_carrier IS NULL OR return_tracking_carrier IN ('DHL', 'DHL Express', 'DPD'));
END $$;

COMMENT ON COLUMN bookings.tracking_carrier        IS 'Carrier des Hin-Versands (DHL/DHL Express/DPD). Wird beim Versand gesetzt; manuelle Korrektur via /admin/buchungen/[id] regeneriert tracking_url.';
COMMENT ON COLUMN bookings.return_tracking_carrier IS 'Carrier des Rueck-Versands (DHL/DHL Express/DPD).';

-- Verifikation: muss beide Constraints mit 'DHL Express' zeigen.
SELECT conname, pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conname IN ('bookings_tracking_carrier_check', 'bookings_return_tracking_carrier_check');
