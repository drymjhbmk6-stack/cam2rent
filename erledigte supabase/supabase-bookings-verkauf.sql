-- ============================================================
-- Verkauf-Feature: Zubehoer/Speicherkarten als Kauf verkaufen
-- ============================================================
-- Ein Verkauf wird als bookings-Row mit booking_type='kauf' modelliert.
-- Damit fliesst er automatisch korrekt in Buchhaltung (EUeR/DATEV),
-- invoices-Anlage und den awaiting_payment+Webhook-Flow ein.
--
-- Die verkauften Artikel liegen in sale_items (NICHT accessory_items),
-- damit Verkaufszeilen die Miet-Ansichten (Verfuegbarkeit, Gantt,
-- Versand) nicht stoeren.
--
-- Idempotent — kann mehrfach ausgefuehrt werden.

ALTER TABLE bookings ADD COLUMN IF NOT EXISTS booking_type TEXT NOT NULL DEFAULT 'miete';
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS sale_items JSONB;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'bookings_booking_type_check'
  ) THEN
    ALTER TABLE bookings
      ADD CONSTRAINT bookings_booking_type_check
      CHECK (booking_type IN ('miete', 'kauf'));
  END IF;
END $$;

-- Partial-Index: nur Verkaufszeilen (selten) — fuer die /admin/verkauf-Liste.
CREATE INDEX IF NOT EXISTS bookings_booking_type_kauf_idx
  ON bookings (created_at DESC)
  WHERE booking_type = 'kauf';
