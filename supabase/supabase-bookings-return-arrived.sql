-- Automatische Versand-/Retoure-Statussteuerung via Sendcloud-Live-Status.
--
-- Der Cron `/api/cron/sendcloud-status-sync` schaltet Versand-Buchungen
-- automatisch weiter (confirmed/preparing_shipment -> shipped -> delivered)
-- und erkennt, wenn das Retoure-Paket beim Vermieter angekommen ist.
--
-- Diese Spalte ist der Dedup-Marker fuer die Retoure-Erkennung: sobald das
-- Rueckpaket als "zugestellt" (bei cam2rent) gilt, wird `return_arrived_at`
-- gesetzt und EINE Admin-Notification "Retoure eingetroffen, bitte pruefen"
-- ausgeloest. `IS NULL` = noch nicht erkannt -> nur diese Buchungen bekommen
-- die Push (kein Spam bei jedem Cron-Lauf).
--
-- Additiv + idempotent. Ohne die Migration laeuft die VERSAND-Automatik
-- trotzdem (braucht nur status + shipped_at, die es schon gibt); nur die
-- Retoure-Erkennung ist bis zur Migration inaktiv.

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS return_arrived_at TIMESTAMPTZ NULL;

-- Nur offene Retouren-Kandidaten sind interessant (Teilindex haelt ihn klein).
CREATE INDEX IF NOT EXISTS idx_bookings_return_arrived_pending
  ON bookings (delivery_mode, status)
  WHERE return_arrived_at IS NULL;
