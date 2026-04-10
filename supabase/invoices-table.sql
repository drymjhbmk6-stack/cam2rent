-- Rechnungen-Tabelle fuer dauerhafte Ablage (10 Jahre §147 AO / §257 HGB)
CREATE TABLE IF NOT EXISTS invoices (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  booking_id TEXT NOT NULL,
  invoice_number TEXT UNIQUE NOT NULL,
  invoice_date DATE NOT NULL DEFAULT CURRENT_DATE,
  pdf_url TEXT,
  net_amount DECIMAL(10,2) NOT NULL,
  tax_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
  gross_amount DECIMAL(10,2) NOT NULL,
  sent_to_email TEXT,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index fuer schnelle Suche nach Buchung
CREATE INDEX IF NOT EXISTS idx_invoices_booking_id ON invoices(booking_id);
