-- Unvollstaendige Rueckgabe: „Kunde ersetzt" oder „Kommt nach"
--
-- Bisher war der Abschluss-Button auf /admin/retouren/[id]/pruefen hart darauf
-- gegated, dass JEDES Item abgehakt ist. Kam etwas nicht zurueck, liess sich
-- die Rueckgabe gar nicht abschliessen — die Kamera blieb im Kalender
-- blockiert, obwohl sie physisch wieder da war.
--
-- Diese Tabelle haelt pro nicht zurueckgegebener Position die Entscheidung des
-- Admins fest:
--   resolution = 'replace'   -> Kunde ersetzt, zahlt den Wiederbeschaffungswert
--                               (es wird eine Verkaufs-Buchung mit Rechnung +
--                               Stripe-Zahlungslink erzeugt, sale_booking_id)
--   resolution = 'follow_up' -> Kunde bringt/schickt es nach (due_date = Frist)
--
-- Eigene Tabelle statt JSONB an `bookings`, weil quer ueber alle Buchungen
-- abgefragt wird (Tab „Offene Rueckgaben", Dashboard-Aufgaben-Widget, Push).
--
-- Additiv + idempotent. Ohne die Migration laeuft der Rueckgabe-Flow
-- unveraendert wie bisher: alle Schreib-/Lesepfade fangen die fehlende Tabelle
-- ab und melden `migration_pending`, das UI bleibt auf „alles abhaken" gegated.

CREATE TABLE IF NOT EXISTS booking_return_open_items (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id         TEXT NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,

  -- 'camera' | 'accessory'
  kind               TEXT NOT NULL DEFAULT 'accessory'
                       CHECK (kind IN ('camera', 'accessory')),
  accessory_id       TEXT,        -- bei kind='accessory'
  product_id         TEXT,        -- bei kind='camera'

  -- Anzeigename als Snapshot (Katalog kann sich spaeter aendern)
  label              TEXT NOT NULL,
  qty                INTEGER NOT NULL DEFAULT 1 CHECK (qty >= 1),

  -- 'replace' = Kunde ersetzt/zahlt | 'follow_up' = Kunde sendet nach
  resolution         TEXT NOT NULL
                       CHECK (resolution IN ('replace', 'follow_up')),

  -- Wiederbeschaffungswert-Snapshot (nur bei 'replace' gefuellt)
  unit_value         NUMERIC(10,2),
  total_value        NUMERIC(10,2),

  -- Frist fuer die Nachsendung (nur bei 'follow_up')
  due_date           DATE,

  -- 'open'     = noch offen
  -- 'received' = doch noch eingetroffen (Exemplar wieder freigegeben)
  -- 'charged'  = Ersatz berechnet/bezahlt
  -- 'waived'   = Admin hat darauf verzichtet
  status             TEXT NOT NULL DEFAULT 'open'
                       CHECK (status IN ('open', 'received', 'charged', 'waived')),

  -- Betroffene physische Exemplare (bleiben bei 'follow_up' auf 'rented',
  -- werden bei 'replace' auf 'lost' gesetzt).
  accessory_unit_ids UUID[] NOT NULL DEFAULT '{}',

  -- Bei 'replace': die erzeugte Verkaufs-Buchung (bookings.booking_type='kauf')
  sale_booking_id    TEXT,

  notes              TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at        TIMESTAMPTZ
);

-- Haupt-Query der Verwaltungs-Ansichten: offene Positionen nach Frist.
-- Teilindex haelt ihn klein (erledigte Positionen sind uninteressant).
CREATE INDEX IF NOT EXISTS idx_return_open_items_pending
  ON booking_return_open_items (due_date, created_at)
  WHERE status = 'open';

-- Buchungsdetail-Seite laedt alle Positionen einer Buchung.
CREATE INDEX IF NOT EXISTS idx_return_open_items_booking
  ON booking_return_open_items (booking_id);

-- RLS: service-role-only (Muster wie damage_reports). Der Zugriff laeuft
-- ausschliesslich ueber die Admin-APIs mit Permission 'tagesgeschaeft'.
ALTER TABLE booking_return_open_items ENABLE ROW LEVEL SECURITY;
