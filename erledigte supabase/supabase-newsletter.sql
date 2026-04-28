-- Newsletter-Abonnenten mit Double-Opt-In (Pflicht in DE).
-- Anmeldung loest Bestaetigungsmail aus, erst nach Klick auf den Link
-- ist der Eintrag wirklich aktiv und darf bespielt werden.

CREATE TABLE IF NOT EXISTS newsletter_subscribers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  -- Bestaetigungs-Token (einmalig, ablaufend nach 7 Tagen)
  confirm_token TEXT,
  confirm_token_expires_at TIMESTAMPTZ,
  confirmed BOOLEAN NOT NULL DEFAULT FALSE,
  confirmed_at TIMESTAMPTZ,
  confirmed_ip TEXT,
  -- Anmelde-Kontext
  source TEXT,                 -- z.B. 'home', 'footer', 'lead-magnet'
  signup_ip TEXT,
  signup_user_agent TEXT,
  -- Abmeldung
  unsubscribed BOOLEAN NOT NULL DEFAULT FALSE,
  unsubscribed_at TIMESTAMPTZ,
  unsubscribe_token TEXT NOT NULL DEFAULT encode(gen_random_bytes(24), 'hex'),
  -- Meta
  is_test BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Eine konfirmierte E-Mail soll nur einmal existieren — fuer pending erlauben
-- wir Duplikate (User klickt Link nicht, registriert nochmal mit selber Mail).
CREATE UNIQUE INDEX IF NOT EXISTS idx_newsletter_unique_confirmed
  ON newsletter_subscribers(LOWER(email))
  WHERE confirmed = TRUE AND unsubscribed = FALSE;

CREATE INDEX IF NOT EXISTS idx_newsletter_confirm_token
  ON newsletter_subscribers(confirm_token)
  WHERE confirm_token IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_newsletter_unsubscribe_token
  ON newsletter_subscribers(unsubscribe_token);

CREATE INDEX IF NOT EXISTS idx_newsletter_email_lower
  ON newsletter_subscribers(LOWER(email));

-- Auto-update fuer updated_at
CREATE OR REPLACE FUNCTION newsletter_subscribers_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_newsletter_updated_at ON newsletter_subscribers;
CREATE TRIGGER trg_newsletter_updated_at
  BEFORE UPDATE ON newsletter_subscribers
  FOR EACH ROW EXECUTE FUNCTION newsletter_subscribers_set_updated_at();

ALTER TABLE newsletter_subscribers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_only" ON newsletter_subscribers;
CREATE POLICY "service_role_only" ON newsletter_subscribers
  FOR ALL USING (false);
