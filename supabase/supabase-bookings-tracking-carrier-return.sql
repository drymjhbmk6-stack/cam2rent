-- Vier neue Tracking-Spalten auf bookings (idempotent).
--
-- 1. tracking_carrier        — Carrier des Hin-Versands (DHL / DPD).
--                              Bisher implizit immer DHL, der Wert kommt aus
--                              ship-booking. Wir persistieren ihn jetzt, damit
--                              die Tracking-URL bei manueller Nummern-Korrektur
--                              im richtigen Format neu gebaut werden kann.
-- 2. return_tracking_number  — Trackingnummer des Rueck-Versands.
-- 3. return_tracking_url     — Auto-generierte Verfolgungs-URL fuer die Retoure.
-- 4. return_tracking_carrier — Carrier des Rueck-Versands (DHL / DPD).
--
-- Keine NOT NULL, keine Defaults — Altbuchungen koennen die Felder leer haben.
-- Code-Fallback: tracking_carrier wird beim Bauen der URL auf DHL geklemmt,
-- wenn er fehlt (Backwards-Compat mit Buchungen vor dieser Migration).

ALTER TABLE bookings ADD COLUMN IF NOT EXISTS tracking_carrier        TEXT;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS return_tracking_number  TEXT;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS return_tracking_url     TEXT;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS return_tracking_carrier TEXT;

-- CHECK-Constraints klemmen auf die zwei tatsaechlich genutzten Carrier.
-- NULL bleibt erlaubt (Altbuchungen, Abholbuchungen).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'bookings_tracking_carrier_check'
  ) THEN
    ALTER TABLE bookings
      ADD CONSTRAINT bookings_tracking_carrier_check
      CHECK (tracking_carrier IS NULL OR tracking_carrier IN ('DHL', 'DPD'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'bookings_return_tracking_carrier_check'
  ) THEN
    ALTER TABLE bookings
      ADD CONSTRAINT bookings_return_tracking_carrier_check
      CHECK (return_tracking_carrier IS NULL OR return_tracking_carrier IN ('DHL', 'DPD'));
  END IF;
END $$;

COMMENT ON COLUMN bookings.tracking_carrier        IS 'Carrier des Hin-Versands (DHL/DPD). Wird beim Versand gesetzt; manuelle Korrektur via /admin/buchungen/[id] regeneriert tracking_url.';
COMMENT ON COLUMN bookings.return_tracking_number  IS 'Trackingnummer des Rueck-Versands (Retoure).';
COMMENT ON COLUMN bookings.return_tracking_url     IS 'Auto-generierte Verfolgungs-URL fuer return_tracking_number.';
COMMENT ON COLUMN bookings.return_tracking_carrier IS 'Carrier des Rueck-Versands (DHL/DPD).';
