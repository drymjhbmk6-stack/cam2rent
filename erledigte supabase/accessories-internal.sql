-- Internes Zubehoer + Upgrade-Gruppen: Spalten hinzufuegen
-- Fuehre in der Supabase SQL-Konsole aus.
ALTER TABLE accessories ADD COLUMN IF NOT EXISTS internal BOOLEAN DEFAULT false;
ALTER TABLE accessories ADD COLUMN IF NOT EXISTS upgrade_group TEXT DEFAULT NULL;
ALTER TABLE accessories ADD COLUMN IF NOT EXISTS is_upgrade_base BOOLEAN DEFAULT false;
