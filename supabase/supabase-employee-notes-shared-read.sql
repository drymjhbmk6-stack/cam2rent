-- ============================================================
-- Mitarbeiter-Notizen: getrennte Lese-/Schreibrechte beim Teilen
-- Idempotent: kann mehrfach ausgeführt werden.
--
-- Erweitert employee_notes um:
--   shared_read UUID[]  — mit diesen Mitarbeiter-IDs ist die Notiz NUR-LESEND
--                         geteilt. Sie dürfen ansehen, aber NICHT bearbeiten.
--
-- Zusammenspiel mit der bestehenden Spalte shared_with:
--   shared_with UUID[]  — Lesen + Bearbeiten (Inhalt, To-dos, Anhänge, Seiten)
--   shared_read UUID[]  — nur Lesen
-- Beide Listen sind disjunkt (eine Person ist entweder Bearbeiter ODER Leser).
-- Die Freigabe-Listen ändern und LÖSCHEN darf weiterhin nur der Besitzer
-- (admin_user_id).
--
-- KEIN Backfill nötig: bestehende shared_with-Freigaben behalten ihr
-- Schreibrecht (Verhalten unverändert). shared_read ist additiv für neue
-- Nur-Lese-Freigaben.
-- ============================================================

ALTER TABLE employee_notes
  ADD COLUMN IF NOT EXISTS shared_read UUID[] NOT NULL DEFAULT '{}';

-- Effizienter Lookup "mit mir (nur lesend) geteilte Notizen"
CREATE INDEX IF NOT EXISTS idx_employee_notes_shared_read
  ON employee_notes USING GIN (shared_read);
