import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { checkAdminAuth } from '@/lib/admin-auth';
import { storeInvoiceForBooking, deriveInvoiceNumber } from '@/lib/buchhaltung/store-invoice';
import { logAudit } from '@/lib/audit';

/**
 * POST /api/admin/buchhaltung/invoices/backfill
 *
 * Erzeugt nachtraeglich invoices-Rows fuer alle Buchungen, die noch keine
 * Rechnung in der Datenbank haben. Greift auf storeInvoiceForBooking zurueck
 * — derselbe Helper wird ab sofort auch automatisch beim Anlegen jeder neuen
 * Buchung aufgerufen (confirm-booking / confirm-cart / stripe-webhook).
 *
 * Sicher mehrfach ausfuehrbar (idempotent via UNIQUE-Constraint auf
 * invoice_number). Antwort: { created, skipped, total } pro Lauf.
 *
 * Test/Live-Trennung: nutzt den aktuellen Env-Modus — pro Modus eine eigene
 * Backfill-Charge, damit Test-Buchungen nicht in die Live-Rechnungsliste
 * kippen und umgekehrt.
 */
export async function POST(req: NextRequest) {
  if (!(await checkAdminAuth())) {
    return NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 401 });
  }

  const supabase = createServiceClient();

  // Steuermodus + Rate fuer die Net/Brutto-Aufteilung
  const { data: taxRows } = await supabase
    .from('admin_settings')
    .select('key, value')
    .in('key', ['tax_mode', 'tax_rate']);
  const tx: Record<string, string> = {};
  for (const r of taxRows ?? []) tx[r.key] = r.value as string;
  const taxMode = (tx['tax_mode'] as 'kleinunternehmer' | 'regelbesteuerung') || 'kleinunternehmer';
  const taxRate = parseFloat(tx['tax_rate'] || '19');

  // Alle bezahlten Buchungen ohne zugehoerige Rechnung. price_total > 0
  // (sonst nichts zu fakturieren). Status != cancelled.
  const { data: bookings, error: bookingsErr } = await supabase
    .from('bookings')
    .select('id, customer_email, customer_name, price_total, price_rental, price_accessories, price_haftung, shipping_price, discount_amount, coupon_code, payment_intent_id, status, is_test, created_at')
    .gt('price_total', 0)
    .neq('status', 'cancelled')
    .order('created_at', { ascending: true });

  if (bookingsErr) {
    return NextResponse.json({ error: bookingsErr.message }, { status: 500 });
  }
  const total = bookings?.length ?? 0;
  if (total === 0) {
    return NextResponse.json({ created: 0, skipped: 0, total: 0 });
  }

  // Existierende Rechnungen einmalig laden (vermeidet N+1 SELECT pro Booking)
  const invoiceNumbers = (bookings ?? []).map((b) => deriveInvoiceNumber(b.id));
  const { data: existingInvoices } = await supabase
    .from('invoices')
    .select('invoice_number')
    .in('invoice_number', invoiceNumbers);
  const existingSet = new Set((existingInvoices ?? []).map((i) => i.invoice_number as string));

  let created = 0;
  let skipped = 0;
  for (const booking of bookings ?? []) {
    const num = deriveInvoiceNumber(booking.id);
    if (existingSet.has(num)) {
      skipped++;
      continue;
    }
    const ok = await storeInvoiceForBooking(supabase, booking, { taxMode, taxRate });
    if (ok) created++;
    else skipped++;
  }

  await logAudit({
    action: 'invoice.backfill',
    entityType: 'invoice',
    entityId: 'bulk',
    changes: { created, skipped, total },
    request: req,
  });

  return NextResponse.json({ created, skipped, total });
}
