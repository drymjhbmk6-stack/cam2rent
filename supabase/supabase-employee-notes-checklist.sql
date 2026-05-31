-- ============================================================
-- To-do-Liste pro Mitarbeiter-Notiz
-- Idempotent: kann mehrfach ausgeführt werden.
--
-- Erweitert employee_notes um eine optionale Checkliste. Eine Notiz
-- kann zusätzlich zum Freitext-Inhalt eine Liste aus abhakbaren Punkten
-- führen. Format: [{ "id": "...", "text": "...", "done": false }]
-- Leeres Array = reine Text-Notiz (Default-Verhalten wie bisher).
-- ============================================================

ALTER TABLE employee_notes
  ADD COLUMN IF NOT EXISTS checklist JSONB NOT NULL DEFAULT '[]'::jsonb;
