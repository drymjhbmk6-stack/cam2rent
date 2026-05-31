-- ════════════════════════════════════════════════════════════════════════
-- cart_holds — zeitlich begrenzte Reservierungen aus dem Warenkorb
-- ════════════════════════════════════════════════════════════════════════
--
-- Sobald ein eingeloggter Kunde eine Kamera in den Warenkorb legt, wird der
-- gewaehlte Mietzeitraum fuer ALLE anderen Kunden serverseitig fuer 30 Minuten
-- reserviert (Hold). Laeuft die Buchung nicht durch, verfaellt der Hold
-- automatisch (expires_at < now()) und der Zeitraum ist wieder frei.
--
-- Der Hold blockt NUR andere Kunden — der eigene User sieht seine eigenen
-- Holds nicht als belegt (Filter per user_id in /api/availability).
--
-- Wird bei Buchungsabschluss / Warenkorb-Leeren / Item-Entfernen freigegeben.
--
-- Idempotent.

CREATE TABLE IF NOT EXISTS cart_holds (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL,
  -- Cart-Item-UUID (CartItem.id) — eindeutig pro Warenkorb-Position, damit
  -- ein erneuter Sync denselben Hold aktualisiert statt zu duplizieren.
  cart_item_id TEXT NOT NULL,
  product_id   TEXT NOT NULL,
  rental_from  DATE NOT NULL,
  rental_to    DATE NOT NULL,
  delivery_mode TEXT NOT NULL DEFAULT 'versand',
  -- Reine Anzeige/Debug: Produktname zum Zeitpunkt des Holds.
  product_name TEXT,
  -- Test-Isolation: Holds eines Tester-Users blocken den Live-Kalender nicht.
  is_test      BOOLEAN NOT NULL DEFAULT FALSE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Hold verfaellt nach 30 Min; bei jedem Sync neu gesetzt (gleitend).
  expires_at   TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '30 minutes')
);

-- Pro (user, cart_item) genau ein Hold → Upsert-Ziel.
CREATE UNIQUE INDEX IF NOT EXISTS cart_holds_user_item_idx
  ON cart_holds (user_id, cart_item_id);

-- Schnelle Verfuegbarkeits-Lookups: aktive Holds pro Produkt im Zeitraum.
CREATE INDEX IF NOT EXISTS cart_holds_product_active_idx
  ON cart_holds (product_id, expires_at);

CREATE INDEX IF NOT EXISTS cart_holds_expires_idx
  ON cart_holds (expires_at);

-- RLS: nur Service-Role (alle Zugriffe laufen ueber API mit Service-Client).
ALTER TABLE cart_holds ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'cart_holds'
      AND policyname = 'cart_holds_service_role_all'
  ) THEN
    CREATE POLICY cart_holds_service_role_all ON cart_holds
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END$$;
