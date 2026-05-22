-- Verfuegbarkeits-Alerts (Stand 2026-05-20)
--
-- Pro Kunden-Block-Event ein Eintrag, mit 24h-Dedupe (gleiche
-- Kombination Kamera+Zeitraum+Typ wird hochgezaehlt statt neu eingefuegt).
-- Wird vom Buchungs-Wizard genullt, sobald der Kunde wirklich gebucht hat,
-- oder vom Admin manuell als "erledigt" markiert.
--
-- Genutzt von:
--   - POST /api/availability-alerts      (Kunden-Side, beim Block)
--   - GET  /api/admin/availability-alerts (Dashboard-Banner)
--   - POST /api/admin/availability-alerts/[id]/resolve
--
-- Idempotent.

CREATE TABLE IF NOT EXISTS availability_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- 'no_basic_set'           = fuer die Kamera ist kein Basis-Set konfiguriert
  -- 'basic_set_unavailable'  = Basis-Set ist im gewuenschten Zeitraum ausgebucht
  -- 'set_unavailable'        = ein nicht-Basis-Set ist im Zeitraum ausgebucht (Tracking)
  -- 'accessory_unavailable'  = Zubehoer ist im Zeitraum ausgebucht
  alert_type TEXT NOT NULL CHECK (alert_type IN ('no_basic_set','basic_set_unavailable','set_unavailable','accessory_unavailable')),
  product_id TEXT,
  product_name TEXT,
  set_id TEXT,
  set_name TEXT,
  accessory_id TEXT,
  accessory_name TEXT,
  rental_from DATE,
  rental_to DATE,
  customer_user_id UUID,
  customer_email TEXT,
  occurrence_count INTEGER NOT NULL DEFAULT 1,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  resolved_by UUID,
  resolved_note TEXT,
  is_test BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_availability_alerts_open
  ON availability_alerts(last_seen_at DESC)
  WHERE resolved_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_availability_alerts_dedupe
  ON availability_alerts(alert_type, product_id, set_id, accessory_id, rental_from, rental_to)
  WHERE resolved_at IS NULL;

-- RLS: nur service-role darf lesen/schreiben (Endpoints nutzen Service-Client).
ALTER TABLE availability_alerts ENABLE ROW LEVEL SECURITY;
