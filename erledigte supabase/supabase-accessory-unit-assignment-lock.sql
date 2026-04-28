-- ============================================================
-- Race-sichere Zuweisung von Zubehoer-Exemplaren
-- Erstellt: 2026-04-28
-- ============================================================
--
-- Voraussetzung: supabase-accessory-units.sql wurde ausgefuehrt.
--
-- Analog supabase-unit-assignment-lock.sql (Kameras / product_units).
-- Unterschied: Kann mehrere Exemplare gleichzeitig zuweisen (qty > 1),
-- weil Zubehoer typischerweise in Mengen gebucht wird (z.B. 2 Akkus).
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
  -- Defensiv: Bei qty <= 0 sofort leeres Array zurueckgeben
  IF p_qty IS NULL OR p_qty <= 0 THEN
    RETURN v_assigned;
  END IF;

  -- Advisory-Lock pro accessory_id fuer die Dauer der Transaktion.
  -- Zwei parallele Buchungen desselben Zubehoers warten aufeinander,
  -- damit nicht beide das letzte verfuegbare Exemplar bekommen.
  PERFORM pg_advisory_xact_lock(hashtext('accessory_unit_assign:' || p_accessory_id));

  -- Bis zu p_qty freie Units finden, FIFO nach purchased_at.
  -- 'available' und 'rented' sind beide zulaessig, sofern keine
  -- ueberlappende aktive Buchung das Exemplar belegt.
  -- 'damaged', 'lost', 'maintenance', 'retired' werden ausgeschlossen.
  FOR v_unit_id IN
    SELECT u.id
    FROM accessory_units u
    WHERE u.accessory_id = p_accessory_id
      AND u.status IN ('available', 'rented')
      AND NOT EXISTS (
        SELECT 1 FROM bookings b
        WHERE u.id = ANY(b.accessory_unit_ids)
          AND b.id <> p_booking_id
          AND b.status NOT IN ('cancelled', 'completed', 'returned')
          AND b.rental_from <= p_rental_to
          AND b.rental_to   >= p_rental_from
      )
    ORDER BY u.purchased_at ASC NULLS LAST, u.created_at ASC, u.id
    LIMIT p_qty
  LOOP
    v_assigned := array_append(v_assigned, v_unit_id);
  END LOOP;

  -- Wenn nicht genug freie Exemplare gefunden: leeres Array zurueck.
  -- Aufrufer muss reagieren (z.B. Buchung ablehnen oder ohne Unit-Zuweisung
  -- weiterlaufen lassen wie bisher).
  IF COALESCE(array_length(v_assigned, 1), 0) < p_qty THEN
    RETURN ARRAY[]::uuid[];
  END IF;

  -- Buchung aktualisieren: array_cat haengt an existierende accessory_unit_ids an,
  -- damit mehrere Zubehoer-Typen pro Buchung sauber akkumulieren.
  UPDATE bookings
  SET accessory_unit_ids = COALESCE(accessory_unit_ids, '{}'::uuid[]) || v_assigned
  WHERE id = p_booking_id;

  -- Status der Units auf 'rented' setzen
  UPDATE accessory_units
  SET status = 'rented'
  WHERE id = ANY(v_assigned);

  RETURN v_assigned;
END;
$$;

GRANT EXECUTE ON FUNCTION assign_free_accessory_units(text, integer, date, date, text)
  TO authenticated, service_role;
