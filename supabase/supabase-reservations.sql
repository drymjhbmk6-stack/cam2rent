-- ════════════════════════════════════════════════════════════════════════
-- reservations — admin-erstellte 48-Stunden-Reservierungen (Self-Service)
-- ════════════════════════════════════════════════════════════════════════
--
-- Ein Bestandskunde ruft an. Der Admin reserviert Kamera + Zubehoer fuer einen
-- Zeitraum und schickt dem Kunden einen Link. Der Kunde oeffnet den Link (in
-- seinem Konto eingeloggt), bekommt die reservierte Auswahl in den Warenkorb
-- gelegt, kann ALLES aendern (Kamera, Zubehoer, Zeitraum) und zahlt am Ende den
-- dann gueltigen Preis ueber den normalen Checkout.
--
-- Die Reservierung ist ein zeitlich begrenzter Inventar-HOLD (analog cart_holds,
-- aber admin-erzeugt, 48h statt 30min, fuer Kamera UND Zubehoer). Solange sie
-- `open` und nicht abgelaufen ist, blockiert sie das Inventar fuer ANDERE Kunden
-- (der eigene Kunde wird ueber excludeUserId ausgeblendet). Bei Abschluss
-- (status='completed') oder Ablauf (expires_at < now, status='expired') gibt sie
-- das Inventar wieder frei.
--
-- items JSONB-Form:
--   { "lines": [ { "productId": "gopro13",
--                  "qty": 1,
--                  "haftung": "standard",
--                  "accessories": [ { "accessory_id": "akku", "qty": 2 } ] } ] }
--
-- Alle Zugriffe laufen ueber Service-Client-APIs. Bei fehlender Migration sind
-- die zugehoerigen Helper (lib/reservation-holds.ts) defensive No-Ops.
--
-- Idempotent.

CREATE TABLE IF NOT EXISTS reservations (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Unguessbarer Token fuer den Kunden-Link /reservierung/<token>.
  token          TEXT NOT NULL,
  -- Bestandskunde (auth.users.id). Der Link funktioniert nur fuer diesen User.
  user_id        UUID NOT NULL,
  customer_name  TEXT,
  customer_email TEXT,
  -- Reservierte Auswahl (siehe items-Form oben).
  items          JSONB NOT NULL DEFAULT '{}'::jsonb,
  rental_from    DATE NOT NULL,
  rental_to      DATE NOT NULL,
  delivery_mode  TEXT NOT NULL DEFAULT 'versand',
  shipping_method TEXT NOT NULL DEFAULT 'standard',
  -- Test-Isolation: Reservierungen im Test-Modus blocken den Live-Kalender nicht.
  is_test        BOOLEAN NOT NULL DEFAULT FALSE,
  -- open → completed (Kunde hat gebucht) | expired (48h vorbei) | cancelled (Admin).
  status         TEXT NOT NULL DEFAULT 'open'
                   CHECK (status IN ('open', 'completed', 'expired', 'cancelled')),
  expires_at     TIMESTAMPTZ NOT NULL,
  created_by     TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Token eindeutig → Link-Lookup.
CREATE UNIQUE INDEX IF NOT EXISTS reservations_token_idx ON reservations (token);

-- Aktive Reservierungen im Zeitraum (Verfuegbarkeits-Lookups).
CREATE INDEX IF NOT EXISTS reservations_status_expires_idx
  ON reservations (status, expires_at);

-- Reservierungen eines Users (Landing + releaseUserReservations).
CREATE INDEX IF NOT EXISTS reservations_user_status_idx
  ON reservations (user_id, status);

-- Zeitraum-Overlap-Filter.
CREATE INDEX IF NOT EXISTS reservations_period_idx
  ON reservations (rental_from, rental_to);

-- RLS: nur Service-Role (alle Zugriffe laufen ueber API mit Service-Client).
ALTER TABLE reservations ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'reservations'
      AND policyname = 'reservations_service_role_all'
  ) THEN
    CREATE POLICY reservations_service_role_all ON reservations
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END$$;
