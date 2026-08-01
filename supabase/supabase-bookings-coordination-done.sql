-- Abhol-/Rückgabe-Terminabsprache — „Termin vereinbart"-Marker (idempotent, additiv)
--
-- Zwei Timestamp-Spalten, die festhalten, wann der Admin für eine Abhol-Buchung
-- den Abhol- bzw. Rückgabetermin mit dem Kunden ausgemacht hat. Sobald gesetzt,
-- verschwindet die entsprechende „📞 … vereinbaren"-Aufgabe aus dem
-- Dashboard-Aufgaben-Widget (das die Aufgabe sonst LIVE aus Status + 48h-Fenster
-- berechnet).
--
-- NULL = noch nicht vereinbart. Wird über
-- POST /api/admin/booking/[id]/coordination-done gesetzt bzw. wieder geleert.
-- Gilt nur für Abhol-Buchungen (delivery_mode = 'abholung').

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS pickup_coordination_done_at TIMESTAMPTZ NULL;

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS return_coordination_done_at TIMESTAMPTZ NULL;
