-- ============================================================
-- Migration: accessories.included_parts (Bestandteile-Liste)
-- Erstellt: 2026-05-03
--
-- Hintergrund:
-- Manche Zubehoere (z.B. ein Funkmikrofon-Set) bestehen aus
-- mehreren physischen Teilen (1x Sender, 2x Empfaenger, USB-C-
-- Kabel, Windschutz, ...). Diese Teile sollen NICHT als eigene
-- Inventar-Eintraege existieren oder beim Pack-Scan als eigene
-- Slots auftauchen — sie werden ueber den Sammel-/Exemplar-QR
-- des Hauptzubehoers mit-erfasst. Beim Scannen erinnert das
-- System den Packer aber daran, dass weitere Teile dazugehoeren.
--
-- Speicherform: TEXT[] mit Klartext-Eintraegen wie
--   ['2x Sender', '1x Empfaenger', '2x Lavalier-Mikro',
--    '1x USB-C-Ladekabel', 'Windschutz']
--
-- Idempotent.
-- ============================================================

ALTER TABLE accessories
  ADD COLUMN IF NOT EXISTS included_parts TEXT[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN accessories.included_parts IS
  'Bestandteile dieses Zubehoers (z.B. "2x Sender", "1x Windschutz"). Reine Anzeige fuer Pack-Workflow + Packliste, kein eigenes Inventar.';
