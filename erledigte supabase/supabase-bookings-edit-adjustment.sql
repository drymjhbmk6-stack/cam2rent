-- Bestellbearbeitung mit Preisdifferenz (Nachzahlung per Zahlungslink /
-- Rueckerstattung). Idempotent — mehrfach ausfuehrbar.
--
-- Die booking_edit-PATCH-Route schreibt diese Felder, hat aber einen
-- defensiven Fallback (Update ohne die Spalten + Doku in `notes`), falls
-- die Migration noch nicht durch ist.

ALTER TABLE bookings ADD COLUMN IF NOT EXISTS adjustment_payment_link_id TEXT;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS adjustment_amount NUMERIC;
-- 'pending_payment' = Zahlungslink verschickt, wartet auf Zahlung
-- 'paid'            = Nachzahlung per Stripe eingegangen (Webhook)
-- 'refunded'        = Stripe-Teilerstattung ausgefuehrt
-- 'refund_pending'  = manuelle Rueckerstattung noetig (Nicht-Stripe-Buchung)
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS adjustment_status TEXT;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS adjustment_note TEXT;

COMMENT ON COLUMN bookings.adjustment_payment_link_id IS
  'Stripe Payment Link ID der letzten Nachzahlung aus einer Buchungsbearbeitung.';
COMMENT ON COLUMN bookings.adjustment_amount IS
  'Letzte Preisdifferenz aus Buchungsbearbeitung (positiv = Nachzahlung, negativ = Erstattung).';
COMMENT ON COLUMN bookings.adjustment_status IS
  'pending_payment | paid | refunded | refund_pending';
