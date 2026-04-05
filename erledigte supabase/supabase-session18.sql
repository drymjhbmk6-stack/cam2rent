-- ============================================================
-- Session 18: Marketing-Features
-- Reviews, Abandoned Carts, Admin Settings für Cart-Reminder
-- ============================================================

-- 1. Reviews-Tabelle
CREATE TABLE IF NOT EXISTS reviews (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  booking_id TEXT NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  product_id TEXT NOT NULL,
  rating INT NOT NULL CHECK (rating >= 1 AND rating <= 5),
  title TEXT,
  text TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  approved BOOLEAN DEFAULT false,
  admin_reply TEXT,
  admin_reply_at TIMESTAMPTZ
);

-- Nur eine Bewertung pro Buchung
CREATE UNIQUE INDEX IF NOT EXISTS idx_reviews_booking_id ON reviews(booking_id);
-- Schnelle Abfrage genehmigter Reviews pro Produkt
CREATE INDEX IF NOT EXISTS idx_reviews_product_approved ON reviews(product_id) WHERE approved = true;
-- Für Kunden-Abfragen
CREATE INDEX IF NOT EXISTS idx_reviews_user_id ON reviews(user_id);

ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;

-- Jeder kann genehmigte Reviews lesen
CREATE POLICY reviews_select_approved ON reviews
  FOR SELECT USING (approved = true);

-- Eigene Reviews lesen (auch nicht genehmigte)
CREATE POLICY reviews_select_own ON reviews
  FOR SELECT USING (auth.uid() = user_id);

-- Eigene Reviews erstellen
CREATE POLICY reviews_insert_own ON reviews
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Service Role kann alles (Admin)
CREATE POLICY reviews_service ON reviews
  FOR ALL USING (auth.role() = 'service_role');


-- 2. Abandoned Carts Tabelle
CREATE TABLE IF NOT EXISTS abandoned_carts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  email TEXT NOT NULL,
  items JSONB NOT NULL DEFAULT '[]',
  cart_total NUMERIC DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  reminder_sent_at TIMESTAMPTZ,
  recovered BOOLEAN DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_abandoned_carts_user ON abandoned_carts(user_id);
CREATE INDEX IF NOT EXISTS idx_abandoned_carts_pending ON abandoned_carts(updated_at)
  WHERE reminder_sent_at IS NULL AND recovered = false;

ALTER TABLE abandoned_carts ENABLE ROW LEVEL SECURITY;

-- Service Role kann alles
CREATE POLICY abandoned_carts_service ON abandoned_carts
  FOR ALL USING (auth.role() = 'service_role');


-- 3. Admin-Settings für Abandoned Cart und Social Media
INSERT INTO admin_settings (key, value) VALUES
  ('abandoned_cart_enabled', 'true'),
  ('abandoned_cart_delay_hours', '24'),
  ('abandoned_cart_discount_enabled', 'false'),
  ('abandoned_cart_discount_percent', '5'),
  ('social_instagram_url', 'https://instagram.com/cam2rent'),
  ('social_youtube_url', 'https://youtube.com/@cam2rent'),
  ('social_tiktok_url', 'https://tiktok.com/@cam2rent'),
  ('whatsapp_number', '491628367477')
ON CONFLICT (key) DO NOTHING;
