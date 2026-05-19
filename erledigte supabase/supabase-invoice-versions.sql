-- Rechnungs-Versionierung: jede Fassung der Kundenrechnung wird intern
-- unveraenderlich archiviert (Snapshot + PDF im contracts-Bucket).
-- Idempotent — mehrfaches Ausfuehren ist gefahrlos.

CREATE TABLE IF NOT EXISTS invoice_versions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id      TEXT NOT NULL,
  invoice_number  TEXT NOT NULL,
  version_number  INT  NOT NULL,
  is_current      BOOLEAN NOT NULL DEFAULT TRUE,
  lines           JSONB NOT NULL DEFAULT '{}'::jsonb,
  gross_amount    NUMERIC NOT NULL DEFAULT 0,
  net_amount      NUMERIC NOT NULL DEFAULT 0,
  tax_amount      NUMERIC NOT NULL DEFAULT 0,
  reason          TEXT,
  trigger_source  TEXT NOT NULL DEFAULT 'manual',
  pdf_path        TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by      TEXT,
  sent_to_customer_at TIMESTAMPTZ,
  sent_to_email   TEXT
);

CREATE INDEX IF NOT EXISTS idx_invoice_versions_booking
  ON invoice_versions (booking_id, version_number);

-- Pro Buchung darf es nur EINE aktuelle Fassung geben.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_invoice_versions_current
  ON invoice_versions (booking_id) WHERE is_current;

-- Unveraenderlichkeit (Audit-Sicherheit, analog legal_document_versions):
-- Lesen nur Service-Role, UPDATE/DELETE komplett gesperrt.
ALTER TABLE invoice_versions ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'invoice_versions' AND policyname = 'invoice_versions_service_read'
  ) THEN
    CREATE POLICY invoice_versions_service_read ON invoice_versions
      FOR SELECT USING (auth.role() = 'service_role');
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'invoice_versions' AND policyname = 'invoice_versions_service_insert'
  ) THEN
    CREATE POLICY invoice_versions_service_insert ON invoice_versions
      FOR INSERT WITH CHECK (auth.role() = 'service_role');
  END IF;
END $$;

-- Das "sent_to_customer_at"/"sent_to_email"-Feld wird nach dem Versand
-- gesetzt — dafuer ist ein eng begrenztes UPDATE noetig. Wir erlauben es
-- ueber den Service-Role-Key (Server-Code), aber NICHT ueber Client-Rollen.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'invoice_versions' AND policyname = 'invoice_versions_service_update'
  ) THEN
    CREATE POLICY invoice_versions_service_update ON invoice_versions
      FOR UPDATE USING (auth.role() = 'service_role')
      WITH CHECK (auth.role() = 'service_role');
  END IF;
END $$;
