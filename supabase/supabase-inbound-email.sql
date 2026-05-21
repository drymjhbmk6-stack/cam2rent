-- ════════════════════════════════════════════════════════════════════════════
-- Eingehende Kunden-E-Mails im Admin-Bereich (Resend Inbound)
-- ════════════════════════════════════════════════════════════════════════════
-- Idempotent. Dockt an das bestehende conversations/messages-Modell an
-- (siehe erledigte supabase/supabase-session15.sql).
--
-- Echte eingehende E-Mails landen als conversations mit source='email'.
-- Absender ohne Kundenkonto sind erlaubt -> customer_id wird nullable.
-- ════════════════════════════════════════════════════════════════════════════

-- ─── 1. conversations: E-Mail-Kanal + anonyme Sender ───────────────────────

ALTER TABLE conversations ALTER COLUMN customer_id DROP NOT NULL;

ALTER TABLE conversations ADD COLUMN IF NOT EXISTS customer_email TEXT;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS customer_name TEXT;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'account';
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS email_message_id TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'conversations_source_check'
  ) THEN
    ALTER TABLE conversations
      ADD CONSTRAINT conversations_source_check
      CHECK (source IN ('account', 'email'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_conversations_customer_email
  ON conversations (lower(customer_email)) WHERE customer_email IS NOT NULL;

-- ─── 2. messages: HTML-Body + E-Mail-Threading-Header ──────────────────────

ALTER TABLE messages ADD COLUMN IF NOT EXISTS body_html TEXT;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS email_message_id TEXT;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS email_in_reply_to TEXT;

-- Dedupe gegen doppelte Webhook-Zustellung derselben E-Mail.
CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_email_message_id
  ON messages (email_message_id) WHERE email_message_id IS NOT NULL;

-- ─── 3. message_attachments: E-Mail-Anhaenge ───────────────────────────────

CREATE TABLE IF NOT EXISTS message_attachments (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id   UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL,
  filename     TEXT NOT NULL,
  mime_type    TEXT,
  size_bytes   BIGINT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_message_attachments_message
  ON message_attachments (message_id);

-- RLS aktiv, keine Policies -> nur Service-Role (analog product_units).
ALTER TABLE message_attachments ENABLE ROW LEVEL SECURITY;

-- ════════════════════════════════════════════════════════════════════════════
-- MANUELL: Supabase Storage-Bucket `email-attachments` anlegen
--   Public: OFF (Service-Role-only), Datei-Limit ~25 MB
--   MIME-Allowlist: am besten LEER lassen (alle Typen erlauben) — der Webhook
--   speichert nicht erkannte Anhaenge bewusst als `application/octet-stream`,
--   damit sie nie inline gerendert werden koennen. Eine restriktive
--   MIME-Allowlist wuerde solche Anhaenge sonst beim Upload abweisen.
-- ════════════════════════════════════════════════════════════════════════════
