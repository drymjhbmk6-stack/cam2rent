-- Aufgabe 8: Admin-Kundennotizen
-- Tabelle für interne Admin-Notizen zu Kunden

CREATE TABLE IF NOT EXISTS admin_customer_notes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  customer_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Index für schnelle Abfragen nach Kunden-ID
CREATE INDEX IF NOT EXISTS idx_admin_customer_notes_customer_id ON admin_customer_notes(customer_id);

-- RLS deaktiviert (wird nur über service_role key aus Admin-API verwendet)
ALTER TABLE admin_customer_notes ENABLE ROW LEVEL SECURITY;
