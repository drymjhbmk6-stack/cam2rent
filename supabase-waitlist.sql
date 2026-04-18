-- ────────────────────────────────────────────────────────────────────────────
-- Warteliste: Interessenten-Registrierung für Kameras ohne Seriennummern
-- ────────────────────────────────────────────────────────────────────────────
-- Wenn für eine Kamera (noch) keine Seriennummer / product_unit hinterlegt
-- ist, zeigt der Shop statt "Jetzt mieten" einen "Benachrichtige mich"-
-- Button. Interessenten können ihre E-Mail hinterlegen — die Einträge
-- landen in dieser Tabelle, damit der Admin das Interesse an Kameras
-- testen kann, bevor er sie einkauft.
--
-- Der UNIQUE-Index verhindert Doppeleinträge (gleiche Email + gleiches
-- Produkt). E-Mails werden beim Insert lowercased, damit "Max@Mail.de"
-- und "max@mail.de" nicht doppelt zählen.

CREATE TABLE IF NOT EXISTS waitlist_subscriptions (
  id           UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id   TEXT         NOT NULL,
  email        TEXT         NOT NULL,
  source       TEXT,                        -- z.B. 'card', 'detail'
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
  notified_at  TIMESTAMPTZ,                 -- gesetzt wenn Interessent benachrichtigt wurde
  UNIQUE (product_id, email)
);

CREATE INDEX IF NOT EXISTS waitlist_subscriptions_product_id_idx
  ON waitlist_subscriptions (product_id);

CREATE INDEX IF NOT EXISTS waitlist_subscriptions_created_at_idx
  ON waitlist_subscriptions (created_at DESC);

-- RLS: Tabelle wird nur vom Service-Role-Key beschrieben/gelesen (API-Route
-- + Admin). Anonyme Zugriffe sind nicht erlaubt — die Einträge sind
-- personenbezogene Daten (DSGVO).
ALTER TABLE waitlist_subscriptions ENABLE ROW LEVEL SECURITY;

-- Kein PUBLIC SELECT/INSERT/UPDATE/DELETE — nur Service-Role.
