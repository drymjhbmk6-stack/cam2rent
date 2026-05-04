-- ════════════════════════════════════════════════════════════════════
-- expenses.purchase_id — Beleg-Verknuepfung pro Ausgabe
-- ════════════════════════════════════════════════════════════════════
-- Kontext: Beim Nachtragen von Inventar-Units kann der Admin neuerdings
-- "Ausgabe (kein Asset)" waehlen. Damit die Ausgabe trotzdem einen
-- Beleg-Nachweis hat (welche Lieferantenrechnung kam das aus?), wird
-- eine optionale FK auf purchases gesetzt.
--
-- Idempotent: kann mehrfach laufen.
-- ════════════════════════════════════════════════════════════════════

ALTER TABLE expenses
  ADD COLUMN IF NOT EXISTS purchase_id UUID NULL
  REFERENCES purchases(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_expenses_purchase_id
  ON expenses (purchase_id) WHERE purchase_id IS NOT NULL;

COMMENT ON COLUMN expenses.purchase_id IS
  'Optionale Verknuepfung zur Lieferantenrechnung (purchases) als Beleg-Nachweis. NULL = kein Einkauf zugeordnet.';
