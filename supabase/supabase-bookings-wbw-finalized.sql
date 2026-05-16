-- WBW-Finalisierung: finale Wiederbeschaffungswerte werden beim
-- Versandfertigmachen festgelegt, als PDF an den Mieter gemailt und
-- sind laut Mietvertrag ab dann massgeblich fuer Ersatzansprueche.
--
-- Es gibt in diesem Schema keine booking_items-Tabelle — die einzelnen
-- Positionen (Kamera + Zubehoer) werden als JSONB-Array in
-- bookings.wbw_final gehalten: [{ key, name, serial, value }].
--
-- Idempotent.

ALTER TABLE bookings ADD COLUMN IF NOT EXISTS wbw_final JSONB NULL;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS wbw_finalized BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS wbw_finalized_at TIMESTAMPTZ NULL;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS wbw_email_sent_at TIMESTAMPTZ NULL;
