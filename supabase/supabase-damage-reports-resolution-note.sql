-- ============================================================
-- cam2rent – Schadensmeldung: getrennter Kunden-Abschlusstext
-- Idempotent. Im Supabase SQL-Editor ausführen.
-- ============================================================

-- Kundensichtbarer Abschluss-Text ("Das haben wir gemacht"), der beim Lösen
-- in die Abschluss-Mail an den Kunden geht. `admin_notes` bleibt rein intern
-- und wird dem Kunden NICHT mehr mitgeschickt.
ALTER TABLE damage_reports
  ADD COLUMN IF NOT EXISTS resolution_note TEXT;
