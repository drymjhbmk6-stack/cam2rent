-- ─────────────────────────────────────────────────────────────────────────────
-- Versand-Packliste: Digitales 4-Augen-Prinzip
-- ─────────────────────────────────────────────────────────────────────────────
-- Vorher: Packliste wurde als PDF gedruckt, manuell abgehakt, ins Paket gelegt.
-- Jetzt: Digitaler 3-Step-Workflow:
--   1) Packer haakt jedes Item digital ab + unterschreibt (Person A)
--   2) Kontrolleur (MUSS andere Person sein!) prueft + unterschreibt + macht
--      Foto vom gepackten Paket als Nachweis
--   3) System generiert PDF mit beiden Unterschriften + Daten zum Druck
--
-- Foto wird in privatem Bucket "packing-photos" gespeichert. Im PDF erscheint
-- nur ein Hinweistext + Storage-Pfad — das eigentliche Foto wird ueber Signed
-- URL aus dem Admin-Detail abrufbar (Datenschutz: nur Admin/Owner).
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Bookings: Packing-Workflow-Spalten ─────────────────────────────────────
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS pack_status TEXT;
-- 'packed' = Schritt 1 fertig (Packer signiert), 'checked' = Schritt 2 fertig
-- (Kontrolleur signiert + Foto). NULL = noch nicht angefangen.

-- Schritt 1: Packer
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS pack_packed_by         TEXT;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS pack_packed_by_user_id UUID;       -- Mitarbeiter-Account aus admin_users (NULL bei Master-Passwort-Login)
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS pack_packed_at         TIMESTAMPTZ;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS pack_packed_signature  TEXT;       -- DataURL der Canvas-Signatur
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS pack_packed_items      JSONB;      -- Liste abgehakter Item-Schluessel
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS pack_packed_condition  JSONB;      -- Zustand-Checkboxen + Notiz

-- Schritt 2: Kontrolleur
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS pack_checked_by         TEXT;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS pack_checked_by_user_id UUID;      -- Mitarbeiter-Account aus admin_users (NULL bei Master-Passwort-Login)
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS pack_checked_at         TIMESTAMPTZ;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS pack_checked_signature  TEXT;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS pack_checked_items      JSONB;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS pack_checked_notes      TEXT;

-- Foto-Nachweis (vom Kontrolleur am Ende hochgeladen)
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS pack_photo_url TEXT;
-- Format: "packing-photos/<bookingId>.jpg" (Storage-Pfad, NICHT signed URL).

COMMENT ON COLUMN bookings.pack_status IS
  'Versand-Packing-Workflow: NULL=offen, packed=Packer fertig, checked=Kontrolleur fertig (PDF-bereit).';
COMMENT ON COLUMN bookings.pack_photo_url IS
  'Pfad in Storage-Bucket packing-photos. Foto vom gepackten Paket als 4-Augen-Nachweis. Wird im Admin via Signed URL angezeigt.';
COMMENT ON COLUMN bookings.pack_packed_by_user_id IS
  '4-Augen-Tracking: admin_users.id des Packers. NULL nur bei Master-Passwort-Login (Notfall-Fallback auf Namensvergleich).';
COMMENT ON COLUMN bookings.pack_checked_by_user_id IS
  '4-Augen-Tracking: admin_users.id des Kontrolleurs. Server prueft id != pack_packed_by_user_id wenn beide gesetzt.';

-- ── Storage-Bucket muss MANUELL angelegt werden im Supabase-Dashboard: ─────
-- Name: packing-photos
-- Public: NEIN
-- File-Size-Limit: 10 MB
-- MIME-Types: image/jpeg, image/png, image/webp, image/heic, image/heif
-- Zugriff: nur Service-Role (RLS aktiv, keine Public-Reads)
