-- Erweitert beleg_positionen.klassifizierung um den 5. Wert 'verbrauch'.
--
-- Hintergrund: bisher gab es nur afa | gwg | ausgabe | ignoriert | pending.
-- Verbrauchsmaterial unter 250 EUR netto (SD-Karten, ND-Filter, Schrauben,
-- Reinigungstuecher, Akkus < 250 EUR) ist steuerlich Ausgabe (sofortiger
-- Aufwand) — soll aber als Bulk- oder Individual-Inventar weitergefuehrt
-- werden, weil cam2rent das Material lagert und beim Versand mitpackt.
--
-- 'ausgabe' bleibt fuer Versand, Stripe-Gebuehren, Marketing, Versicherung,
-- Rabatte etc., die NIE als Inventar auftauchen sollen. Der Inventar-Picker
-- filtert ab jetzt auf afa+gwg+verbrauch, ausgabe taucht nicht mehr auf.
--
-- Idempotent: alter Constraint wird nur gedroppt, wenn er existiert.

DO $$
BEGIN
  -- Constraint kann unter verschiedenen Namen existieren (PG-Default oder
  -- explizit benannt) — wir suchen ihn ueber pg_constraint und droppen den
  -- ersten Treffer auf der Spalte klassifizierung.
  IF EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    WHERE t.relname = 'beleg_positionen'
      AND c.contype = 'c'
      AND pg_get_constraintdef(c.oid) ILIKE '%klassifizierung%'
      AND pg_get_constraintdef(c.oid) NOT ILIKE '%verbrauch%'
  ) THEN
    EXECUTE (
      SELECT 'ALTER TABLE beleg_positionen DROP CONSTRAINT ' || quote_ident(c.conname)
      FROM pg_constraint c
      JOIN pg_class t ON t.oid = c.conrelid
      WHERE t.relname = 'beleg_positionen'
        AND c.contype = 'c'
        AND pg_get_constraintdef(c.oid) ILIKE '%klassifizierung%'
        AND pg_get_constraintdef(c.oid) NOT ILIKE '%verbrauch%'
      LIMIT 1
    );
  END IF;
END $$;

-- Neuen Constraint mit 5 Werten anlegen, falls nicht schon vorhanden.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    WHERE t.relname = 'beleg_positionen'
      AND c.contype = 'c'
      AND pg_get_constraintdef(c.oid) ILIKE '%klassifizierung%'
      AND pg_get_constraintdef(c.oid) ILIKE '%verbrauch%'
  ) THEN
    ALTER TABLE beleg_positionen
      ADD CONSTRAINT beleg_positionen_klassifizierung_check
      CHECK (klassifizierung IN ('pending','afa','gwg','ausgabe','verbrauch','ignoriert'));
  END IF;
END $$;
