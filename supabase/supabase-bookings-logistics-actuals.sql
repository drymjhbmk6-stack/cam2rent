-- Ist-Logistik pro Buchung: wann das Geraet TATSAECHLICH raus ist, beim Kunden
-- ankam und zurueckkam — im Gegensatz zu den geplanten Puffertagen
-- (`booking_buffer_days` bzw. `ship_date_override`/`return_due_date_override`).
--
-- Gespeist wird das aus dem bestehenden Sendcloud-Live-Status
-- (`/api/cron/sendcloud-status-sync`, laeuft alle 10 Min) sowie — bei Abholung —
-- aus dem Uebergabeprotokoll und der Rueckgabe-Pruefung.
--
-- Verwendet von `computeEffectiveBookingSpan()` (lib/booking-buffer.ts) und
-- damit von Kunden-Kalender, Admin-Gantt, Ueberbuchungssperre und
-- Zubehoer-Verfuegbarkeit.
--
-- KERN-INVARIANTE: Der tatsaechliche Verlauf darf die Blockspanne nur
-- AUSDEHNEN, nie verkuerzen. Verkuerzt wird ausschliesslich durch die
-- abgeschlossene Rueckgabe-Pruefung (Status verlaesst RESERVING_BOOKING_STATUSES).
--
-- `return_arrived_at` (supabase-bookings-return-arrived.sql) bleibt UNVERAENDERT
-- bestehen: es ist der Dedup-Claim der `return_arrived`-Notification. Die neue
-- Spalte `actual_return_at` ist die kalenderrelevante Fachzeit. Der Cron zieht
-- Altbestand mit Source `legacy_detected` nach.
--
-- Additiv + idempotent. OHNE diese Migration laeuft alles wie bisher: die
-- Lese-Pfade haben einen defensiven SELECT-Retry ohne die Spalten, der Helper
-- faellt dann auf die reine Puffer-/Override-Rechnung zurueck.

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS actual_dispatch_at TIMESTAMPTZ NULL;
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS actual_dispatch_source TEXT NULL;

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS actual_delivery_at TIMESTAMPTZ NULL;
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS actual_delivery_source TEXT NULL;

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS actual_return_at TIMESTAMPTZ NULL;
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS actual_return_source TEXT NULL;

-- Bewusst KEIN CHECK-Constraint auf den Source-Spalten: `ADD CONSTRAINT` ist
-- ohne DO-Block nicht idempotent. Die erlaubten Werte stehen im Kommentar.
COMMENT ON COLUMN bookings.actual_dispatch_at IS
  'Ist-Zeitpunkt: Geraet hat das Lager verlassen. Versand = Carrier-Annahme, Abholung = Uebergabeprotokoll. NULL = kein Ist-Wert, Kalender nutzt den geplanten Puffer.';
COMMENT ON COLUMN bookings.actual_dispatch_source IS
  'Herkunft von actual_dispatch_at: sendcloud_updated | sendcloud_announced | sendcloud_created | detected | handover | manual';
COMMENT ON COLUMN bookings.actual_delivery_at IS
  'Ist-Zeitpunkt: Paket beim Kunden zugestellt (nur Versand). Vor rental_from = Kunde hat das Geraet frueher als vereinbart.';
COMMENT ON COLUMN bookings.actual_delivery_source IS
  'Herkunft von actual_delivery_at: sendcloud_updated | detected';
COMMENT ON COLUMN bookings.actual_return_at IS
  'Ist-Zeitpunkt: Rueckpaket bei cam2rent eingetroffen bzw. Kamera zurueckgegeben. Gibt NICHT automatisch frei — das macht erst die Rueckgabe-Pruefung.';
COMMENT ON COLUMN bookings.actual_return_source IS
  'Herkunft von actual_return_at: sendcloud_updated | detected | legacy_detected | return_check | manual';

-- Teilindex fuer den Backfill-Claim des Crons (nur offene Kandidaten).
CREATE INDEX IF NOT EXISTS idx_bookings_dispatch_pending
  ON bookings (delivery_mode, status)
  WHERE actual_dispatch_at IS NULL;
