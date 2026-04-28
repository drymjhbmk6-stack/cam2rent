-- ════════════════════════════════════════════════════════════════════════════
-- ANLAGEN auf Live-Modus umflaggen
-- ════════════════════════════════════════════════════════════════════════════
-- Wenn du Anlagen (Kameras / Zubehoer / Buero-Equipment) im Test-Modus ueber
-- /admin/anlagen/nachtragen angelegt hast, sind sie als is_test=TRUE in der DB.
-- Folge: Sie tauchen nicht in EUeR / DATEV / Wochenbericht auf, weil dort der
-- Filter is_test=FALSE greift.
--
-- Dieses Skript:
--   1) Zeigt erstmal an, was an Test-Anlagen vorhanden ist (READ-ONLY)
--   2) Setzt assets + verknuepfte purchases + verknuepfte AfA-expenses
--      gleichzeitig auf is_test=FALSE
--
-- Idempotent — kann mehrfach laufen.
--
-- WICHTIG: Wenn du absichtliche Test-Anlagen hast (z.B. zum Workflow-
-- Ausprobieren), werden die hiermit AUCH auf live geflaggt. Dann vorher die
-- WHERE-Bedingungen anpassen (z.B. WHERE name LIKE 'TEST%' AUSSCHLIESSEN).
-- ════════════════════════════════════════════════════════════════════════════


-- ─── 1) VORAB-CHECK: Was wuerde umgeflaggt werden? ──────────────────────────
-- Diesen Teil zuerst alleine ausfuehren, bevor du das UPDATE startest.
-- Wenn alles in der Liste echte Anlagen sind, weiter zum UPDATE-Block unten.

SELECT
  '── Anlagen mit is_test=TRUE ──' AS sektion,
  id,
  kind,
  name,
  serial_number,
  TO_CHAR(purchase_date, 'DD.MM.YYYY') AS kaufdatum,
  purchase_price AS kaufpreis,
  current_value AS zeitwert,
  status
FROM assets
WHERE is_test = TRUE
ORDER BY purchase_date DESC, name;

SELECT
  '── Verknuepfte Einkaeufe mit is_test=TRUE ──' AS sektion,
  p.id,
  p.invoice_number,
  s.name AS lieferant,
  TO_CHAR(p.order_date, 'DD.MM.YYYY') AS datum,
  p.total_amount AS brutto
FROM purchases p
LEFT JOIN suppliers s ON s.id = p.supplier_id
WHERE p.is_test = TRUE
  AND EXISTS (SELECT 1 FROM assets a WHERE a.purchase_id = p.id)
ORDER BY p.order_date DESC;

SELECT
  '── Verknuepfte AfA-Buchungen mit is_test=TRUE ──' AS sektion,
  e.id,
  TO_CHAR(e.expense_date, 'DD.MM.YYYY') AS afa_datum,
  e.description,
  e.gross_amount AS afa_betrag,
  a.name AS anlage
FROM expenses e
LEFT JOIN assets a ON a.id = e.asset_id
WHERE e.is_test = TRUE
  AND e.category = 'depreciation'
ORDER BY e.expense_date DESC;


-- ════════════════════════════════════════════════════════════════════════════
-- ─── 2) UPDATE-BLOCK: Alles auf Live setzen ──────────────────────────────────
-- Wenn die obigen Listen ok aussehen, untenstehenden Block ausfuehren.
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

-- 2a) Anlagen umflaggen
UPDATE assets
   SET is_test = FALSE
 WHERE is_test = TRUE;

-- 2b) Einkaeufe, die zu Anlagen gehoeren, umflaggen
UPDATE purchases
   SET is_test = FALSE
 WHERE is_test = TRUE
   AND id IN (SELECT purchase_id FROM assets WHERE purchase_id IS NOT NULL);

-- 2c) AfA-Buchungen (Kategorie 'depreciation') auf den geflaggten Anlagen
UPDATE expenses
   SET is_test = FALSE
 WHERE is_test = TRUE
   AND category IN ('depreciation', 'asset_purchase')
   AND asset_id IN (SELECT id FROM assets);

-- 2d) Bestaetigungs-Output
SELECT
  (SELECT COUNT(*) FROM assets   WHERE is_test = FALSE) AS anlagen_live_total,
  (SELECT COUNT(*) FROM assets   WHERE is_test = TRUE)  AS anlagen_test_uebrig,
  (SELECT COUNT(*) FROM purchases WHERE is_test = FALSE
     AND id IN (SELECT purchase_id FROM assets WHERE purchase_id IS NOT NULL)) AS anlagen_einkaeufe_live,
  (SELECT COUNT(*) FROM expenses WHERE is_test = FALSE
     AND category IN ('depreciation', 'asset_purchase')) AS afa_buchungen_live,
  (SELECT ROUND(SUM(purchase_price), 2) FROM assets WHERE is_test = FALSE) AS anschaffungswert_live,
  (SELECT ROUND(SUM(current_value), 2)  FROM assets WHERE is_test = FALSE) AS zeitwert_live;

COMMIT;

-- Erwartete Ausgabe nach dem UPDATE:
--   anlagen_live_total:    4   (= deine 4 Kameras)
--   anlagen_test_uebrig:   0   (es sei denn, du hast bewusst Test-Anlagen)
--   anlagen_einkaeufe_live: <=4  (jede Kamera hat optional eine purchase)
--   afa_buchungen_live:    <Anzahl monatlicher AfA-Eintraege>
--   anschaffungswert_live: <Summe Kaufpreis aller 4 Kameras>
--   zeitwert_live:         <aktueller Buchwert>
