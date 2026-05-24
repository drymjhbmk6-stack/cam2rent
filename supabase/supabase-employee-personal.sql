-- ============================================================
-- Persönlicher Bereich für Mitarbeiter
-- Idempotent: kann mehrfach ausgeführt werden.
--
-- Tabellen:
--   employee_notes        — private Notizen pro Mitarbeiter
--   employee_appointments — persönlicher Kalender mit Erinnerung
--
-- Sharing:
--   employee_notes sind IMMER privat (admin_user_id-scoped)
--   employee_appointments können per shared_with[]-Array mit weiteren
--   Mitarbeiter-IDs geteilt werden (Lesen + Erinnerung). Editierrecht hat
--   nur der admin_user_id-Besitzer.
--
-- Reminder:
--   reminder_minutes_before = NULL  → keine Erinnerung
--   reminder_minutes_before = INT   → X Minuten vor starts_at
--   reminder_push  / reminder_email steuern, welche Kanäle benachrichtigt werden
--   reminder_sent_at = NULL  → Cron wird beim nächsten Lauf feuern
-- ============================================================

CREATE TABLE IF NOT EXISTS employee_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id UUID NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT '',
  content TEXT NOT NULL DEFAULT '',
  pinned BOOLEAN NOT NULL DEFAULT FALSE,
  color TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_employee_notes_user
  ON employee_notes (admin_user_id, pinned DESC, updated_at DESC);

CREATE TABLE IF NOT EXISTS employee_appointments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id UUID NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  location TEXT,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ,
  all_day BOOLEAN NOT NULL DEFAULT FALSE,
  color TEXT,
  reminder_minutes_before INTEGER,
  reminder_push BOOLEAN NOT NULL DEFAULT TRUE,
  reminder_email BOOLEAN NOT NULL DEFAULT FALSE,
  reminder_sent_at TIMESTAMPTZ,
  shared_with UUID[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_employee_appointments_user_starts
  ON employee_appointments (admin_user_id, starts_at);

-- Effizienter Pending-Reminder-Scan im Cron
CREATE INDEX IF NOT EXISTS idx_employee_appointments_pending_reminder
  ON employee_appointments (starts_at)
  WHERE reminder_minutes_before IS NOT NULL AND reminder_sent_at IS NULL;

-- Lookup für "Termine die mit mir geteilt sind"
CREATE INDEX IF NOT EXISTS idx_employee_appointments_shared
  ON employee_appointments USING GIN (shared_with);

-- updated_at automatisch fortschreiben
CREATE OR REPLACE FUNCTION touch_employee_personal_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_employee_notes_updated_at ON employee_notes;
CREATE TRIGGER trg_employee_notes_updated_at
  BEFORE UPDATE ON employee_notes
  FOR EACH ROW
  EXECUTE FUNCTION touch_employee_personal_updated_at();

DROP TRIGGER IF EXISTS trg_employee_appointments_updated_at ON employee_appointments;
CREATE TRIGGER trg_employee_appointments_updated_at
  BEFORE UPDATE ON employee_appointments
  FOR EACH ROW
  EXECUTE FUNCTION touch_employee_personal_updated_at();

-- RLS: Service-Role-only. Ownership wird im App-Layer geprüft
-- (admin_user_id-Vergleich gegen die eingeloggte Session).
ALTER TABLE employee_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE employee_appointments ENABLE ROW LEVEL SECURITY;

-- Keine Policies — service_role umgeht RLS automatisch.
