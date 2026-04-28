-- ════════════════════════════════════════════════════════════════════════════
-- UMFLAGGEN: Importierte Excel-Rechnungen 2025 von Test auf Live
-- ════════════════════════════════════════════════════════════════════════════
-- Falls du `import-rechnungen-2025.sql` ausgefuehrt hast, BEVOR die Datei auf
-- is_test=FALSE umgestellt wurde, sind alle Eintraege noch als Test markiert.
-- Damit erscheinen sie nirgends in EUeR / Dashboard / DATEV.
--
-- Dieses Skript flaggt sie um, ohne IDs zu aendern. Idempotent — kann mehrfach
-- ausgefuehrt werden.
--
-- Selektor: notes-Feld enthaelt "Auto-Import 2025-Excel"
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

-- 1) Purchases umflaggen
UPDATE purchases
   SET is_test = FALSE
 WHERE notes LIKE 'Auto-Import 2025-Excel %'
   AND is_test = TRUE;

-- 2) Expenses umflaggen (sowohl Original als auch _REFUND-Varianten)
UPDATE expenses
   SET is_test = FALSE
 WHERE source_type = 'purchase_invoice'
   AND notes LIKE 'Auto-Import 2025-Excel %'
   AND is_test = TRUE;

-- 3) Bestaetigung ausgeben
SELECT
  (SELECT COUNT(*) FROM purchases WHERE notes LIKE 'Auto-Import 2025-Excel %' AND is_test = FALSE) AS purchases_live,
  (SELECT COUNT(*) FROM expenses
    WHERE source_type = 'purchase_invoice'
      AND notes LIKE 'Auto-Import 2025-Excel %'
      AND is_test = FALSE) AS expenses_live,
  (SELECT ROUND(SUM(gross_amount), 2)
     FROM expenses
    WHERE source_type = 'purchase_invoice'
      AND notes LIKE 'Auto-Import 2025-Excel %'
      AND is_test = FALSE) AS summe_brutto;

COMMIT;

-- Erwartete Ausgabe nach erfolgreichem Lauf:
--   purchases_live: 28
--   expenses_live:  30  (28 Original + 2 Refunds)
--   summe_brutto:   2118.95
