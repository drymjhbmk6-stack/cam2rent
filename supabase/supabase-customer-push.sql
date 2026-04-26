-- Web-Push fuer Endkunden — wer "Benachrichtige mich bei neuen Kameras /
-- Aktionen" auf der Startseite klickt, bekommt einen Eintrag hier.
-- Same VAPID-Keypair wie Admin (lib/push.ts), separater Sender wegen
-- unterschiedlicher Permission-Logik (Kunden brauchen keine Permissions).

CREATE TABLE IF NOT EXISTS customer_push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  user_agent TEXT,
  -- Optional: an Supabase-Auth-User binden (eingeloggter Kunde),
  -- sonst anonym moeglich (Newsletter-aehnlich).
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  email TEXT,
  -- Topic-Subscription — feinere Steuerung wenn mal noetig
  -- (z.B. "neue_kameras", "saison_aktion"). Default: alles.
  topics TEXT[] NOT NULL DEFAULT ARRAY['all'],
  is_test BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_customer_push_user
  ON customer_push_subscriptions(user_id);

CREATE INDEX IF NOT EXISTS idx_customer_push_email
  ON customer_push_subscriptions(LOWER(email))
  WHERE email IS NOT NULL;

ALTER TABLE customer_push_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_only" ON customer_push_subscriptions;
CREATE POLICY "service_role_only" ON customer_push_subscriptions
  FOR ALL USING (false);
