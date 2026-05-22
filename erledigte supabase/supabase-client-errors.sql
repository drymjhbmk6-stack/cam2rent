-- Client-Error-Log: Frontend-Fehler aus dem Browser landen hier,
-- damit wir sie nachverfolgen koennen, ohne dass der Kunde DevTools offen hat.
-- Wird von /api/log-client-error gefuettert (aufgerufen aus app/error.tsx +
-- app/global-error.tsx). Im Admin sichtbar unter /admin/client-errors.
--
-- Idempotent: kann mehrfach ausgefuehrt werden.

CREATE TABLE IF NOT EXISTS client_errors (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  digest        TEXT,
  message       TEXT,
  stack         TEXT,
  url           TEXT,
  user_agent    TEXT,
  user_id       UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  is_admin      BOOLEAN NOT NULL DEFAULT FALSE,
  ip_address    TEXT,
  context       JSONB,
  is_test       BOOLEAN NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_client_errors_created_at
  ON client_errors(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_client_errors_digest
  ON client_errors(digest)
  WHERE digest IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_client_errors_url
  ON client_errors(url)
  WHERE url IS NOT NULL;

ALTER TABLE client_errors ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'client_errors'
      AND policyname = 'service_all_client_errors'
  ) THEN
    CREATE POLICY service_all_client_errors
      ON client_errors
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;
