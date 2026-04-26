-- ────────────────────────────────────────────────────────────────────────────
-- Digitales Übergabeprotokoll
-- ────────────────────────────────────────────────────────────────────────────
--
-- Erweitert die `bookings`-Tabelle um eine JSONB-Spalte `handover_data`, die
-- den kompletten Stand des Übergabeprotokolls speichert: Zustand-Checkboxen,
-- Datum/Ort, Item-Checkliste sowie die zwei Signaturen (Vermieter + Mieter).
--
-- JSONB statt einzelner Spalten, damit das Schema flexibel bleibt und der
-- Migrations-Aufwand klein ist.
--
-- Idempotent — kann mehrfach ausgeführt werden.
-- ────────────────────────────────────────────────────────────────────────────

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS handover_data JSONB;

-- Cleanup: alte Generated Column (falls sie aus einer früheren Version drin
-- ist und mit "generation expression is not immutable" fehlschlägt) entfernen.
ALTER TABLE bookings
  DROP COLUMN IF EXISTS handover_completed_at;

-- Expression-Index statt Generated Column. Postgres weigert sich, einen
-- timestamptz-Cast als IMMUTABLE zu akzeptieren (TZ-abhängige Konvertierung),
-- aber als Expression-Index ist das problemlos und liefert dieselbe
-- Filter-Performance für Queries wie WHERE (handover_data->>'completedAt')::timestamptz > '2026-01-01'.
CREATE INDEX IF NOT EXISTS idx_bookings_handover_completed_at
  ON bookings (((handover_data ->> 'completedAt')))
  WHERE handover_data IS NOT NULL;

COMMENT ON COLUMN bookings.handover_data IS
  'Digitales Übergabeprotokoll als JSONB: { completedAt, location, condition: { tested, noDamage, otherNote }, items: [{name, ok}], photoPath, signatures: { landlord: {dataUrl, name, signedAt, ip}, renter: {...} } }';

-- ────────────────────────────────────────────────────────────────────────────
-- Storage-Bucket fuer Uebergabe-Fotos (manuell anlegen)
-- ────────────────────────────────────────────────────────────────────────────
-- Das Foto wird beim digitalen Uebergabeprotokoll hochgeladen und ist
-- Pflicht (mindestens 1 Foto pro Uebergabe). Bucket muss MANUELL im
-- Supabase-Dashboard angelegt werden:
--   Name:    handover-photos
--   Public:  OFF
--   MIME:    image/jpeg, image/png, image/webp, image/heic, image/heif
--   Max:     10 MB pro Datei
--   RLS:     Nur Service-Role
-- ────────────────────────────────────────────────────────────────────────────
