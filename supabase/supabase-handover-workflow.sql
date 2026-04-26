-- ────────────────────────────────────────────────────────────────────────────
-- Digitales Übergabeprotokoll
-- ────────────────────────────────────────────────────────────────────────────
--
-- Erweitert die `bookings`-Tabelle um eine JSONB-Spalte `handover_data`, die
-- den kompletten Stand des Übergabeprotokolls speichert: Zustand-Checkboxen,
-- Datum/Ort, Item-Checkliste sowie die zwei Signaturen (Vermieter + Mieter).
--
-- JSONB statt einzelner Spalten, damit das Schema flexibel bleibt und der
-- Migrations-Aufwand klein ist. Indexierung passiert nur auf `completed_at`
-- via Generated Column, das reicht für die Filter-Queries.
--
-- Idempotent — kann mehrfach ausgeführt werden.
-- ────────────────────────────────────────────────────────────────────────────

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS handover_data JSONB;

-- Generated Column für den Zeitpunkt der Fertigstellung — nützlich für
-- Filter ("alle Übergaben am 28.04.") und Reports.
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS handover_completed_at TIMESTAMPTZ
    GENERATED ALWAYS AS ((handover_data ->> 'completedAt')::timestamptz) STORED;

CREATE INDEX IF NOT EXISTS idx_bookings_handover_completed_at
  ON bookings(handover_completed_at)
  WHERE handover_completed_at IS NOT NULL;

COMMENT ON COLUMN bookings.handover_data IS
  'Digitales Übergabeprotokoll als JSONB: { completedAt, location, condition: { tested, noDamage, photosTaken, otherNote }, items: [{name, ok}], signatures: { landlord: {dataUrl, name, signedAt, ip}, renter: {...} } }';
