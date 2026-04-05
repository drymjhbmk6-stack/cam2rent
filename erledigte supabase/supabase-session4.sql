-- ═══════════════════════════════════════════════════════════════════════
-- cam2rent – Session 4: Kundenkonto & Authentifizierung
-- Im Supabase Dashboard ausführen:
-- supabase.com → Dein Projekt → SQL Editor → New Query → einfügen → Run
-- ═══════════════════════════════════════════════════════════════════════

-- ─── Nutzerprofil-Tabelle ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS profiles (
  id               UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name        TEXT,
  phone            TEXT,
  address_street   TEXT,
  address_zip      TEXT,
  address_city     TEXT,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

-- Row Level Security aktivieren
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Nutzer darf nur das eigene Profil lesen
CREATE POLICY "users_read_own_profile"
  ON profiles FOR SELECT
  USING (auth.uid() = id);

-- Nutzer darf das eigene Profil anlegen
CREATE POLICY "users_insert_own_profile"
  ON profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

-- Nutzer darf das eigene Profil aktualisieren
CREATE POLICY "users_update_own_profile"
  ON profiles FOR UPDATE
  USING (auth.uid() = id);

-- ─── Automatisches Anlegen des Profils bei Registrierung ─────────────────────

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, full_name)
  VALUES (NEW.id, NEW.raw_user_meta_data->>'full_name')
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger: wird nach jeder neuen Nutzerregistrierung ausgeführt
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE handle_new_user();

-- ─── bookings-Tabelle erweitern ───────────────────────────────────────────────
-- Neue Spalten für Nutzerzuordnung (nullable, für Abwärtskompatibilität)

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS user_id         UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS customer_email  TEXT,
  ADD COLUMN IF NOT EXISTS customer_name   TEXT;

-- Index für schnelle Abfragen nach user_id
CREATE INDEX IF NOT EXISTS bookings_user_id ON bookings (user_id);

-- RLS-Policy: Nutzer sieht nur eigene Buchungen
CREATE POLICY "users_read_own_bookings"
  ON bookings FOR SELECT
  USING (auth.uid() = user_id);
