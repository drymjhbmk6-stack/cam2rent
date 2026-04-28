-- ════════════════════════════════════════════════════════════════════════════
-- BULK-IMPORT: Einkaufs-Rechnungen Mai - Sept 2025 (cam2rent)
-- ════════════════════════════════════════════════════════════════════════════
-- Quelle: Excel "Rechnungen 2025" (28 Original + 2 Rueckzahlungen, Summe brutto
-- 2.118,95 €). Alles Zubehoer/Verbrauchsmaterial unter 800 € Netto
-- -> GWG-Sofortabzug, keine Anlage in `assets`.
--
-- Was passiert hier:
--   1. Lieferanten anlegen ("Amazon", "MediaMarkt") — idempotent
--   2. Pro Rechnung: purchases-Row + purchase_items (1 Position) — idempotent
--      ueber invoice_number
--   3. Pro Rechnung: expenses-Row mit Kategorie 'hardware' — idempotent
--      ueber (source_type='purchase_invoice', source_id=invoice_number)
--   4. Rueckzahlungen werden NUR als negative expenses-Rows erfasst
--      (source_id=<orig>_REFUND), nicht als neue purchases — semantisch
--      eine Lieferanten-Gutschrift, kein neuer Einkauf
--
-- Steuer-Modus: Kleinunternehmer
--   -> tax_amount = 0 in expenses (Vorsteuer nicht abziehbar)
--   -> Original Netto/USt (wo in der Rechnung ausgewiesen) landen in
--      purchases.net_amount/tax_amount zur Doku
--
-- TEST/LIVE-Modus:
--   `is_test = FALSE` ist gesetzt, weil die Rechnungen aus der Excel ECHT sind
--   (Kameras + Zubehoer fuer den realen Geschaeftsbetrieb). Damit erscheinen
--   sie sofort in EUeR, Buchhaltungs-Dashboard, DATEV-Export usw., auch wenn
--   das Frontend gerade noch im Test-Modus laeuft. Buchhaltungs-Reports
--   filtern hardcoded `is_test=false` (GoBD-konform), damit Test-Buchungen
--   nicht in Live-Reports landen.
--
-- Audit-Quelle pro Eintrag: notes-Spalte enthaelt "Auto-Import 2025-Excel · ..."
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── 1) Lieferanten anlegen (idempotent über Namen-Check) ──────────────────

INSERT INTO suppliers (name)
SELECT 'Amazon'
 WHERE NOT EXISTS (SELECT 1 FROM suppliers WHERE name = 'Amazon');

INSERT INTO suppliers (name)
SELECT 'MediaMarkt'
 WHERE NOT EXISTS (SELECT 1 FROM suppliers WHERE name = 'MediaMarkt');


-- ─── 2) Eingabedaten als CTE — eine Zeile pro Excel-Eintrag ────────────────
-- Spalten:
--   inv_date     = Datum der Rechnung
--   supplier     = Lieferantenname (muss in suppliers existieren — siehe oben)
--   invoice_no   = Rechnungsnummer (vom Lieferanten)
--   typ          = Kategorie aus Excel (für Beschreibung in expenses)
--   product      = Produktbezeichnung
--   net_amt      = Netto, NULL wenn nicht ausgewiesen
--   tax_amt      = USt, NULL wenn nicht ausgewiesen
--   gross_amt    = Brutto-Endbetrag (immer gesetzt; bei Rueckzahlungen negativ)
--   is_refund    = TRUE = Rueckzahlung/Gutschrift (kein neuer purchases-Eintrag)
--   filename     = Dateiname (in notes zum Wiederfinden)

WITH input_data(inv_date, supplier, invoice_no, typ, product, net_amt, tax_amt, gross_amt, is_refund, filename) AS (
  VALUES
    -- ── Mai 2025 ──
    (DATE '2025-05-15', 'Amazon',     'DS-AEU-INV-DE-2025-226779778', 'Stativ/Halterung',  'Gahenwo Selfie-Stick-Stativ',                          NULL::numeric, NULL::numeric,  28.18::numeric, FALSE, '2025.05.15_Amazon_1.pdf'),
    (DATE '2025-05-15', 'Amazon',     'LU528Y2SQAEUI',                'Speicherkarte',     'SanDisk 128GB',                                        NULL,          NULL,           28.58,          FALSE, '2025.05.15_Amazon_2.pdf'),
    (DATE '2025-05-15', 'Amazon',     'DS-AEU-INV-DE-2025-227292716', 'Tasche/Koffer',     'LEKUFEE Hartschalenkoffer fuer DJI',                   NULL,          NULL,           33.14,          FALSE, '2025.05.15_Amazon_3.pdf'),
    (DATE '2025-05-16', 'Amazon',     'DS-AEU-INV-DE-2025-227635074', 'Filter/Objektiv',   'NEEWER ND/PL Filter Set fuer DJI Osmo Action',         NULL,          NULL,           39.09,          FALSE, '2025.05.16_Amazon_1.pdf'),
    (DATE '2025-05-16', 'Amazon',     'DS-AEU-INV-DE-2025-229086964', 'Mikrofon',          'Godox Cube-C Combo Kit2 Wireless Lavalier',            NULL,          NULL,          143.00,          FALSE, '2025.05.16_Amazon_2.pdf'),
    (DATE '2025-05-20', 'Amazon',     'DS-AEU-INV-DE-2025-234878055', 'Stativ/Halterung',  '53CM Stativ fuer Osmo Pocket 3 / GoPro',               NULL,          NULL,           25.99,          FALSE, '2025.05.20_Amazon_1.pdf'),
    (DATE '2025-05-20', 'Amazon',     'DS-AEU-INV-DE-2025-235168269', 'Zubehoer sonstiges','USB-C Kabel 20cm (Kamera-Ladung)',                     NULL,          NULL,            7.98,          FALSE, '2025.05.20_Amazon_2.pdf'),

    -- ── Juli 2025 ──
    (DATE '2025-07-21', 'Amazon',     'DS-AEU-INV-DE-2025-349089507', 'Schutz/Gehaeuse',   'AMAZEAR Displayschutzfolie DJI Osmo Action 5',         NULL,          NULL,            5.98,          FALSE, '2025.07.21_Amazon_1.pdf'),
    (DATE '2025-07-29', 'Amazon',     'DS-AEU-INV-DE-2025-362667346', 'Tasche/Koffer',     'Tomat Hartschalentasche fuer Osmo Action 5 Pro',       NULL,          NULL,           29.24,          FALSE, '2025.07.29_Amazon_1.pdf'),
    (DATE '2025-07-29', 'Amazon',     'DS-AEU-INV-DE-2025-362667491', 'Zubehoer sonstiges','ShipeeKin Zubehoer-Set fuer DJI Osmo Action 5 Pro',    NULL,          NULL,           24.99,          FALSE, '2025.07.29_Amazon_2.pdf'),

    -- ── August 2025 ──
    (DATE '2025-08-19', 'Amazon',     'DS-AEU-INV-DE-2025-399726712', 'Filter/Objektiv',   'K&F Concept ND & CPL Filter Set fuer GoPro',           NULL,          NULL,           36.99,          FALSE, '2025.08.19_Amazon_1.pdf'),
    (DATE '2025-08-19', 'Amazon',     'DS-AEU-INV-DE-2025-398575631', 'Zubehoer sonstiges','PULUZ Fotobox 30x30x30 cm (Produktfotos)',             NULL,          NULL,           32.29,          FALSE, '2025.08.19_Amazon_2.pdf'),
    (DATE '2025-08-19', 'Amazon',     'DS-AEU-INV-DE-2025-399608090', 'Stativ/Halterung',  'UNSTINCER Action-Kamera-Halterung',                    NULL,          NULL,           23.99,          FALSE, '2025.08.19_Amazon_3.pdf'),
    (DATE '2025-08-19', 'Amazon',     'LU53Y2OGMAEUI',                'Schutz/Gehaeuse',   'Amazon Basics Schutzhuelle (klein) fuer GoPro/Action', NULL,          NULL,           20.48,          FALSE, '2025.08.19_Amazon_4.pdf'),
    (DATE '2025-08-19', 'MediaMarkt', '8207323059',                   'Speicherkarte',     '2x SanDisk Extreme PRO microSDXC 512GB',               97.46,         18.52,         115.98,          FALSE, '2025.08.19_MediaMarkt.pdf'),
    (DATE '2025-08-20', 'Amazon',     'DS-AEU-INV-DE-2025-400454703', 'Zubehoer sonstiges','DIKER 70-in-1 Zubehoer-Set Action-Cam',                NULL,          NULL,           36.98,          FALSE, '2025.08.20_Amazon_1.pdf'),
    (DATE '2025-08-20', 'Amazon',     'DE52WKCP1AEUI',                'Akku/Ladung',       'GoPro Dual-Ladegeraet + 2 Enduro-Akkus HERO13',        NULL,          NULL,           70.97,          FALSE, '2025.08.20_Amazon_2.pdf'),
    (DATE '2025-08-20', 'Amazon',     'DS-AEU-INV-DE-2025-400999507', 'Tasche/Koffer',     'Coengwui Schaumstoffeinlagen Pick-and-Pluck',          NULL,          NULL,           44.00,          FALSE, '2025.08.20_Amazon_3.pdf'),
    (DATE '2025-08-20', 'Amazon',     'RE41369872',                   'Tasche/Koffer',     'HMF ODK100 Outdoor-Fotokoffer (Rasterschaumstoff)',    20.15,         3.83,           23.98,          FALSE, '2025.08.20_Amazon_4.pdf'),
    (DATE '2025-08-20', 'Amazon',     'DE52W8RP8AEUI',                'Tasche/Koffer',     'PeakTech P 7310 Universalkoffer',                      NULL,          NULL,           43.98,          FALSE, '2025.08.20_Amazon_5.pdf'),
    (DATE '2025-08-20', 'Amazon',     'DE52W8SC6AEUI',                'Tasche/Koffer',     'PeakTech P 7310 Universalkoffer',                      NULL,          NULL,           43.98,          FALSE, '2025.08.20_Amazon_6.pdf'),
    (DATE '2025-08-20', 'Amazon',     'DE52W8SI1AEUI',                'Tasche/Koffer',     'PeakTech P 7310 Universalkoffer',                      NULL,          NULL,           43.98,          FALSE, '2025.08.20_Amazon_7.pdf'),
    (DATE '2025-08-20', 'Amazon',     'DS-AEU-INV-DE-2025-399867571', 'Schutz/Gehaeuse',   'OKFUN Wasserdichtes Gehaeuse GoPro Hero',              NULL,          NULL,           27.99,          FALSE, '2025.08.20_Amazon_8.pdf'),

    -- ── Rueckzahlungen (negative expenses, kein neuer purchase) ──
    (DATE '2025-08-20', 'Amazon',     'DE52W8SC6AEUI',                'Tasche/Koffer',     'PeakTech P 7310 — Rueckzahlung',                       NULL,          NULL,          -43.98,          TRUE,  '2025.08.20_Amazon_Rueckzahlung_1.pdf'),
    (DATE '2025-08-22', 'Amazon',     'DS-AEU-INV-DE-2025-400454703', 'Zubehoer sonstiges','DIKER 70-in-1 — Rueckzahlung',                         NULL,          NULL,          -36.98,          TRUE,  '2025.08.22_Amazon_Rueckzahlung_1.pdf'),

    (DATE '2025-08-29', 'Amazon',     'DS-AEU-INV-DE-2025-416309278', 'Tasche/Koffer',     'SYMIK Tasche fuer Insta360 X5 / X4',                   NULL,          NULL,           23.99,          FALSE, '2025.08.29_Amazon_1.pdf'),
    (DATE '2025-08-29', 'Amazon',     'DE52K5VLAEUD',                 'Akku/Ladung',       'Insta360 X5 Utility Fast-Charge-Case',                 NULL,          NULL,           72.39,          FALSE, '2025.08.29_Amazon_2.pdf'),
    (DATE '2025-08-29', 'Amazon',     'DS-AEU-INV-DE-2025-415815679', 'Schutz/Gehaeuse',   'PULUZ 60 m Tauchhuelle fuer Insta360 X5',              NULL,          NULL,           79.99,          FALSE, '2025.08.29_Amazon_3.pdf'),

    -- ── September 2025 ──
    (DATE '2025-09-11', 'Amazon',     'LU54D9K0FAEUI',                'Reinigung',         'AF Utility Druckluftspray',                            NULL,          NULL,            9.99,          FALSE, '2025.09.11_Amazon_1.pdf'),
    (DATE '2025-09-15', 'Amazon',     'LU54EQO4UAEUI',                'Speicherkarte',     'SanDisk Extreme PRO microSDXC 64GB + Adapter',         NULL,          NULL,           32.37,          FALSE, '2025.09.15_Amazon_1.pdf')
),

-- ─── 3) NEUE Rechnungen anlegen (nicht-Rueckzahlungen) ──────────────────────

new_purchases AS (
  INSERT INTO purchases (
    supplier_id,
    order_date,
    invoice_date,
    invoice_number,
    total_amount,
    net_amount,
    tax_amount,
    status,
    notes,
    is_test
  )
  SELECT
    s.id,
    i.inv_date,
    i.inv_date,
    i.invoice_no,
    i.gross_amt,
    i.net_amt,
    i.tax_amt,
    'delivered',
    'Auto-Import 2025-Excel · ' || i.filename,
    FALSE                                                 -- is_test = FALSE (echte Daten)
  FROM input_data i
  JOIN suppliers s ON s.name = i.supplier
  WHERE i.is_refund = FALSE
    AND NOT EXISTS (
      SELECT 1 FROM purchases p
       WHERE p.invoice_number = i.invoice_no
         AND p.total_amount = i.gross_amt
    )
  RETURNING id, invoice_number, total_amount
),

-- ─── 4) Eine Position pro Rechnung schreiben ───────────────────────────────

new_items AS (
  INSERT INTO purchase_items (
    purchase_id,
    product_name,
    quantity,
    unit_price,
    classification,
    net_price,
    tax_rate
  )
  SELECT
    np.id,
    i.product,
    1,
    i.gross_amt,
    'expense',                                            -- direkt als Ausgabe klassifiziert
    COALESCE(i.net_amt, i.gross_amt),                     -- Kleinunternehmer: net=brutto wenn nicht ausgewiesen
    CASE
      WHEN i.tax_amt IS NOT NULL AND i.net_amt IS NOT NULL AND i.net_amt > 0
        THEN ROUND((i.tax_amt / i.net_amt) * 100, 2)      -- aus Rechnung errechnet
      ELSE 0
    END
  FROM new_purchases np
  JOIN input_data i ON i.invoice_no = np.invoice_number
                   AND i.gross_amt = np.total_amount
                   AND i.is_refund = FALSE
  RETURNING id, purchase_id
),

-- ─── 5) Expenses fuer Original-Rechnungen ──────────────────────────────────

new_expenses_original AS (
  INSERT INTO expenses (
    expense_date,
    category,
    description,
    vendor,
    net_amount,
    tax_amount,
    gross_amount,
    payment_method,
    notes,
    source_type,
    source_id,
    is_test
  )
  SELECT
    i.inv_date,
    'hardware',                                           -- alle Eintraege Vermiet-Equipment
    i.typ || ' · ' || i.product,
    i.supplier,
    i.gross_amt,                                          -- Kleinunternehmer: net = brutto
    0,                                                    -- Kleinunternehmer: Vorsteuer nicht abziehbar
    i.gross_amt,
    'card',
    'Auto-Import 2025-Excel · Rechnung ' || i.invoice_no || ' · ' || i.filename,
    'purchase_invoice',
    i.invoice_no,
    FALSE                                                 -- is_test = FALSE (echte Daten)
  FROM input_data i
  JOIN new_purchases np ON np.invoice_number = i.invoice_no
                       AND np.total_amount = i.gross_amt
  WHERE i.is_refund = FALSE
    AND NOT EXISTS (
      SELECT 1 FROM expenses e
       WHERE e.source_type = 'purchase_invoice'
         AND e.source_id = i.invoice_no
         AND e.gross_amount = i.gross_amt
    )
  RETURNING id, source_id
),

-- ─── 6) Expenses fuer Rueckzahlungen (negative Betraege) ───────────────────

new_expenses_refund AS (
  INSERT INTO expenses (
    expense_date,
    category,
    description,
    vendor,
    net_amount,
    tax_amount,
    gross_amount,
    payment_method,
    notes,
    source_type,
    source_id,
    is_test
  )
  SELECT
    i.inv_date,
    'hardware',
    i.typ || ' · ' || i.product,
    i.supplier,
    i.gross_amt,                                          -- bereits negativ
    0,
    i.gross_amt,
    'card',
    'Auto-Import 2025-Excel · Rueckzahlung zu Rechnung ' || i.invoice_no || ' · ' || i.filename,
    'purchase_invoice',
    i.invoice_no || '_REFUND',                            -- eindeutiger Schluessel
    TRUE
  FROM input_data i
  WHERE i.is_refund = TRUE
    AND NOT EXISTS (
      SELECT 1 FROM expenses e
       WHERE e.source_type = 'purchase_invoice'
         AND e.source_id = i.invoice_no || '_REFUND'
    )
  RETURNING id, source_id
)

-- ─── 7) Zusammenfassung ausgeben ────────────────────────────────────────────

SELECT
  (SELECT COUNT(*) FROM new_purchases)        AS rechnungen_angelegt,
  (SELECT COUNT(*) FROM new_items)            AS positionen_angelegt,
  (SELECT COUNT(*) FROM new_expenses_original) AS ausgaben_angelegt,
  (SELECT COUNT(*) FROM new_expenses_refund)  AS rueckzahlungen_angelegt,
  (SELECT ROUND(SUM(gross_amt), 2)
     FROM input_data
    WHERE is_refund = FALSE)                  AS summe_brutto_original,
  (SELECT ROUND(SUM(gross_amt), 2)
     FROM input_data
    WHERE is_refund = TRUE)                   AS summe_brutto_rueckzahlung,
  (SELECT ROUND(SUM(gross_amt), 2)
     FROM input_data)                         AS summe_brutto_netto;

COMMIT;

-- ════════════════════════════════════════════════════════════════════════════
-- Erwartete Ausgabe (beim ersten Lauf):
--   rechnungen_angelegt:        28
--   positionen_angelegt:        28
--   ausgaben_angelegt:          28
--   rueckzahlungen_angelegt:     2
--   summe_brutto_original:    2199.91
--   summe_brutto_rueckzahlung: -80.96
--   summe_brutto_netto:       2118.95   <-- entspricht Excel-Summe
--
-- Bei zweitem Lauf alle 4 _angelegt-Counter = 0 (alles schon da, idempotent).
-- ════════════════════════════════════════════════════════════════════════════
