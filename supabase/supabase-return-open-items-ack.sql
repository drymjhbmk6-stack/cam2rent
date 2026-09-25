-- Rueckmeldung des Kunden auf die Nachsende-Mail (idempotent, additiv).
-- Der Kunde klickt in der Mail „Gelesen — ich schicke es zurueck" oder
-- „Habe ich nicht mehr — bitte in Rechnung stellen" und bestaetigt auf
-- /rueckgabe/bestaetigen. Ohne diese Migration landet die Rueckmeldung nur
-- als Notiz-Zeile an der Position (+ Admin-Benachrichtigung).

ALTER TABLE booking_return_open_items
  ADD COLUMN IF NOT EXISTS customer_ack_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS customer_ack_choice TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'booking_return_open_items_ack_choice_check'
  ) THEN
    ALTER TABLE booking_return_open_items
      ADD CONSTRAINT booking_return_open_items_ack_choice_check
      CHECK (customer_ack_choice IS NULL OR customer_ack_choice IN ('will_return', 'please_bill'));
  END IF;
END $$;
