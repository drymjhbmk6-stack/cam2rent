-- Abhol-/Rückgabe-Terminabsprache — Reminder-Dedup-Marker (idempotent, additiv)
--
-- Zwei Timestamp-Spalten, die festhalten, wann der Admin per Push/Notification
-- daran erinnert wurde, mit dem Kunden einen Abhol- bzw. Rückgabetermin
-- auszumachen. Dienen dem Cron /api/cron/pickup-return-reminder als
-- Idempotenz-Marker (eine Push pro Buchung + Richtung).
--
-- NULL = noch nicht erinnert. Wird beim ersten Reminder im 48-Stunden-Fenster
-- gesetzt. Gilt nur für Abhol-Buchungen (delivery_mode = 'abholung').

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS pickup_coordination_reminded_at TIMESTAMPTZ NULL;

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS return_coordination_reminded_at TIMESTAMPTZ NULL;
