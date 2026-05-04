-- Purchase-Attachments: mehrere Belege (Rechnung, Quittung, Lieferschein, ...)
-- pro Einkauf. Wird sowohl von /api/admin/purchases (manuell) als auch von
-- /api/admin/purchases/upload (KI) genutzt. Storage-Bucket: purchase-invoices.
--
-- Idempotent: kann mehrfach ausgefuehrt werden.

CREATE TABLE IF NOT EXISTS purchase_attachments (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_id   UUID NOT NULL REFERENCES purchases(id) ON DELETE CASCADE,
  storage_path  TEXT NOT NULL,
  filename      TEXT NOT NULL,
  mime_type     TEXT NOT NULL,
  size_bytes    BIGINT,
  kind          TEXT NOT NULL DEFAULT 'other'
                CHECK (kind IN ('invoice', 'receipt', 'delivery_note', 'other')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_purchase_attachments_purchase
  ON purchase_attachments(purchase_id);

ALTER TABLE purchase_attachments ENABLE ROW LEVEL SECURITY;

-- Service-Role-only (analog purchases / assets)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'purchase_attachments'
      AND policyname = 'service_all_purchase_attachments'
  ) THEN
    CREATE POLICY service_all_purchase_attachments
      ON purchase_attachments
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;
