-- Belege: Fremdwaehrungs-Erkennung + automatische EUR-Umrechnung
--
-- Idempotent: kann mehrfach ausgefuehrt werden, ohne Schaden anzurichten.
-- Additiv: legt nur neue nullable Spalten an, aendert keine bestehenden Daten.
--
-- Hintergrund: Eine Eingangsrechnung kann in einer Fremdwaehrung (typisch USD)
-- ausgestellt sein. Buchhaltung/EUeR/DATEV brauchen aber EUR. Der OCR-Pfad
-- (lib/buchhaltung/run-ocr.ts) erkennt die Waehrung, zieht den EZB-Referenzkurs
-- zum Rechnungsdatum (frankfurter API) und rechnet alle Positionen automatisch
-- in EUR um. Diese Spalten dokumentieren die Umrechnung + erlauben dem Admin,
-- den Kurs im UI zu ueberschreiben (dann werden die Positionen linear
-- neu skaliert).
--
-- Konvention:
--   fremdwaehrung          = ISO-Code der Original-Waehrung (z.B. 'USD').
--                            NULL = EUR-Rechnung (kein Umrechnungs-Hinweis).
--   wechselkurs            = EUR pro 1 Einheit Fremdwaehrung (z.B. 0.9180).
--   wechselkurs_datum      = Stichtag des verwendeten Referenzkurses (DATE).
--   original_summe_brutto  = Brutto-Summe in der Original-Waehrung (Referenz).
--   waehrung_hinweis_dismissed_at = Admin hat den Hinweis bestaetigt/geschlossen.
--
-- Defensiv im Code: Fehlen die Spalten (Migration noch nicht durch), laeuft der
-- OCR-Pfad ohne Umrechnung weiter (Betraege 1:1 als EUR) und der Banner
-- erscheint nicht.

ALTER TABLE belege
  ADD COLUMN IF NOT EXISTS fremdwaehrung TEXT,
  ADD COLUMN IF NOT EXISTS wechselkurs NUMERIC,
  ADD COLUMN IF NOT EXISTS wechselkurs_datum DATE,
  ADD COLUMN IF NOT EXISTS original_summe_brutto NUMERIC,
  ADD COLUMN IF NOT EXISTS waehrung_hinweis_dismissed_at TIMESTAMPTZ;

-- Partial index — nur die paar Belege in Fremdwaehrung.
CREATE INDEX IF NOT EXISTS idx_belege_fremdwaehrung
  ON belege(fremdwaehrung)
  WHERE fremdwaehrung IS NOT NULL;
