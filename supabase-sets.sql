-- ─── Sets-Tabelle ────────────────────────────────────────────────────────────
--
-- Führe dieses Script im Supabase SQL-Editor aus.
-- Es erstellt die "sets"-Tabelle und fügt die Standardwerte ein.
--
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.sets (
  id            TEXT PRIMARY KEY,           -- entspricht RENTAL_SETS_STATIC id
  pricing_mode  TEXT NOT NULL DEFAULT 'perDay' CHECK (pricing_mode IN ('perDay', 'flat')),
  price         NUMERIC(10,2) NOT NULL DEFAULT 0,
  available     BOOLEAN NOT NULL DEFAULT true,
  updated_at    TIMESTAMPTZ DEFAULT now()
);

-- Nur Admins dürfen lesen/schreiben (service role = kein RLS-Blocking)
ALTER TABLE public.sets ENABLE ROW LEVEL SECURITY;

-- Alle können lesen (öffentlich für die Buchungsseite)
CREATE POLICY "sets_public_read" ON public.sets
  FOR SELECT USING (true);

-- Nur Service-Role darf schreiben (Admin-API nutzt Service-Client)
-- (kein INSERT/UPDATE-Policy = nur service_role kann schreiben)

-- ─── Seed-Daten ───────────────────────────────────────────────────────────────

INSERT INTO public.sets (id, pricing_mode, price, available) VALUES
  ('basic',     'perDay', 5.00,  true),
  ('fahrrad',   'perDay', 7.00,  true),
  ('ski',       'perDay', 9.00,  true),
  ('motorrad',  'perDay', 8.00,  true),
  ('taucher',   'perDay', 12.00, true),
  ('vlogging',  'perDay', 8.00,  true),
  ('allrounder','perDay', 14.00, true)
ON CONFLICT (id) DO NOTHING;
