-- Kunden-UGC (User-Generated Content): Fotos/Videos aus Miet-Buchungen.
-- Kunden laden Material hoch, erteilen Nutzungsrechte, Admin moderiert.
-- Freigabe loest automatisch Rabatt-Gutschein aus (wie DANKE-Coupon-Flow).
-- "Feature"-Flag loest zusaetzlichen Bonus-Gutschein aus, wenn Material
-- tatsaechlich auf Social/Blog/Website verwendet wird.
--
-- Storage-Bucket: `customer-ugc` (manuell im Supabase-Dashboard anlegen,
--   Public: OFF, File size: 50 MB, MIME: image/*, video/mp4, video/quicktime,
--   video/webm).

CREATE TABLE IF NOT EXISTS customer_ugc_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id TEXT NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  customer_email TEXT,
  customer_name TEXT,

  -- Medien (Storage-Pfade im Bucket customer-ugc, parallele Arrays)
  file_paths TEXT[] NOT NULL DEFAULT '{}',
  file_kinds TEXT[] NOT NULL DEFAULT '{}',   -- 'image' | 'video' pro Datei
  file_sizes BIGINT[] NOT NULL DEFAULT '{}', -- Bytes pro Datei

  -- Freitext vom Kunden (was zeigt das Material, wo aufgenommen, etc.)
  caption TEXT,

  -- Einwilligung — granular pro Kanal
  consent_use_website BOOLEAN NOT NULL DEFAULT false,
  consent_use_social BOOLEAN NOT NULL DEFAULT false,
  consent_use_blog BOOLEAN NOT NULL DEFAULT false,
  consent_use_marketing BOOLEAN NOT NULL DEFAULT false,
  consent_name_visible BOOLEAN NOT NULL DEFAULT false,   -- Vorname bei Veroeffentlichung
  consent_text_version INTEGER NOT NULL DEFAULT 1,
  consent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  consent_ip TEXT,

  -- Workflow-Status
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'featured', 'rejected', 'withdrawn')),
  admin_note TEXT,
  rejected_reason TEXT,
  reviewed_at TIMESTAMPTZ,
  reviewed_by UUID,  -- admin_users.id (nullable, bei Legacy-Login leer)

  -- Belohnungen
  reward_coupon_code TEXT,  -- Basis-Rabatt bei approve
  bonus_coupon_code TEXT,   -- On-Top bei feature
  featured_at TIMESTAMPTZ,
  featured_channel TEXT,    -- 'social' | 'blog' | 'website' | 'other'
  featured_reference TEXT,  -- freie Referenz (Post-ID, URL, etc.)

  -- Widerruf durch Kunde
  withdrawn_at TIMESTAMPTZ,
  withdrawn_reason TEXT,

  -- Meta
  is_test BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_customer_ugc_booking ON customer_ugc_submissions(booking_id);
CREATE INDEX IF NOT EXISTS idx_customer_ugc_user ON customer_ugc_submissions(user_id);
CREATE INDEX IF NOT EXISTS idx_customer_ugc_status ON customer_ugc_submissions(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_customer_ugc_featured ON customer_ugc_submissions(featured_at DESC) WHERE featured_at IS NOT NULL;

-- Eine aktive (nicht-zurueckgezogene) Submission pro Buchung.
CREATE UNIQUE INDEX IF NOT EXISTS idx_customer_ugc_unique_active
  ON customer_ugc_submissions(booking_id)
  WHERE status IN ('pending', 'approved', 'featured');

-- Auto-update fuer updated_at
CREATE OR REPLACE FUNCTION customer_ugc_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_customer_ugc_updated_at ON customer_ugc_submissions;
CREATE TRIGGER trg_customer_ugc_updated_at
  BEFORE UPDATE ON customer_ugc_submissions
  FOR EACH ROW EXECUTE FUNCTION customer_ugc_set_updated_at();

-- RLS — nur Service-Role-Zugriff, unsere APIs machen die Auth.
ALTER TABLE customer_ugc_submissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_only" ON customer_ugc_submissions;
CREATE POLICY "service_role_only" ON customer_ugc_submissions
  FOR ALL USING (false);

-- Seed-Setting: Standard-Belohnungen
INSERT INTO admin_settings (key, value)
VALUES (
  'customer_ugc_rewards',
  '{
    "approve_discount_percent": 15,
    "approve_min_order_value": 50,
    "approve_validity_days": 120,
    "feature_discount_percent": 25,
    "feature_min_order_value": 50,
    "feature_validity_days": 180,
    "max_files_per_submission": 5,
    "max_file_size_mb": 50,
    "enabled": true
  }'::jsonb
)
ON CONFLICT (key) DO NOTHING;
