-- ============================================================
-- cam2rent – Schadensmanagement & Retouren
-- Im Supabase SQL-Editor ausführen (einmalig)
-- ============================================================

-- 1. Neue Tabelle: damage_reports
CREATE TABLE IF NOT EXISTS damage_reports (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id      TEXT NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  reported_by     TEXT NOT NULL DEFAULT 'customer',
  -- 'customer' | 'admin'
  description     TEXT NOT NULL,
  photos          TEXT[] DEFAULT '{}',
  -- Array von Supabase Storage URLs
  damage_amount   DECIMAL(10,2),
  -- Vom Admin festgelegte Schadenshöhe
  deposit_retained DECIMAL(10,2),
  -- Tatsächlich einbehaltener Betrag
  status          TEXT NOT NULL DEFAULT 'open',
  -- 'open' | 'confirmed' | 'resolved'
  admin_notes     TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at     TIMESTAMPTZ
);

-- Indizes für damage_reports
CREATE INDEX IF NOT EXISTS idx_damage_reports_booking_id ON damage_reports(booking_id);
CREATE INDEX IF NOT EXISTS idx_damage_reports_status ON damage_reports(status);
CREATE INDEX IF NOT EXISTS idx_damage_reports_created_at ON damage_reports(created_at DESC);

-- RLS aktivieren
ALTER TABLE damage_reports ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Service role full access on damage_reports"
  ON damage_reports FOR ALL
  USING (true)
  WITH CHECK (true);

-- 2. Bookings-Erweiterung: repair_until Feld
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS repair_until TIMESTAMPTZ;

-- 3. Storage Bucket für Schadensfotos
-- (Muss ggf. manuell im Supabase Dashboard erstellt werden:
--  Storage → New Bucket → Name: "damage-photos", Public: true)
INSERT INTO storage.buckets (id, name, public)
VALUES ('damage-photos', 'damage-photos', true)
ON CONFLICT (id) DO NOTHING;

-- Storage Policy: Authentifizierte User können uploaden
CREATE POLICY "Authenticated users can upload damage photos"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'damage-photos'
    AND auth.role() = 'authenticated'
  );

-- Storage Policy: Jeder kann lesen (public bucket)
CREATE POLICY "Public read access for damage photos"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'damage-photos');

-- Storage Policy: Service role kann löschen
CREATE POLICY "Service role can delete damage photos"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'damage-photos');
