-- Abweichende Rechnungsadresse pro Buchung (optional).
--
-- Wenn `invoice_address` gesetzt ist, wird die Rechnung an diese Adresse
-- adressiert statt an die Versandadresse / Profil-Adresse. Analog
-- `invoice_name` als optionaler Empfaengername (z.B. Firmenname bei
-- Geschaeftskunden-Rechnung).
--
-- Beide Felder sind nullbar — NULL = Default: customer_name +
-- shipping_address ?? Profil-Adresse (Verhalten 1:1 wie vorher).
--
-- Idempotent: kann mehrfach ausgefuehrt werden.

ALTER TABLE bookings ADD COLUMN IF NOT EXISTS invoice_name TEXT NULL;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS invoice_address TEXT NULL;
