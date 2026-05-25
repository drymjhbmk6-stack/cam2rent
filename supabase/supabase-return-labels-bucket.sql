-- Storage-Bucket fuer hochgeladene Retoure-Etiketten (Stand 2026-05-25)
--
-- Der Admin laedt unter /admin/retouren das Retoure-Versandetikett als
-- Bild (JPG/PNG) oder PDF hoch. Der POST-Endpoint
-- /api/admin/return-label/[id] konvertiert es serverseitig auf A5
-- Hochformat (lib/pdf/label-resize.ts) und legt das fertige PDF in diesem
-- Bucket unter dem Pfad return-labels/<bookingId>.pdf ab.
-- bookings.return_label_url wird auf diesen Storage-Pfad gesetzt.
--
-- Bucket-Anlage muss im Supabase-Dashboard erfolgen, weil
-- storage.create_bucket() ueber die SQL-Schnittstelle nicht zuverlaessig
-- mit allen Settings funktioniert. Schritte:
--   1. Dashboard -> Storage -> "New bucket"
--   2. Name:     return-labels
--   3. Public:   OFF  (privat, nur Service-Role-Lesezugriff)
--   4. File size limit: 10 MB
--   5. Allowed MIME types:
--        application/pdf
--        image/jpeg
--        image/png
--
-- Idempotent: dieses Script enthaelt nur einen Sanity-Check ueber
-- pg_catalog. Bei fehlendem Bucket wird KEIN Fehler geworfen — der
-- Upload-Endpoint liefert einfach 503 und der Admin merkt's.

DO $$
DECLARE
  v_exists BOOLEAN;
BEGIN
  SELECT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'return-labels')
    INTO v_exists;
  IF v_exists THEN
    RAISE NOTICE 'Storage-Bucket "return-labels" ist vorhanden.';
  ELSE
    RAISE NOTICE 'Storage-Bucket "return-labels" fehlt — bitte im Dashboard anlegen (siehe Header).';
  END IF;
END
$$;
