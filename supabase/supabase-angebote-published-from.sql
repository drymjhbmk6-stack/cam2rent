-- Angebote: Vorab-Veroeffentlichung (Stand 2026-05-24)
--
-- Neue Spalte `published_from`: optionales Datum, ab dem das Angebot in der
-- oeffentlichen Liste erscheint und buchbar ist — UNABHAENGIG vom Mietfenster
-- (`valid_from`/`valid_until`). Das Mietfenster (= zulaessiger Zeitraum, in den
-- der Mietzeitraum des Kunden komplett fallen muss) bleibt 1:1 unveraendert.
--
-- Sichtbarkeits-/Buchbarkeits-Lower-Bound (in `isAngebotActive`):
--     effective_visible_from = COALESCE(published_from, valid_from)
--
-- Beispiel: published_from=2026-04-01, valid_from=2026-05-01, valid_until=2026-05-30
--   -> Angebot ist bereits ab 01.04. sichtbar/buchbar
--   -> Kunde kann aber nur Mietzeitraeume innerhalb 01.05.-30.05. waehlen
--
-- NULL = altes Verhalten (Sichtbarkeit fuehrt an `valid_from` heran).
--
-- Idempotent. Defensiver API-Code-Pfad mit Retry-ohne-Spalte greift, falls die
-- Migration noch nicht durch ist.

ALTER TABLE angebote ADD COLUMN IF NOT EXISTS published_from TIMESTAMPTZ;
