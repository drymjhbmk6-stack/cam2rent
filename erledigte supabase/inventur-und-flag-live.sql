-- ════════════════════════════════════════════════════════════════════════════
-- INVENTUR + UMFLAGGEN: Test-Daten in der DB ueberblicken und gezielt auf Live
-- ════════════════════════════════════════════════════════════════════════════
-- Das Skript hat zwei Bloecke:
--
--   1) INVENTUR (READ-ONLY) — listet pro Tabelle alle Datensaetze, die
--      aktuell als is_test=TRUE markiert sind. Erst diesen Block alleine
--      ausfuehren und das Ergebnis ansehen.
--
--   2) UPDATE — flaggt nur die STAMMDATEN um, die eindeutig zum echten
--      Geschaeftsbetrieb gehoeren:
--        - assets (Kameras + Zubehoer als Anlagen)
--        - purchases (Einkaufs-Rechnungen, die zu Anlagen gehoeren ODER
--          aus dem Excel-Import "Auto-Import 2025-Excel" stammen)
--        - expenses fuer AfA, GWG-Sofortabzug + Excel-Import-Eintraege
--
-- WAS NICHT UMGEFLAGGT WIRD:
--   - bookings (mit Stripe-Test-Karten 4242... = echte Test-Buchungen)
--   - invoices / credit_notes (haengen an bookings)
--   - email_log, admin_audit_log, stripe_transactions
--   Diese sollen sauber Test bleiben, bis du sie bewusst loeschst oder
--   nach dem Live-Switch mit echten Buchungen neu fuellst.
-- ════════════════════════════════════════════════════════════════════════════


-- ─── BLOCK 1: INVENTUR (READ-ONLY) ──────────────────────────────────────────
-- Zeigt pro Tabelle, wieviel als Test gespeichert ist + Stichproben.

SELECT '──────── ZAEHLUNG: was ist als is_test=TRUE in der DB? ────────' AS info;

SELECT 'assets'                          AS tabelle, COUNT(*) AS anzahl FROM assets                  WHERE is_test = TRUE
UNION ALL SELECT 'purchases',                        COUNT(*)          FROM purchases               WHERE is_test = TRUE
UNION ALL SELECT 'expenses',                         COUNT(*)          FROM expenses                WHERE is_test = TRUE
UNION ALL SELECT 'bookings',                         COUNT(*)          FROM bookings                WHERE is_test = TRUE
UNION ALL SELECT 'invoices',                         COUNT(*)          FROM invoices                WHERE is_test = TRUE
UNION ALL SELECT 'credit_notes',                     COUNT(*)          FROM credit_notes            WHERE is_test = TRUE
UNION ALL SELECT 'email_log',                        COUNT(*)          FROM email_log               WHERE is_test = TRUE
UNION ALL SELECT 'admin_audit_log',                  COUNT(*)          FROM admin_audit_log         WHERE is_test = TRUE
UNION ALL SELECT 'stripe_transactions',              COUNT(*)          FROM stripe_transactions     WHERE is_test = TRUE;


SELECT '──────── DETAIL: assets (Anlagen — Kameras / Zubehoer) ────────' AS info;
SELECT
  id,
  kind,
  name,
  serial_number,
  TO_CHAR(purchase_date, 'DD.MM.YYYY') AS kaufdatum,
  purchase_price                       AS kaufpreis,
  current_value                        AS zeitwert,
  status
FROM assets
WHERE is_test = TRUE
ORDER BY purchase_date DESC, name;


SELECT '──────── DETAIL: purchases (Einkaufs-Rechnungen) ────────' AS info;
SELECT
  p.id,
  p.invoice_number,
  COALESCE(s.name, '–')                  AS lieferant,
  TO_CHAR(p.order_date, 'DD.MM.YYYY')    AS datum,
  p.total_amount                          AS brutto,
  CASE
    WHEN EXISTS (SELECT 1 FROM assets a WHERE a.purchase_id = p.id) THEN 'an Anlage geknuepft'
    WHEN p.notes LIKE 'Auto-Import 2025-Excel %'                    THEN 'Excel-Import 2025'
    ELSE 'sonstige'
  END                                     AS herkunft
FROM purchases p
LEFT JOIN suppliers s ON s.id = p.supplier_id
WHERE p.is_test = TRUE
ORDER BY p.order_date DESC;


SELECT '──────── DETAIL: expenses (Ausgaben — AfA, GWG, Sonstiges) ────────' AS info;
SELECT
  e.id,
  TO_CHAR(e.expense_date, 'DD.MM.YYYY')  AS datum,
  e.category,
  LEFT(e.description, 60)                 AS beschreibung,
  e.gross_amount                           AS brutto,
  CASE
    WHEN e.category = 'depreciation'                                THEN 'AfA'
    WHEN e.category = 'asset_purchase'                              THEN 'GWG-Sofortabzug'
    WHEN e.source_type = 'purchase_invoice'
         AND e.notes LIKE 'Auto-Import 2025-Excel %'                THEN 'Excel-Import 2025'
    WHEN e.asset_id IS NOT NULL                                     THEN 'an Anlage geknuepft'
    ELSE 'sonstige'
  END                                      AS herkunft
FROM expenses e
WHERE e.is_test = TRUE
ORDER BY e.expense_date DESC, e.category;


-- Optional: Test-Buchungen ueberblicken (NICHT in Block 2 betroffen).
SELECT '──────── DETAIL: bookings (TEST — wird NICHT umgeflaggt) ────────' AS info;
SELECT
  id,
  TO_CHAR(created_at, 'DD.MM.YYYY HH24:MI') AS angelegt,
  customer_name,
  product_name,
  price_total,
  status
FROM bookings
WHERE is_test = TRUE
ORDER BY created_at DESC
LIMIT 50;


-- ════════════════════════════════════════════════════════════════════════════
-- ─── BLOCK 2: UPDATE — Stammdaten auf Live setzen ──────────────────────────
-- Erst ausfuehren, wenn Block 1 ok aussieht. Idempotent.
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

-- 2a) Alle Anlagen umflaggen
UPDATE assets
   SET is_test = FALSE
 WHERE is_test = TRUE;

-- 2b) Einkaeufe umflaggen, die zu Anlagen gehoeren ODER aus dem Excel-Import
--     "Auto-Import 2025-Excel" stammen
UPDATE purchases
   SET is_test = FALSE
 WHERE is_test = TRUE
   AND (
        id IN (SELECT purchase_id FROM assets WHERE purchase_id IS NOT NULL)
     OR notes LIKE 'Auto-Import 2025-Excel %'
   );

-- 2c) Expenses umflaggen:
--     - AfA-/GWG-Buchungen, die an eine Anlage haengen (asset_id NOT NULL)
--     - Direkte Excel-Imports (source_type=purchase_invoice + Auto-Import-Notiz)
UPDATE expenses
   SET is_test = FALSE
 WHERE is_test = TRUE
   AND (
        (asset_id IS NOT NULL AND category IN ('depreciation', 'asset_purchase'))
     OR (source_type = 'purchase_invoice' AND notes LIKE 'Auto-Import 2025-Excel %')
   );

-- 2d) Zusammenfassung
SELECT
  '──────── ERGEBNIS ────────'                                                      AS info,
  (SELECT COUNT(*) FROM assets    WHERE is_test = FALSE)                            AS anlagen_live,
  (SELECT COUNT(*) FROM assets    WHERE is_test = TRUE)                             AS anlagen_test_uebrig,
  (SELECT COUNT(*) FROM purchases WHERE is_test = FALSE)                            AS einkaeufe_live,
  (SELECT COUNT(*) FROM purchases WHERE is_test = TRUE)                             AS einkaeufe_test_uebrig,
  (SELECT COUNT(*) FROM expenses  WHERE is_test = FALSE)                            AS expenses_live,
  (SELECT COUNT(*) FROM expenses  WHERE is_test = TRUE)                             AS expenses_test_uebrig,
  (SELECT ROUND(SUM(purchase_price), 2) FROM assets WHERE is_test = FALSE)          AS anschaffungswert_live,
  (SELECT ROUND(SUM(current_value),  2) FROM assets WHERE is_test = FALSE)          AS zeitwert_live;

COMMIT;

-- ════════════════════════════════════════════════════════════════════════════
-- TIPP: Wenn du einen einzelnen Eintrag aus Block 1 NICHT umflaggen willst
-- (z.B. einen bewussten Test-Asset namens "TEST-Kamera"), vor Block 2 die
-- WHERE-Bedingung ergaenzen, z.B. in 2a):
--    AND name NOT LIKE 'TEST%'
-- Dann bleibt der bewusste Test-Eintrag unangetastet.
-- ════════════════════════════════════════════════════════════════════════════
