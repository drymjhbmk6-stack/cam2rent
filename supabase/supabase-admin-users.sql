-- ============================================================
-- Mitarbeiterkonten fuer den Admin-Bereich
-- Idempotent: kann mehrfach ausgefuehrt werden.
--
-- Tabellen:
--   admin_users     — Mitarbeiter-Accounts (Owner + Employees)
--   admin_sessions  — Aktive Sessions (Cookie-Token -> User)
--
-- Permission-Schluessel (JSONB-Array, z.B. ["kunden","katalog"]):
--   tagesgeschaeft        — Buchungen, Kalender, Versand, Retouren, Schaeden
--   kunden                — Kunden, Anfragen, Bewertungen, Warteliste
--   katalog               — Kameras, Sets, Zubehoer, Einkauf
--   preise                — Versand/Haftung, Gutscheine, Rabatte
--   content               — Startseite, Blog, Social Media, Reels
--   finanzen              — Buchhaltung, Anlagenverzeichnis
--   berichte              — Statistiken, E-Mail-Vorlagen/Protokoll, Beta-Feedback, Admin-Protokoll
--   system                — Rechtstexte, Einstellungen
--   mitarbeiter_verwalten — Mitarbeiter anlegen/aendern/loeschen (nur Owner)
--
-- Rollen:
--   owner    — hat IMMER alle Permissions, permissions-Feld wird ignoriert
--   employee — nur die im permissions-Array enthaltenen Bereiche
-- ============================================================

CREATE TABLE IF NOT EXISTS admin_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'employee' CHECK (role IN ('owner','employee')),
  permissions JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_login_at TIMESTAMPTZ,
  created_by UUID REFERENCES admin_users(id) ON DELETE SET NULL
);

-- Optionaler Login-Username zusaetzlich zur E-Mail (case-insensitive eindeutig)
ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS username TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_admin_users_username_lower
  ON admin_users (LOWER(username))
  WHERE username IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_admin_users_email ON admin_users (email);
CREATE INDEX IF NOT EXISTS idx_admin_users_active ON admin_users (is_active) WHERE is_active;

CREATE TABLE IF NOT EXISTS admin_sessions (
  token TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  user_agent TEXT,
  ip_address TEXT
);

CREATE INDEX IF NOT EXISTS idx_admin_sessions_user ON admin_sessions (user_id);
CREATE INDEX IF NOT EXISTS idx_admin_sessions_expires ON admin_sessions (expires_at);

-- updated_at Trigger
CREATE OR REPLACE FUNCTION touch_admin_users_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_admin_users_updated_at ON admin_users;
CREATE TRIGGER trg_admin_users_updated_at
  BEFORE UPDATE ON admin_users
  FOR EACH ROW EXECUTE FUNCTION touch_admin_users_updated_at();

-- RLS: nur Service-Role darf zugreifen
ALTER TABLE admin_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_sessions ENABLE ROW LEVEL SECURITY;

-- Kein PUBLIC-Grant, Policies leer -> nur Service-Role kommt ran.

-- Hilfs-Query: abgelaufene Sessions aufraeumen (manuell oder per Cron)
--   DELETE FROM admin_sessions WHERE expires_at < NOW();
