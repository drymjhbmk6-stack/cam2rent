-- ============================================================
-- Termin-Serien für den persönlichen Mitarbeiter-Kalender
-- Idempotent: kann mehrfach ausgeführt werden.
--
-- Ansatz: Jede Wiederholung wird als EIGENE employee_appointments-Zeile
-- materialisiert (täglich/wöchentlich/14-tägig/monatlich). Dadurch greift
-- die bestehende Reminder-/Push-Pipeline pro Termin unverändert — jede
-- Wiederholung feuert ihre eigene Push-/E-Mail-Erinnerung.
--
-- series_id gruppiert die Zeilen einer Serie, damit der Mitarbeiter die
-- ganze Serie auf einmal löschen kann. NULL = Einzeltermin.
-- ============================================================

ALTER TABLE employee_appointments
  ADD COLUMN IF NOT EXISTS series_id UUID;

-- Lookup "alle Termine dieser Serie" beim Serien-Löschen
CREATE INDEX IF NOT EXISTS idx_employee_appointments_series
  ON employee_appointments (series_id)
  WHERE series_id IS NOT NULL;
