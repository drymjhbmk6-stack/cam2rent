-- ════════════════════════════════════════════════════════════════════════
-- customer_login_history — Login-Protokoll der Kundenkonten
-- ════════════════════════════════════════════════════════════════════════
--
-- Supabase `auth.users` speichert nur `last_sign_in_at` (einen einzigen Wert).
-- Fuer den Admin-Login-Verlauf ("letzte 10 Logins pro Kunde") brauchen wir eine
-- eigene Historie. Jeder erfolgreiche Kunden-Login (signInWithPassword, egal ob
-- ueber /login, Express-Signup, Checkout oder Buchungsflow) schreibt hier eine
-- Zeile.
--
-- Erfasst wird ueber den AuthProvider (onAuthStateChange → 'SIGNED_IN') gegen
-- den Endpoint POST /api/customer-login-track. Der Endpoint dedupliziert
-- serverseitig (max. 1 Zeile pro User je 10 Minuten), damit Tab-Wechsel /
-- Re-Validierungen keine Phantom-Logins erzeugen.
--
-- WICHTIG: Die Historie beginnt ab Migration — vergangene Logins koennen NICHT
-- rueckwirkend importiert werden (Supabase haelt sie nicht vor).
--
-- Idempotent.

CREATE TABLE IF NOT EXISTS customer_login_history (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL,
  -- E-Mail zum Login-Zeitpunkt (reine Anzeige; auth.users bleibt Quelle).
  email       TEXT,
  ip          TEXT,
  user_agent  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Schneller Lookup der letzten N Logins pro Kunde (Admin-Detailseite).
CREATE INDEX IF NOT EXISTS customer_login_history_user_idx
  ON customer_login_history (user_id, created_at DESC);

-- RLS: nur Service-Role (alle Zugriffe laufen ueber API mit Service-Client).
ALTER TABLE customer_login_history ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'customer_login_history'
      AND policyname = 'customer_login_history_service_role_all'
  ) THEN
    CREATE POLICY customer_login_history_service_role_all ON customer_login_history
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END$$;
