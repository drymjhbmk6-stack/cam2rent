-- ============================================================
-- Verlegung: Zubehoer-Zuweisungs-RPC schliesst 'postponed' aus
-- Erstellt: 2026-07-26
-- ============================================================
--
-- Vorlage: erledigte supabase/supabase-accessory-unit-assignment-lock.sql
-- Aenderung: Die Negations-Liste, die bestimmt welche Buchung ein
-- Zubehoer-Exemplar belegt, wird um 'postponed' erweitert. Damit gibt eine
-- "auf unbestimmte Zeit" verlegte Buchung ihre Zubehoer-Exemplare wieder frei
-- (Kameras sind bereits frei, weil 'postponed' nicht in den Positiv-Listen der
-- Kamera-RPCs steht).
--
-- Idempotent (CREATE OR REPLACE FUNCTION).
-- ============================================================

CREATE OR REPLACE FUNCTION assign_free_accessory_units(
  p_accessory_id text,
  p_qty integer,
  p_rental_from date,
  p_rental_to date,
  p_booking_id text
) RETURNS uuid[]
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_assigned uuid[] := ARRAY[]::uuid[];
  v_unit_id uuid;
BEGIN
  IF p_qty IS NULL OR p_qty <= 0 THEN
    RETURN v_assigned;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('accessory_unit_assign:' || p_accessory_id));

  FOR v_unit_id IN
    SELECT u.id
    FROM accessory_units u
    WHERE u.accessory_id = p_accessory_id
      AND u.status IN ('available', 'rented')
      AND NOT EXISTS (
        SELECT 1 FROM bookings b
        WHERE u.id = ANY(b.accessory_unit_ids)
          AND b.id <> p_booking_id
          AND b.status NOT IN ('cancelled', 'completed', 'returned', 'postponed')
          AND b.rental_from <= p_rental_to
          AND b.rental_to   >= p_rental_from
      )
    ORDER BY u.purchased_at ASC NULLS LAST, u.created_at ASC, u.id
    LIMIT p_qty
  LOOP
    v_assigned := array_append(v_assigned, v_unit_id);
  END LOOP;

  IF COALESCE(array_length(v_assigned, 1), 0) < p_qty THEN
    RETURN ARRAY[]::uuid[];
  END IF;

  UPDATE bookings
  SET accessory_unit_ids = COALESCE(accessory_unit_ids, '{}'::uuid[]) || v_assigned
  WHERE id = p_booking_id;

  UPDATE accessory_units
  SET status = 'rented'
  WHERE id = ANY(v_assigned);

  RETURN v_assigned;
END;
$$;

-- Sicherheit (Audit-Befund K-3, Migration supabase-sec-01-function-grants.sql):
-- KEIN `TO authenticated` mehr. Die Funktion ist SECURITY DEFINER, umgeht damit die
-- RLS von `bookings` und prüft `auth.uid()` nicht — mit Ausführungsrecht für
-- `authenticated` konnte jeder eingeloggte Kunde über eine erratbare Buchungsnummer
-- fremde Buchungen ändern und den Gerätepool blockieren.
-- Alle Aufrufer im Code nutzen die Service-Role (lib/accessory-unit-assignment.ts:78).
GRANT EXECUTE ON FUNCTION assign_free_accessory_units(text, integer, date, date, text)
  TO service_role;
REVOKE ALL ON FUNCTION assign_free_accessory_units(text, integer, date, date, text)
  FROM PUBLIC, anon, authenticated;
ALTER FUNCTION assign_free_accessory_units(text, integer, date, date, text)
  SET search_path = public;
