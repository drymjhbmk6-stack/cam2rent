-- ============================================================
-- Buchung verlegen (Verlegung) — neue Spalten auf bookings
-- Erstellt: 2026-07-26
-- ============================================================
--
-- Feature: Admin + Kunden-Self-Service koennen eine Buchung auf einen neuen
-- Termin verlegen (reine Verschiebung, gleiche Dauer/gleicher Preis). Der
-- Admin kann zusaetzlich "auf unbestimmte Zeit" verlegen (Status 'postponed',
-- gibt das Inventar frei). Der Kunde unterschreibt den Vertrag fuer den neuen
-- Zeitraum neu.
--
-- WICHTIG (Storno-Schutz): Die kostenlose Storno-Frist haengt heute live an
-- rental_from. Verlegen auf spaeter wuerde das 7-Tage-Fenster neu oeffnen.
-- `cancellation_anchor_date` friert den urspruenglichen Termin ein — das Storno
-- wird gegen MIN(rental_from, cancellation_anchor_date) geprueft.
--
-- Idempotent (IF NOT EXISTS). Additiv — kein Bestand veraendert.
-- Hinweis: `original_rental_to` existiert bereits aus dem Extension-Flow.
-- ============================================================

ALTER TABLE bookings ADD COLUMN IF NOT EXISTS postponed_at TIMESTAMPTZ;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS postpone_reason TEXT;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS postpone_target_date DATE;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS original_rental_from DATE;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS cancellation_anchor_date DATE;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS postpone_count INTEGER NOT NULL DEFAULT 0;

-- Archivierte Vertragsfassungen (bei Neu-Unterschrift fuer den neuen Zeitraum
-- bleibt das Original als Beweis erhalten). Shape:
-- [{ path, period_from, period_to, signed_at, hash }]
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS contract_versions JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN bookings.cancellation_anchor_date IS
  'Frozen Storno-Termin (fruehester je gesetzter rental_from). Verhindert, dass eine Verlegung das kostenlose Storno-Fenster neu oeffnet.';
COMMENT ON COLUMN bookings.postpone_count IS
  'Anzahl der vom KUNDEN selbst durchgefuehrten Verlegungen (Limit: einmal). Admin-Verlegungen erhoehen den Zaehler NICHT.';
