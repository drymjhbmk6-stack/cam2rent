-- ============================================================
-- Kalender-Notizen für den Auftragskalender (/admin/auftragskalender)
-- Idempotent — kann mehrfach ausgeführt werden.
-- ============================================================

CREATE TABLE IF NOT EXISTS calendar_notes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  note_date   DATE NOT NULL,
  text        TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_calendar_notes_date ON calendar_notes(note_date);

-- RLS: nur Service-Role (Admin-API). Keine Policies = kein Zugriff für anon/authenticated.
ALTER TABLE calendar_notes ENABLE ROW LEVEL SECURITY;
