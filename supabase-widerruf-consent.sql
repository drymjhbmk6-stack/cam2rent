-- Migration: Widerrufsrecht-Zustimmung gemäß § 356 Abs. 4 BGB speichern
--
-- Kontext:
-- Wenn cam2rent vor Ablauf der 14-tägigen Widerrufsfrist mit der Ausführung
-- der Dienstleistung beginnt (Versand der Mietgeräte), muss der Kunde
-- ausdrücklich zustimmen und bestätigen, dass er davon Kenntnis hat, dass
-- sein Widerrufsrecht mit vollständiger Vertragserfüllung erlischt.
--
-- Diese Spalten speichern Zeitstempel und IP des Ankreuzens als Beweis.

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS early_service_consent_at timestamptz,
  ADD COLUMN IF NOT EXISTS early_service_consent_ip text;

COMMENT ON COLUMN bookings.early_service_consent_at IS
  'Zeitpunkt der Zustimmung gemäß § 356 Abs. 4 BGB zur vorzeitigen Leistungserbringung';
COMMENT ON COLUMN bookings.early_service_consent_ip IS
  'IP-Adresse zum Zeitpunkt der Zustimmung (Beweiskraft)';
