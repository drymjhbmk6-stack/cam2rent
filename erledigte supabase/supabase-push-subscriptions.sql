-- ────────────────────────────────────────────────────────────────────────────
-- Web Push Subscriptions für Admin-Geräte
-- ────────────────────────────────────────────────────────────────────────────
-- Speichert pro Gerät die VAPID-Subscription (endpoint + keys), damit das
-- Backend bei neuen Buchungen / Schäden / Anfragen Push-Notifications senden
-- kann (auch wenn die PWA gerade nicht offen ist).
--
-- Es gibt nur EIN Admin-Konto (Single-Admin via ADMIN_PASSWORD), daher kein
-- user_id-Mapping — Subscriptions sind global. Endpoint ist primärer Key,
-- damit bei Re-Subscription (z.B. nach Browser-Update) die alte Zeile
-- automatisch ersetzt wird.

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  endpoint    TEXT         NOT NULL UNIQUE,
  p256dh      TEXT         NOT NULL,
  auth        TEXT         NOT NULL,
  user_agent  TEXT,
  device_label TEXT,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
  last_used_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS push_subscriptions_created_at_idx
  ON push_subscriptions (created_at DESC);

-- RLS: Tabelle wird nur von Service-Role-Key beschrieben/gelesen (Admin-API).
-- Anonyme Lesezugriffe sind nicht erlaubt — die Endpoints/Keys sind
-- sensible Daten (jeder mit dem Endpoint+Keys kann Push senden).
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

-- Kein PUBLIC SELECT/INSERT/UPDATE/DELETE — nur Service-Role (Admin-API).
