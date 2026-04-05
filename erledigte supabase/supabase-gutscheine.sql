-- ============================================================================
-- Session 14: Gutscheine, Rabatte & Empfehlungsprogramm
-- ============================================================================

-- ─── 1. Tabelle: coupons ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS coupons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('percent', 'fixed')),
  value DECIMAL(10,2) NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  target_type TEXT NOT NULL DEFAULT 'all' CHECK (target_type IN ('all', 'accessory', 'group', 'user')),
  target_id TEXT,
  target_group_id TEXT,
  target_name TEXT,
  target_user_email TEXT,
  valid_from TIMESTAMPTZ,
  valid_until TIMESTAMPTZ,
  max_uses INTEGER,
  used_count INTEGER NOT NULL DEFAULT 0,
  min_order_value DECIMAL(10,2),
  once_per_customer BOOLEAN NOT NULL DEFAULT false,
  not_combinable BOOLEAN NOT NULL DEFAULT false,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Case-insensitive unique constraint on code
CREATE UNIQUE INDEX IF NOT EXISTS coupons_code_upper_idx ON coupons (UPPER(code));

-- Index for active coupons lookup
CREATE INDEX IF NOT EXISTS coupons_active_idx ON coupons (active) WHERE active = true;

-- RLS
ALTER TABLE coupons ENABLE ROW LEVEL SECURITY;

-- Service role full access (admin API uses service role key)
CREATE POLICY coupons_service_all ON coupons
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- ─── 2. Tabelle: referrals ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS referrals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_user_id TEXT NOT NULL,
  referral_code TEXT NOT NULL,
  referred_email TEXT,
  referred_booking_id TEXT,
  reward_coupon_id UUID REFERENCES coupons(id),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'rewarded')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS referrals_referrer_idx ON referrals (referrer_user_id);
CREATE INDEX IF NOT EXISTS referrals_code_idx ON referrals (referral_code);

ALTER TABLE referrals ENABLE ROW LEVEL SECURITY;

CREATE POLICY referrals_service_all ON referrals
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- ─── 3. Bookings-Tabelle erweitern ─────────────────────────────────────────

ALTER TABLE bookings ADD COLUMN IF NOT EXISTS coupon_code TEXT;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS discount_amount DECIMAL(10,2) DEFAULT 0;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS duration_discount DECIMAL(10,2) DEFAULT 0;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS loyalty_discount DECIMAL(10,2) DEFAULT 0;

-- ─── 4. Profiles-Tabelle erweitern ─────────────────────────────────────────

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS referral_code TEXT UNIQUE;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS booking_count INTEGER NOT NULL DEFAULT 0;

-- Auto-generate referral_code for new profiles
CREATE OR REPLACE FUNCTION generate_referral_code()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.referral_code IS NULL THEN
    NEW.referral_code := 'REF-' || SUBSTR(MD5(RANDOM()::TEXT), 1, 8);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_generate_referral_code ON profiles;
CREATE TRIGGER trg_generate_referral_code
  BEFORE INSERT ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION generate_referral_code();

-- Backfill existing profiles with referral codes
UPDATE profiles
SET referral_code = 'REF-' || SUBSTR(MD5(id::TEXT || RANDOM()::TEXT), 1, 8)
WHERE referral_code IS NULL;

-- ─── 5. Seed: bestehende Gutscheine migrieren ──────────────────────────────

INSERT INTO coupons (code, type, value, description, target_type, target_id, target_group_id, target_name, active)
VALUES
  ('WELCOME10', 'percent', 10, '10% Willkommensrabatt auf alles', 'all', NULL, NULL, NULL, true),
  ('SUMMER25', 'percent', 25, '25% Sommerrabatt auf alles', 'all', NULL, NULL, NULL, true),
  ('FREI5', 'fixed', 5, '5 € Sofortrabatt', 'all', NULL, NULL, NULL, true),
  ('AKKU_FREE', 'percent', 100, 'Extra Akku kostenlos', 'accessory', 'battery', NULL, 'Extra Akku', true),
  ('SD_RABATT', 'percent', 50, 'SD-Karte 64 GB 50% günstiger', 'accessory', 'sd64', NULL, 'SD-Karte 64 GB', true),
  ('SPEICHER10', 'percent', 10, '10% auf alle Speicherkarten', 'group', NULL, 'speicherkarten', 'Speicherkarten', true),
  ('SPEICHER_FREE', 'percent', 100, 'Alle Speicherkarten kostenlos', 'group', NULL, 'speicherkarten', 'Speicherkarten', true)
ON CONFLICT DO NOTHING;

-- ─── 6. Seed: Standard-Konfiguration für automatische Rabatte ──────────────

INSERT INTO admin_config (key, value)
VALUES
  ('duration_discounts', '[{"min_days": 5, "discount_percent": 5, "label": "5+ Tage: 5% Rabatt"}, {"min_days": 10, "discount_percent": 10, "label": "10+ Tage: 10% Rabatt"}, {"min_days": 20, "discount_percent": 15, "label": "20+ Tage: 15% Rabatt"}]'::jsonb),
  ('loyalty_discounts', '[{"min_bookings": 3, "discount_percent": 5, "label": "Stammkunde: 5% Rabatt"}, {"min_bookings": 10, "discount_percent": 10, "label": "Treue-Rabatt: 10%"}]'::jsonb),
  ('referral_reward_value', '10'::jsonb)
ON CONFLICT (key) DO NOTHING;
