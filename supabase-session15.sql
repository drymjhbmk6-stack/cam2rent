-- ============================================================================
-- Session 15: Erweiterte Kundenfeatures
-- Favoriten, Nachrichten, Buchungsverlängerung, Digitaler Mietvertrag
-- ============================================================================

-- ─── 1. Tabelle: favorites ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS favorites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_favorites_user ON favorites(user_id);
CREATE INDEX IF NOT EXISTS idx_favorites_product ON favorites(product_id);

ALTER TABLE favorites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_read_own_favorites" ON favorites
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "users_insert_own_favorites" ON favorites
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "users_delete_own_favorites" ON favorites
  FOR DELETE USING (auth.uid() = user_id);


-- ─── 2. Tabelle: conversations ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subject TEXT NOT NULL,
  booking_id TEXT REFERENCES bookings(id),
  last_message_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closed BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_conversations_customer ON conversations(customer_id);
CREATE INDEX IF NOT EXISTS idx_conversations_last_message ON conversations(last_message_at DESC);

ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_read_own_conversations" ON conversations
  FOR SELECT USING (auth.uid() = customer_id);

CREATE POLICY "users_insert_own_conversations" ON conversations
  FOR INSERT WITH CHECK (auth.uid() = customer_id);


-- ─── 3. Tabelle: messages ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_type TEXT NOT NULL CHECK (sender_type IN ('customer', 'admin')),
  sender_id UUID NOT NULL,
  body TEXT NOT NULL,
  read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id, created_at);
CREATE INDEX IF NOT EXISTS idx_messages_sender ON messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_messages_unread ON messages(read) WHERE read = false;

ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_read_own_messages" ON messages
  FOR SELECT USING (
    conversation_id IN (
      SELECT id FROM conversations WHERE customer_id = auth.uid()
    )
  );

CREATE POLICY "users_insert_own_messages" ON messages
  FOR INSERT WITH CHECK (auth.uid() = sender_id AND sender_type = 'customer');


-- ─── 4. Booking-Erweiterungen ──────────────────────────────────────────────

-- Verlängerung
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS original_rental_to DATE;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS extension_payment_intent_id TEXT;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS extended_at TIMESTAMPTZ;

-- Digitaler Mietvertrag
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS contract_signed BOOLEAN DEFAULT false;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS contract_signature_url TEXT;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS contract_signed_at TIMESTAMPTZ;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS contract_signer_name TEXT;


-- ─── 5. Storage Bucket für Signaturen ──────────────────────────────────────
-- Muss im Supabase Dashboard erstellt werden:
-- Bucket Name: signatures
-- Public: false
-- Allowed MIME types: image/png
-- Max file size: 500KB
