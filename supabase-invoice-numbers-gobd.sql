-- ────────────────────────────────────────────────────────────────────────────
-- GoBD-konforme fortlaufende Rechnungsnummern
-- ────────────────────────────────────────────────────────────────────────────
--
-- STATUS: Vorbereitet — noch NICHT aktiv im Code. Der Code leitet aktuell
-- die Rechnungsnummer aus booking.id ab (`BK-2026-00042` → `RE-2026-00042`),
-- was zwar optisch aufsteigend aussieht, aber technisch gesehen keine lücken-
-- lose fortlaufende Sequenz garantiert (z.B. wenn Buchungen out-of-order
-- bestätigt werden).
--
-- Diese Migration legt die Infrastruktur an. Die Umstellung der Invoice-
-- Route auf die neue Nummernlogik sollte NUR nach Rücksprache mit dem
-- Steuerberater erfolgen und NICHT mitten im Jahr (Finanzamt-Übergang).
--
-- Ablauf bei Umstellung:
-- 1. Diese SQL-Migration ausführen
-- 2. Code in `app/api/invoice/[bookingId]/route.ts` anpassen: beim ersten
--    Abruf `next_invoice_number(year)` aufrufen, Ergebnis in `invoices.
--    invoice_number` speichern. Bei Folgeaufrufen gespeicherte Nummer nutzen.
-- 3. Steuerberater informieren + Dokumentation zu Nummernkreis-Wechsel
--
-- Empfehlung: Zum Jahreswechsel (1.1.XXXX) umstellen.
-- ────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS invoice_counter (
  year        INT        PRIMARY KEY,
  last_number INT        NOT NULL DEFAULT 0,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Atomic increment per Jahr (upsert-pattern)
CREATE OR REPLACE FUNCTION public.next_invoice_number(p_year INT)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_next INT;
BEGIN
  INSERT INTO invoice_counter (year, last_number) VALUES (p_year, 1)
    ON CONFLICT (year)
    DO UPDATE SET last_number = invoice_counter.last_number + 1,
                  updated_at = now()
    RETURNING last_number INTO v_next;
  RETURN v_next;
END;
$$;

REVOKE ALL ON FUNCTION public.next_invoice_number(INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.next_invoice_number(INT) TO service_role;

-- Optional: Initialer Wert setzen, falls bereits Rechnungen existieren.
-- Auskommentieren und mit passendem Wert setzen BEFORE der Code umgestellt wird:
-- INSERT INTO invoice_counter (year, last_number) VALUES (2026, 150)
--   ON CONFLICT (year) DO UPDATE SET last_number = EXCLUDED.last_number;
