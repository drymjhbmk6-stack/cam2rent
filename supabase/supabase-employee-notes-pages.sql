-- ============================================================
-- Mitarbeiter-Notizen: Buch-Modus (mehrere Seiten)
-- Idempotent: kann mehrfach ausgeführt werden.
--
-- Erweitert employee_notes um:
--   pages JSONB  — Liste der Buch-Seiten. Jede Seite hat eigenen Text und
--                  eigene Bilder/Dateien:
--                  [{ "id", "content", "attachments": [{id,path,filename,mime,size}] }]
--
-- Leeres Array = klassische Einzel-Notiz (Text in `content`, Bilder in
-- `attachments`). Sobald eine Notiz 2+ Seiten hat, lebt der Inhalt in `pages`;
-- `content`/`attachments` spiegeln zur Karten-Vorschau weiterhin die 1. Seite.
--
-- Die Dateien je Seite liegen im selben privaten Storage-Bucket
-- `employee-note-attachments` unter <admin_user_id>/<uuid>.<ext> wie die
-- Notiz-Anhänge (gleicher Upload-Endpoint).
-- ============================================================

ALTER TABLE employee_notes
  ADD COLUMN IF NOT EXISTS pages JSONB NOT NULL DEFAULT '[]'::jsonb;
