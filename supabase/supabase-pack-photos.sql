-- ============================================================================
-- Verpackungskontrolle: mehrere Pflicht-Fotos statt nur einem
-- ============================================================================
--
-- Bisher hielt `bookings.pack_photo_url` GENAU EINEN Storage-Pfad (ein Foto
-- vom gepackten Paket). Neu sind pro Versand mehrere Pflicht-Fotos:
--
--   1x Gesamtfoto von allem, was rausgeht
--   + pro Kamera je ein Foto von VORNE und von der RUECKSEITE
--   + optionale Zusatzfotos
--
-- Diese Migration ist ADDITIV und IDEMPOTENT:
--   * `pack_photo_url` bleibt unveraendert und traegt weiterhin das GESAMTFOTO.
--     Alle bestehenden Leser (photo-url-Route, Packliste-PDF, pack-reset,
--     resetPackWorkflow in booking/[id] + booking-postpone) funktionieren 1:1
--     weiter — auch fuer Altbestand.
--   * `pack_photos` ist neu und haelt die vollstaendige Liste:
--       [{ path, kind, title, cameraIndex?, cameraLabel?, unitId? }]
--     kind ∈ 'overview' | 'camera_front' | 'camera_back' | 'extra'
--
-- OHNE diese Migration laeuft alles defensiv weiter: die Kontroll-Route
-- schreibt dann nur `pack_photo_url` (Gesamtfoto) und meldet die ausstehende
-- Migration als Warnung zurueck — der Versand wird NICHT blockiert.
--
-- Das Uebergabeprotokoll (Abholung) braucht KEINE Migration: `handover_data`
-- ist freies JSONB und bekommt die Liste unter `photos`.
--
-- Storage: die Fotos liegen weiterhin im bestehenden privaten Bucket
-- `packing-photos` (Pfad `<bookingId>/<timestamp>-<slot>.<ext>`).
-- ============================================================================

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS pack_photos JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN bookings.pack_photos IS
  'Alle Fotos der Verpackungskontrolle als JSONB-Array: [{path, kind, title, cameraIndex?, cameraLabel?, unitId?}]. kind = overview|camera_front|camera_back|extra. Pfade zeigen in den privaten Bucket packing-photos. Das Gesamtfoto steht zusaetzlich in pack_photo_url (Rueckwaertskompatibilitaet).';

-- Verifikation
DO $$
DECLARE
  has_col BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'bookings' AND column_name = 'pack_photos'
  ) INTO has_col;
  RAISE NOTICE 'bookings.pack_photos vorhanden: %', has_col;
END $$;
