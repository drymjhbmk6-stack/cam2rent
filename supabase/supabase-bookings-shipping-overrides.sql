-- Optionale Override-Datumsfelder pro Buchung fuer Versand-/Uebergabe-Tag und
-- Rueckgabe-Soll-Datum. NULL = aus admin_settings.booking_buffer_days +
-- rental_from/rental_to berechnen (Default-Verhalten). Wenn gesetzt, hat der
-- Wert Vorrang in:
--   - Customer-Kalender (Verfuegbarkeit pro Produkt)
--   - Admin-Gantt-Kalender (/admin/verfuegbarkeit)
--   - Auftrags-Kalender (/admin/auftragskalender)
--   - Retouren-Liste (/admin/retouren)
--
-- Idempotent (IF NOT EXISTS), bestehende Daten unveraendert. Bei fehlender
-- Migration laufen die APIs ueber defensiven SELECT-Retry weiter ohne die
-- Spalten — kein Hard-Fail.

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS ship_date_override DATE NULL;

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS return_due_date_override DATE NULL;

COMMENT ON COLUMN bookings.ship_date_override IS
  'Optionaler Override: Versand-/Uebergabe-Tag vor Mietbeginn. NULL = aus booking_buffer_days berechnen.';
COMMENT ON COLUMN bookings.return_due_date_override IS
  'Optionaler Override: Rueckgabe-Soll-Datum nach Mietende. NULL = aus booking_buffer_days berechnen.';
