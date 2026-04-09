-- Internes Zubehoer: Spalte hinzufuegen
-- Fuehre in der Supabase SQL-Konsole aus.
ALTER TABLE accessories ADD COLUMN IF NOT EXISTS internal BOOLEAN DEFAULT false;
