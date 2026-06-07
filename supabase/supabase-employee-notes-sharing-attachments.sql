-- ============================================================
-- Mitarbeiter-Notizen: Teilen + Anhänge
-- Idempotent: kann mehrfach ausgeführt werden.
--
-- Erweitert employee_notes um:
--   shared_with UUID[]  — mit diesen Mitarbeiter-IDs ist die Notiz geteilt.
--                         Geteilte dürfen LESEN + BEARBEITEN (Inhalt, To-dos,
--                         Anhänge). Die Freigabe-Liste ändern und LÖSCHEN darf
--                         nur der admin_user_id-Besitzer.
--   attachments JSONB   — Liste angehängter Dateien:
--                         [{ "id","path","filename","mime","size" }]
--                         Die Dateien liegen im privaten Storage-Bucket
--                         `employee-note-attachments` unter <admin_user_id>/<uuid>.<ext>
--
-- ⚠ Storage-Bucket `employee-note-attachments` muss im Supabase-Dashboard
--   MANUELL angelegt werden (Public OFF). Empfohlene MIME-Allowlist:
--   image/jpeg, image/png, image/webp, image/heic, image/heif, image/gif,
--   application/pdf, video/mp4, video/quicktime, video/webm. Limit ~50 MB.
-- ============================================================

ALTER TABLE employee_notes
  ADD COLUMN IF NOT EXISTS shared_with UUID[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS attachments JSONB NOT NULL DEFAULT '[]'::jsonb;

-- Effizienter Lookup "mit mir geteilte Notizen"
CREATE INDEX IF NOT EXISTS idx_employee_notes_shared_with
  ON employee_notes USING GIN (shared_with);
