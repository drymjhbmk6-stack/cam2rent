-- ============================================================================
-- DIAGNOSE (nur lesend): Buchungen, deren Einzelposten nicht zum tatsaechlich
-- gezahlten Betrag passen.
--
-- Hintergrund: Bis zum Fix vom 2026-08-29 summierten EÜR, DATEV und der
-- Monatsabschluss die Einzelposten
--   price_rental + price_accessories + price_haftung + shipping_price
--   − discount_amount − duration_discount − loyalty_discount
--   − early_bird_discount − special_discount
-- statt `price_total`. Traegt kein Rabatt-Feld die Differenz, buchte die EÜR
-- mehr Einnahme als geflossen ist (die Rechnung weist die Luecke als
-- "Set-Bundle / Anpassung" aus).
--
-- Die Reports rechnen inzwischen auf `price_total` normiert — diese Abfrage
-- zeigt nur noch, WELCHE Buchungen die inkonsistenten Felder tragen (fuer die
-- Nachvollziehbarkeit; ein Daten-Reparatur-Bedarf besteht nicht).
--
-- Ausfuehren im Supabase SQL-Editor. Aendert nichts.
-- ============================================================================

WITH b AS (
  SELECT
    id,
    (created_at AT TIME ZONE 'Europe/Berlin')::date AS datum,
    product_name,
    status,
    payment_intent_id,
    COALESCE(price_total, 0)                                    AS gezahlt,
    COALESCE(price_rental, 0) + COALESCE(price_accessories, 0)
      + COALESCE(price_haftung, 0) + COALESCE(shipping_price, 0)
      - COALESCE(discount_amount, 0) - COALESCE(duration_discount, 0)
      - COALESCE(loyalty_discount, 0) - COALESCE(early_bird_discount, 0)
      - COALESCE(special_discount, 0)                           AS posten_summe
  FROM bookings
  WHERE is_test = false
    AND status NOT IN ('cancelled', 'awaiting_payment', 'pending_verification')
)
SELECT
  id,
  datum,
  product_name,
  status,
  posten_summe,
  gezahlt,
  ROUND((posten_summe - gezahlt)::numeric, 2) AS differenz
FROM b
WHERE ABS(posten_summe - gezahlt) > 0.02
ORDER BY ABS(posten_summe - gezahlt) DESC;

-- Summe der Abweichung pro Jahr (= so viel Umsatz hat die alte EÜR zu viel
-- bzw. zu wenig ausgewiesen):
--
-- WITH b AS ( ... wie oben ... )
-- SELECT EXTRACT(YEAR FROM datum) AS jahr,
--        COUNT(*) FILTER (WHERE ABS(posten_summe - gezahlt) > 0.02) AS betroffen,
--        ROUND(SUM(posten_summe - gezahlt)::numeric, 2) AS differenz_gesamt
-- FROM b GROUP BY 1 ORDER BY 1;
