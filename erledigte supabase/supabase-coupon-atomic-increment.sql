-- ────────────────────────────────────────────────────────────────────────────
-- Atomic Coupon Increment (Race-Condition-Schutz)
-- ────────────────────────────────────────────────────────────────────────────
--
-- Problem: Die bisherige Coupon-Einlösung war ein SELECT-then-UPDATE-Pattern:
--
--   SELECT used_count FROM coupons WHERE code = X;
--   -- Race-Fenster: parallel läuft ein zweiter Checkout
--   UPDATE coupons SET used_count = <alter Wert> + 1 WHERE id = X;
--
-- Zwei parallele Confirm-Cart-Calls können so denselben 1-Use-Gutschein
-- zweimal verwenden, weil beide `used_count: 0` gelesen haben.
--
-- Fix: Eine SECURITY-DEFINER-Funktion, die mit FOR UPDATE auf der Zeile
-- sperrt, max_uses prüft und dann atomar inkrementiert. Gibt zurück, ob
-- die Einlösung erfolgreich war und wie viele Nutzungen noch übrig sind.
--
-- Verwendung aus dem Node-Code:
--   const { data } = await supabase.rpc('increment_coupon_if_available', { p_code: 'SOMMER25' });
--   if (!data || !data.applied) { /* nicht mehr einlösbar */ }
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.increment_coupon_if_available(p_code TEXT)
RETURNS TABLE(coupon_id UUID, applied BOOLEAN, used_count INT, max_uses INT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
  v_max INT;
  v_used INT;
  v_active BOOLEAN;
  v_valid_from TIMESTAMPTZ;
  v_valid_until TIMESTAMPTZ;
BEGIN
  -- Zeile mit Lock holen (FOR UPDATE serialisiert parallele Aufrufe).
  SELECT id, c.max_uses, c.used_count, c.active, c.valid_from, c.valid_until
    INTO v_id, v_max, v_used, v_active, v_valid_from, v_valid_until
    FROM coupons c
   WHERE LOWER(c.code) = LOWER(p_code)
   FOR UPDATE;

  IF v_id IS NULL THEN
    -- Kein Coupon mit diesem Code.
    RETURN;
  END IF;

  -- Grund-Plausibilität (inaktiv / abgelaufen / noch nicht gültig)
  IF NOT COALESCE(v_active, TRUE) THEN
    coupon_id := v_id; applied := FALSE; used_count := v_used; max_uses := v_max;
    RETURN NEXT; RETURN;
  END IF;
  IF v_valid_from IS NOT NULL AND v_valid_from > NOW() THEN
    coupon_id := v_id; applied := FALSE; used_count := v_used; max_uses := v_max;
    RETURN NEXT; RETURN;
  END IF;
  IF v_valid_until IS NOT NULL AND v_valid_until < NOW() THEN
    coupon_id := v_id; applied := FALSE; used_count := v_used; max_uses := v_max;
    RETURN NEXT; RETURN;
  END IF;

  -- max_uses-Check unter Lock
  IF v_max IS NOT NULL AND v_used >= v_max THEN
    coupon_id := v_id; applied := FALSE; used_count := v_used; max_uses := v_max;
    RETURN NEXT; RETURN;
  END IF;

  -- Alles OK → inkrementieren
  UPDATE coupons SET used_count = used_count + 1 WHERE id = v_id;

  coupon_id := v_id;
  applied := TRUE;
  used_count := v_used + 1;
  max_uses := v_max;
  RETURN NEXT;
END;
$$;

-- Nur Service-Role darf die Funktion aufrufen
REVOKE ALL ON FUNCTION public.increment_coupon_if_available(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.increment_coupon_if_available(TEXT) TO service_role;
