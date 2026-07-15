-- Land pro Kundenprofil (Lieferland).
--
-- cam2rent liefert vorerst nur innerhalb Deutschlands. Die Spalte hält das
-- vom Kunden bei der Registrierung angegebene Land (ISO-3166-1-alpha-2).
-- Bestehende Profile bekommen den Default 'DE' (alle Bestandskunden sind
-- deutsch — vor dieser Migration gab es kein Länderfeld).
--
-- Idempotent, additiv. Ohne diese Migration läuft alles weiter: die
-- Registrierung schreibt das Land dann nur nicht separat (defensiver Retry),
-- die Länder-Sperre greift über die erlaubte-Länder-Liste im App-Code trotzdem.
--
-- Service-Role-only: die Spalte ist bewusst NICHT im column-level
-- GRANT UPDATE aus supabase-profiles-rls-column-level.sql — der Kunde kann sein
-- Land nicht selbst umstellen (es gibt aktuell ohnehin nur Deutschland). SELECT
-- der eigenen Zeile bleibt über die bestehende RLS erlaubt.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS country TEXT NOT NULL DEFAULT 'DE';
