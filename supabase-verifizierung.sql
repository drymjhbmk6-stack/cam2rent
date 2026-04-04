-- ============================================================
-- Session 13: Betrugsschutz & Verifizierung
-- Ausführen in Supabase SQL Editor
-- ============================================================

-- ============================================================
-- 1. profiles-Erweiterungen (Verifizierung + Blacklist)
-- ============================================================

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS verification_status TEXT DEFAULT 'none';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS id_front_url TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS id_back_url TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS verified_by TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS blacklisted BOOLEAN DEFAULT FALSE;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS blacklist_reason TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS blacklisted_at TIMESTAMPTZ;

-- Indizes
CREATE INDEX IF NOT EXISTS idx_profiles_verification_status ON profiles(verification_status);
CREATE INDEX IF NOT EXISTS idx_profiles_blacklisted ON profiles(blacklisted) WHERE blacklisted = true;

-- ============================================================
-- 2. bookings-Erweiterungen (Deposit + Suspicious)
-- ============================================================

ALTER TABLE bookings ADD COLUMN IF NOT EXISTS deposit_intent_id TEXT;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS deposit_status TEXT DEFAULT 'none';
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS suspicious BOOLEAN DEFAULT FALSE;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS suspicious_reasons TEXT[] DEFAULT '{}';

-- Indizes
CREATE INDEX IF NOT EXISTS idx_bookings_suspicious ON bookings(suspicious) WHERE suspicious = true;
CREATE INDEX IF NOT EXISTS idx_bookings_deposit_intent ON bookings(deposit_intent_id) WHERE deposit_intent_id IS NOT NULL;

-- ============================================================
-- 3. admin_settings Tabelle (TOTP, Kaution-Modus etc.)
-- ============================================================

CREATE TABLE IF NOT EXISTS admin_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS: Nur Service Role darf lesen/schreiben
ALTER TABLE admin_settings ENABLE ROW LEVEL SECURITY;

-- Default: Kaution + Haftungsschutz beides aktiv
INSERT INTO admin_settings (key, value)
VALUES ('deposit_mode', 'both')
ON CONFLICT (key) DO NOTHING;

-- ============================================================
-- 4. Privater Storage Bucket für Ausweisdokumente
-- ============================================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('id-documents', 'id-documents', false)
ON CONFLICT (id) DO NOTHING;

-- Authentifizierte User dürfen in ihren eigenen Ordner hochladen
CREATE POLICY "Users can upload own ID documents"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'id-documents'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Authentifizierte User dürfen ihre eigenen Dokumente überschreiben
CREATE POLICY "Users can update own ID documents"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'id-documents'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Kein öffentlicher Lesezugriff — nur service_role (Admin) kann lesen
-- Service Role bypassed RLS automatisch

-- ============================================================
-- Fertig! Alle Änderungen für Session 13.
-- ============================================================
