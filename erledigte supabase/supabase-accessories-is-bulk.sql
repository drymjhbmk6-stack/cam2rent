-- ============================================================
-- Migration: accessories.is_bulk fuer Sammel-Zubehoer
-- Erstellt: 2026-05-02
--
-- Hintergrund:
-- Verbrauchsmaterial wie Schrauben, Kabel, Netzteile soll nicht
-- pro physisches Stueck per accessory_units getrackt werden -- ein
-- gemeinsamer Sammel-QR und manuelle Mengen-Pflege reichen aus.
--
-- is_bulk = TRUE  -> Sammel-Zubehoer (kein Exemplar-Tracking,
--                    eine Sammel-QR pro accessory, available_qty
--                    wird manuell gepflegt + automatisch beim
--                    Buchen/Stornieren angepasst)
-- is_bulk = FALSE -> Standard (pro physisches Exemplar Tracking,
--                    QR pro Exemplar)
--
-- Idempotent.
-- ============================================================

ALTER TABLE accessories
  ADD COLUMN IF NOT EXISTS is_bulk BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN accessories.is_bulk IS
  'Sammel-Zubehoer (Verbrauchsmaterial). Wenn TRUE: kein Exemplar-Tracking, ein Sammel-QR, manuelle Mengen + Auto-Decrement bei Buchung.';
