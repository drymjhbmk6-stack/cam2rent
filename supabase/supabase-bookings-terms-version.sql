-- ════════════════════════════════════════════════════════════════════════
-- Rechtstext-Versions-Snapshot + eingefrorener Höchstbetrag pro Buchung
-- ════════════════════════════════════════════════════════════════════════
--
-- AGB § 1 Abs. 5 / Mietvertrag § 1 Abs. 4: die bei Vertragsschluss geltende
-- Fassung bleibt maßgeblich und wird im Vertrag mit Versionsnummer ausgewiesen.
-- Mietvertrag § 8 Abs. 2 b): maßgeblich ist ausschließlich der im Vertrag
-- ausgewiesene Höchstbetrag der Ersatzpflicht.
--
-- Deshalb werden diese Werte bei Vertragsschluss EINGEFROREN (freeze-once,
-- siehe lib/contracts/generate-contract.ts) und nie mehr überschrieben —
-- Verlegung (§ 12 Abs. 2) und Verlängerung (§ 13) behalten die ursprüngliche
-- Fassung.
--
-- Idempotent + additiv.

ALTER TABLE bookings ADD COLUMN IF NOT EXISTS terms_version           TEXT;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS liability_terms_version TEXT;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS withdrawal_version      TEXT;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS privacy_version         TEXT;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS terms_snapshot_at       TIMESTAMPTZ;
-- Eingefrorener Höchstbetrag der Ersatzpflicht (0 = Premium, NULL = Ohne
-- Haftungsschutz → Wiederbeschaffungswert laut Tabelle, sonst Basis-Betrag).
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS liability_max_amount    NUMERIC;

-- ── Backfill ──────────────────────────────────────────────────────────────
-- Bestehende UNTERSCHRIEBENE Verträge: die damals gültige Fassung ist nicht
-- mehr rekonstruierbar. Bewusst als "unbekannt (Altbestand)" markiert und
-- NICHT mit dem aktuellen Stand gefüllt (das wäre eine Falschangabe).
-- terms_snapshot_at bleibt NULL (Zeitpunkt unbekannt). Da terms_version dann
-- NICHT NULL ist, greift die freeze-once-Logik nicht mehr → der Altbestand
-- wird nie fälschlich mit dem aktuellen Stand überschrieben.
UPDATE bookings
   SET terms_version           = COALESCE(terms_version,           'unbekannt (Altbestand)'),
       liability_terms_version = COALESCE(liability_terms_version, 'unbekannt (Altbestand)'),
       withdrawal_version      = COALESCE(withdrawal_version,      'unbekannt (Altbestand)'),
       privacy_version         = COALESCE(privacy_version,         'unbekannt (Altbestand)')
 WHERE contract_signed IS TRUE
   AND terms_version IS NULL;
