-- ═══════════════════════════════════════════════════════════════════════════
-- Aufgabe 6: Kundendaten einheitlich 10 Jahre aufbewahren (Soft Delete)
-- ═══════════════════════════════════════════════════════════════════════════
-- ANLEITUNG: Dieses Script in der Supabase SQL-Konsole ausführen.

-- 1. Soft-Delete-Spalte zu allen relevanten Tabellen hinzufügen
-- ─────────────────────────────────────────────────────────────────────────

-- Profiles (Kundenstammdaten)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS anonymized BOOLEAN DEFAULT FALSE;

-- Bookings (Buchungen)
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;

-- Reviews (Bewertungen)
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;

-- Damage Reports (Schadensfälle)
ALTER TABLE damage_reports ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;

-- Conversations (Nachrichten)
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;

-- Messages
ALTER TABLE messages ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;

-- Feedback
ALTER TABLE feedback ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;

-- 2. Index für schnelle Abfragen auf deleted_at
-- ─────────────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_profiles_deleted_at ON profiles (deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_bookings_deleted_at ON bookings (deleted_at) WHERE deleted_at IS NOT NULL;

-- 3. Hilfsfunktion: Aufbewahrungsdatum berechnen (created_at + 10 Jahre)
-- ─────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION retention_until(created TIMESTAMPTZ)
RETURNS TIMESTAMPTZ AS $$
BEGIN
  RETURN created + INTERVAL '10 years';
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- 4. Funktion: Kundendaten anonymisieren (für DSGVO-Anfragen)
-- ─────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION anonymize_customer(customer_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE profiles SET
    full_name = 'Gelöschter Kunde',
    phone = NULL,
    address_street = NULL,
    address_zip = NULL,
    address_city = NULL,
    anonymized = TRUE,
    deleted_at = NOW(),
    updated_at = NOW()
  WHERE id = customer_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Funktion: Hard Delete nach 10 Jahren (für monatlichen Cleanup-Cron)
-- ─────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION cleanup_expired_data()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER := 0;
  cutoff TIMESTAMPTZ := NOW() - INTERVAL '10 years';
BEGIN
  -- Feedback löschen (älteste zuerst)
  DELETE FROM feedback WHERE created_at < cutoff;
  GET DIAGNOSTICS deleted_count = ROW_COUNT;

  -- Reviews löschen
  DELETE FROM reviews WHERE created_at < cutoff;

  -- Messages löschen
  DELETE FROM messages WHERE created_at < cutoff;

  -- Conversations ohne Messages löschen
  DELETE FROM conversations WHERE created_at < cutoff
    AND id NOT IN (SELECT DISTINCT conversation_id FROM messages);

  -- Damage reports löschen
  DELETE FROM damage_reports WHERE created_at < cutoff;

  -- Buchungen löschen
  DELETE FROM bookings WHERE created_at < cutoff;

  -- Anonymisierte Profile mit abgelaufener Frist löschen
  DELETE FROM profiles WHERE created_at < cutoff AND anonymized = TRUE;

  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ═══════════════════════════════════════════════════════════════════════════
-- HINWEIS: Ein monatlicher Cron-Job sollte cleanup_expired_data() aufrufen.
-- Dies kann über Supabase Edge Functions oder einen externen Cron erfolgen.
-- ═══════════════════════════════════════════════════════════════════════════
