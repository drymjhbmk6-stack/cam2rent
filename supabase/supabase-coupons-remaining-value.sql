-- ────────────────────────────────────────────────────────────────────────────
-- Wertgutschein mit Restguthaben
-- ────────────────────────────────────────────────────────────────────────────
--
-- Bisher wurde ein Festbetrags-Gutschein (type='fixed') pro Bestellung auf den
-- Bestellwert gedeckelt (Math.min(value, baseAmount)) — der ungenutzte Rest
-- verfiel. Beispiel: 75-€-Gutschein, Bestellung 40 € → 35 € waren weg.
--
-- Neu: optionale Spalte `remaining_value`. Ist sie gesetzt (NOT NULL), traegt
-- der Gutschein ein Restguthaben, das ueber mehrere Bestellungen hinweg
-- aufgebraucht wird — wie eine Geschenkkarte. NULL = altes Verhalten
-- unveraendert (Bestand + neu angelegte Prozent-Gutscheine).
--
-- Aktiviert wird das Tracking nur explizit im Admin (`/admin/gutscheine`,
-- Checkbox "Restguthaben") fuer Festbetrags-Gutscheine — nicht automatisch,
-- damit geteilte Rabattcodes (viele Kunden, ein Code) ihr bisheriges
-- Verhalten behalten (kein gemeinsam geteilter Guthaben-Topf).
--
-- Verwendung aus dem Node-Code:
--   const { data } = await supabase.rpc('redeem_coupon_balance', {
--     p_code: 'GESCHENK75', p_amount: 40.0,
--   });
--   if (!data || !data[0]?.applied) { /* kein Restguthaben mehr */ }
-- ────────────────────────────────────────────────────────────────────────────

ALTER TABLE coupons ADD COLUMN IF NOT EXISTS remaining_value NUMERIC NULL;

COMMENT ON COLUMN coupons.remaining_value IS
  'Restguthaben in EUR fuer Festbetrags-Gutscheine (type=fixed). NULL = kein Guthaben-Tracking (Legacy-Verhalten: pro Bestellung auf value gedeckelt, Rest verfaellt). Wird bei jeder Einloesung um den tatsaechlich verwendeten Betrag reduziert.';

-- Atomare Einloesung: sperrt die Zeile (FOR UPDATE), prueft aktives/gueltiges
-- Guthaben > 0, zieht den tatsaechlich verwendeten Betrag ab (nie unter 0) und
-- erhoeht used_count fuers Reporting. Race-sicher wie increment_coupon_if_available.
CREATE OR REPLACE FUNCTION public.redeem_coupon_balance(p_code TEXT, p_amount NUMERIC)
RETURNS TABLE(coupon_id UUID, applied BOOLEAN, remaining_value NUMERIC)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
  v_remaining NUMERIC;
  v_active BOOLEAN;
  v_amount NUMERIC;
BEGIN
  SELECT id, c.remaining_value, c.active
    INTO v_id, v_remaining, v_active
    FROM coupons c
   WHERE LOWER(c.code) = LOWER(p_code)
   FOR UPDATE;

  IF v_id IS NULL OR v_remaining IS NULL THEN
    -- Kein Coupon mit diesem Code oder kein Guthaben-Tracking aktiv.
    RETURN;
  END IF;

  IF NOT COALESCE(v_active, TRUE) OR v_remaining <= 0 THEN
    coupon_id := v_id; applied := FALSE; remaining_value := v_remaining;
    RETURN NEXT; RETURN;
  END IF;

  v_amount := GREATEST(0, COALESCE(p_amount, 0));

  UPDATE coupons
     SET remaining_value = GREATEST(0, v_remaining - v_amount),
         used_count = used_count + 1
   WHERE id = v_id
   RETURNING coupons.remaining_value INTO v_remaining;

  coupon_id := v_id;
  applied := TRUE;
  remaining_value := v_remaining;
  RETURN NEXT;
END;
$$;

-- Nur Service-Role darf die Funktion aufrufen
REVOKE ALL ON FUNCTION public.redeem_coupon_balance(TEXT, NUMERIC) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.redeem_coupon_balance(TEXT, NUMERIC) TO service_role;
