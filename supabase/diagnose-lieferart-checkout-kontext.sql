-- Diagnose (rein lesend): Buchungen, deren gespeicherte Lieferart/Rabatte
-- vom verbindlichen Checkout-Kontext (admin_settings.checkout_<pi>) abweichen.
-- Hintergrund: confirm-cart hat bis 2026-10-10 den Browser-Kontext bevorzugt.
-- Ging der beim Stripe-Redirect verloren, wurde eine ABHOLUNG als VERSAND
-- gespeichert (Default) und der echte Rabatt + erfundene Versand landeten
-- zusammen in discount_amount.
WITH ctx AS (
  SELECT substring(s.key FROM 10) AS pi,
         CASE WHEN jsonb_typeof(s.value::jsonb) = 'string'
              THEN (s.value::jsonb #>> '{}')::jsonb
              ELSE s.value::jsonb END AS v
  FROM admin_settings s
  WHERE s.key LIKE 'checkout\_pi\_%'
)
SELECT b.id, b.created_at, b.customer_name,
       b.delivery_mode            AS gespeichert_lieferart,
       ctx.v->>'deliveryMode'     AS bezahlt_lieferart,
       b.shipping_price, b.price_total, b.discount_amount,
       ctx.v->>'productDiscount'  AS ctx_aktion,
       ctx.v->>'discountAmount'   AS ctx_gutschein,
       ctx.v->>'durationDiscount' AS ctx_mietdauer,
       ctx.v->>'loyaltyDiscount'  AS ctx_stammkunde
FROM bookings b
JOIN ctx ON ctx.pi = split_part(b.payment_intent_id, '_g', 1)
WHERE b.is_test = false
  AND b.delivery_mode IS DISTINCT FROM ctx.v->>'deliveryMode'
ORDER BY b.created_at DESC;

-- Reparatur einer betroffenen ABHOLUNG (Beispiel C2R-2641-001) — erst nach
-- Pruefung der Diagnose ausfuehren:
-- UPDATE bookings
--    SET delivery_mode = 'abholung',
--        shipping_method = NULL,
--        shipping_price = 0,
--        shipping_address = NULL,
--        discount_amount = GREATEST(0, ROUND((COALESCE(price_rental,0) + COALESCE(price_accessories,0)
--                          + COALESCE(price_haftung,0) - price_total)::numeric, 2))
--  WHERE id = 'C2R-2641-001';
