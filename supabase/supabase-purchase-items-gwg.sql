-- GWG (Geringwertige Wirtschaftsgueter) als eigene Klassifikation in
-- purchase_items.classification erlauben.
--
-- Hintergrund: GWG nach § 6 Abs. 2 EStG (250-800 EUR netto) duerfen sofort
-- abgeschrieben werden. Steuerlich erscheinen sie als Aufwand in der EÜR
-- (expense mit category='asset_purchase'), gleichzeitig besteht eine
-- Verzeichnis-Pflicht (§ 6 Abs. 2 S. 4 EStG) — sie muessen also auch im
-- Anlagenverzeichnis gefuehrt werden (assets mit depreciation_method='immediate').
--
-- Daher legt der GWG-Pfad in /api/admin/purchase-items/[id] BEIDE Eintraege
-- an: ein Asset (fuer das Verzeichnis) + eine Expense (fuer die EÜR), beide
-- ueber purchase_items.asset_id + .expense_id verknuepft.
--
-- Idempotent.

DO $$
BEGIN
  -- Constraint-Name kommt von Postgres automatisch (purchase_items_classification_check),
  -- aber zur Sicherheit suchen wir ihn dynamisch.
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'purchase_items'::regclass
      AND conname = 'purchase_items_classification_check'
  ) THEN
    ALTER TABLE purchase_items DROP CONSTRAINT purchase_items_classification_check;
  END IF;

  ALTER TABLE purchase_items
    ADD CONSTRAINT purchase_items_classification_check
    CHECK (classification IN ('asset', 'gwg', 'expense', 'pending', 'ignored'));
END $$;
