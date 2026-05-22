-- ════════════════════════════════════════════════════════════════════
-- expenses.purchase_id — Beleg-Verknuepfung pro Ausgabe
-- ════════════════════════════════════════════════════════════════════
-- Kontext: Beim Nachtragen von Inventar-Units kann der Admin neuerdings
-- "Ausgabe (kein Asset)" waehlen. Damit die Ausgabe trotzdem einen
-- Beleg-Nachweis hat (welche Lieferantenrechnung kam das aus?), wird
-- eine optionale FK auf purchases gesetzt.
--
-- Idempotent: kann mehrfach laufen.
-- Defensiv: still uebersprungen, wenn expenses oder purchases fehlt.
-- ════════════════════════════════════════════════════════════════════

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema='public' AND table_name='expenses'
  ) THEN
    RAISE NOTICE 'Skip expenses.purchase_id: Tabelle expenses existiert nicht.';
    RETURN;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema='public' AND table_name='purchases'
  ) THEN
    RAISE NOTICE 'Skip expenses.purchase_id: Tabelle purchases existiert nicht.';
    RETURN;
  END IF;

  ALTER TABLE expenses
    ADD COLUMN IF NOT EXISTS purchase_id UUID NULL
    REFERENCES purchases(id) ON DELETE SET NULL;

  EXECUTE 'CREATE INDEX IF NOT EXISTS idx_expenses_purchase_id ON expenses (purchase_id) WHERE purchase_id IS NOT NULL';

  EXECUTE 'COMMENT ON COLUMN expenses.purchase_id IS ''Optionale Verknuepfung zur Lieferantenrechnung (purchases) als Beleg-Nachweis. NULL = kein Einkauf zugeordnet.''';
END $$;
