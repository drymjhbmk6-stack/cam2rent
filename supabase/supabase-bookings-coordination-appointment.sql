-- Abhol-/Rückgabe-Termin: vereinbarter Ort + Zeitpunkt (idempotent, additiv)
--
-- Ergänzt die reinen „vereinbart"-Marker aus
-- supabase-bookings-coordination-done.sql um den TATSÄCHLICH ausgemachten
-- Termin: Ort, Beginn und (optional) Ende als Zeitraum, plus eine freie Notiz.
--
-- Gesetzt wird das über POST /api/admin/booking/[id]/coordination-done, wenn
-- der Admin im Dashboard-Aufgaben-Widget auf „✓ Termin vereinbart" klickt und
-- im Fenster Ort/Datum/Zeit einträgt. Der Kunde bekommt daraufhin eine
-- Bestätigungs-E-Mail mit genau diesen Angaben.
--
-- Zeitstempel sind TIMESTAMPTZ (der Admin gibt Berliner Ortszeit ein, der
-- Server rechnet mit berlinLocalInputToUTC um). Alle Spalten NULL = kein
-- Termin hinterlegt (Verhalten wie vor dieser Migration).
-- Gilt nur für Abhol-Buchungen (delivery_mode = 'abholung').

-- Abholung (Übergabe an den Kunden)
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS pickup_appointment_at TIMESTAMPTZ NULL;

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS pickup_appointment_end_at TIMESTAMPTZ NULL;

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS pickup_appointment_location TEXT NULL;

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS pickup_appointment_note TEXT NULL;

-- Rückgabe (Kunde bringt zurück)
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS return_appointment_at TIMESTAMPTZ NULL;

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS return_appointment_end_at TIMESTAMPTZ NULL;

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS return_appointment_location TEXT NULL;

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS return_appointment_note TEXT NULL;
