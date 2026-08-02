-- ════════════════════════════════════════════════════════════════════════
-- verbrauchsartikel — interner Verbraucher-Zähler (Verbrauchsmaterial)
-- ════════════════════════════════════════════════════════════════════════
--
-- Zähler für Dinge, die pro Versand/Abholung aufgebraucht werden und NICHT
-- vermietet werden (z.B. Gummibärchentüten, Füllmaterial). Reine interne
-- Bestandsführung — keine Kunden-Sichtbarkeit, keine Verfügbarkeits-/
-- Buchungslogik, kein Zusammenhang mit `accessories`/`inventar_units`.
--
--  - `bestand`        aktueller Zähler (manuell + Auto-Abzug)
--  - `auto_deduct`    automatisch abziehen (an/aus)
--  - `deduct_trigger` WANN: 'shipment' (Versand/Abholung) | 'return' (Rückgabe)
--  - `linked_accessory_ids` optional mit mehreren Zubehörteilen verknüpft (Abzug
--    nur wenn die Buchung eines davon enthält, skaliert nach Gesamt-Stückzahl)
--  - `notiz`           Freitext (z.B. Nachbestell-Link / Lieferant)
--  - `deduct_qty`     Menge, die pro Buchung (bzw. pro verknüpftem Stück) abgezogen wird
--  - `warn_threshold` Nachschub-Warnung ab diesem Mindestbestand (NULL = aus)
--  - `low_stock_notified` Dedup-Flag gegen Push-Spam (zurückgesetzt, sobald der
--    Bestand wieder über die Schwelle steigt)
--
-- Der Auto-Abzug läuft über den Shared-Helper `lib/verbrauch-deduct.ts`, der
-- pro Buchung EINMAL abzieht (atomarer Claim auf `bookings.consumables_deducted_at`,
-- Test-Buchungen ausgenommen).
--
-- Idempotent.

CREATE TABLE IF NOT EXISTS verbrauchsartikel (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name               TEXT NOT NULL,
  -- Aktueller Zähler. Auto-Abzug floored bei 0 (nie negativ).
  bestand            INTEGER NOT NULL DEFAULT 0,
  -- Bei Buchungs-Status shipped/picked_up automatisch abziehen.
  auto_deduct        BOOLEAN NOT NULL DEFAULT FALSE,
  -- Menge, die pro Buchung abgezogen wird (>= 1).
  deduct_qty         INTEGER NOT NULL DEFAULT 1 CHECK (deduct_qty >= 1),
  -- Nachschub-Warnung ab diesem Mindestbestand (NULL = keine Warnung).
  warn_threshold     INTEGER,
  -- Dedup gegen Push-Spam: wird true beim Warnen, false sobald Bestand wieder
  -- über die Schwelle steigt.
  low_stock_notified BOOLEAN NOT NULL DEFAULT FALSE,
  -- Wann der Auto-Abzug greift: 'shipment' (bei Versand/Abholung, Default) oder
  -- 'return' (bei Rückgabe = Buchung abgeschlossen). NICHT `trigger` genannt —
  -- das ist ein reserviertes Postgres-Keyword.
  deduct_trigger     TEXT NOT NULL DEFAULT 'shipment',
  -- Optionale Verknüpfung mit Zubehör (accessories.id-Liste). Gesetzt → der
  -- Abzug greift nur für Buchungen, die MINDESTENS EINES dieser Zubehörteile
  -- enthalten, und skaliert mit der Gesamt-Stückzahl aller verknüpften Teile
  -- (z.B. Klebepad ↔ mehrere Halterungs-Typen: 2 Halterungen zurück = 2× Abzug).
  -- Leer = pauschal einmal pro Buchung.
  linked_accessory_ids TEXT[] NOT NULL DEFAULT '{}',
  -- Legacy-Einzelfeld (Vorgänger von linked_accessory_ids). Nur noch als Fallback
  -- gelesen, wenn linked_accessory_ids leer ist. Kein Schreibpfad mehr.
  linked_accessory_id TEXT,
  -- Optionales Referenz-Foto (öffentliche URL im Bucket product-images).
  image_url          TEXT,
  -- Freitext-Notiz (z.B. Nachbestell-Link / Lieferant).
  notiz              TEXT,
  sort_order         INTEGER NOT NULL DEFAULT 0,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Additiv für bereits existierende Tabellen (Migration erneut ausführbar).
ALTER TABLE verbrauchsartikel ADD COLUMN IF NOT EXISTS deduct_trigger TEXT NOT NULL DEFAULT 'shipment';
ALTER TABLE verbrauchsartikel ADD COLUMN IF NOT EXISTS linked_accessory_id TEXT;
ALTER TABLE verbrauchsartikel ADD COLUMN IF NOT EXISTS linked_accessory_ids TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE verbrauchsartikel ADD COLUMN IF NOT EXISTS image_url TEXT;
ALTER TABLE verbrauchsartikel ADD COLUMN IF NOT EXISTS notiz TEXT;

-- CHECK auf gültige Trigger-Werte (idempotent per Guard, da ADD CONSTRAINT kein
-- IF NOT EXISTS kennt).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'verbrauchsartikel_deduct_trigger_chk'
  ) THEN
    ALTER TABLE verbrauchsartikel
      ADD CONSTRAINT verbrauchsartikel_deduct_trigger_chk
      CHECK (deduct_trigger IN ('shipment', 'return'));
  END IF;
END$$;

CREATE INDEX IF NOT EXISTS verbrauchsartikel_sort_idx
  ON verbrauchsartikel (sort_order);

-- Schnell-Filter für den Auto-Abzug (nur Artikel mit auto_deduct = true).
CREATE INDEX IF NOT EXISTS verbrauchsartikel_auto_idx
  ON verbrauchsartikel (auto_deduct) WHERE auto_deduct = TRUE;

-- RLS: nur Service-Role (alle Zugriffe laufen über API mit Service-Client).
ALTER TABLE verbrauchsartikel ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'verbrauchsartikel'
      AND policyname = 'verbrauchsartikel_service_role_all'
  ) THEN
    CREATE POLICY verbrauchsartikel_service_role_all ON verbrauchsartikel
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END$$;

-- ════════════════════════════════════════════════════════════════════════
-- Idempotenz-Marker: Auto-Abzug exakt EINMAL pro Buchung
-- ════════════════════════════════════════════════════════════════════════
-- Gesetzt beim ersten Übergang der Buchung nach shipped/picked_up (atomarer
-- Claim, Muster wie `bookings.return_arrived_at`). Verhindert Doppelabzug,
-- egal welcher der Status-Schreiber gewinnt (Dashboard-Button, Versand-Form,
-- Sendcloud-Cron, Übergabe-Protokoll, Status-Dropdown).
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS consumables_deducted_at TIMESTAMPTZ;

-- Separater Marker für den Rückgabe-Abzug (deduct_trigger = 'return'). Unabhängig
-- vom Versand-Marker, damit dieselbe Buchung bei Versand UND bei Rückgabe je
-- genau einmal abziehen kann. Gesetzt beim ersten Übergang nach 'completed'.
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS consumables_returned_deducted_at TIMESTAMPTZ;
