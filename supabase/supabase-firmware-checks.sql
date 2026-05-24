-- Firmware-Update-Check pro Kamera-Modell (eine Zeile pro product_id).
--
-- Der wöchentliche Cron `/api/cron/firmware-check` befüllt diese Tabelle.
-- Die Admin-UI unter `/admin/firmware` sowie die Stammdaten-Karte auf
-- `/admin/inventar/[id]` und `/admin/preise/kameras/[id]` lesen daraus.
--
-- Plus: pro physisches Stück (Inventar-Unit) wird die installierte Version
-- als Freitext gepflegt — damit hängt der "Update verfügbar"-Hinweis am
-- jeweiligen Exemplar, nicht nur am Modell.
--
-- Idempotent: kann mehrfach ausgeführt werden.

CREATE TABLE IF NOT EXISTS firmware_checks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id TEXT UNIQUE NOT NULL,
  brand TEXT NOT NULL,
  model TEXT NOT NULL,
  latest_version TEXT,
  source_url TEXT,
  release_date DATE,
  status TEXT NOT NULL DEFAULT 'ok' CHECK (status IN ('ok', 'error', 'unsupported')),
  error_message TEXT,
  last_checked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_changed_at TIMESTAMPTZ,
  seen_version TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_firmware_checks_status
  ON firmware_checks (status);

CREATE INDEX IF NOT EXISTS idx_firmware_checks_last_changed
  ON firmware_checks (last_changed_at DESC NULLS LAST);

-- Pro-Stück-Tracking: Admin trägt manuell ein, welche Firmware installiert ist.
ALTER TABLE inventar_units
  ADD COLUMN IF NOT EXISTS installed_firmware TEXT;

-- RLS: nur service-role darf lesen/schreiben.
ALTER TABLE firmware_checks ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'firmware_checks'
      AND policyname = 'service_role_all_firmware_checks'
  ) THEN
    CREATE POLICY service_role_all_firmware_checks
      ON firmware_checks
      FOR ALL
      USING (auth.role() = 'service_role')
      WITH CHECK (auth.role() = 'service_role');
  END IF;
END $$;
