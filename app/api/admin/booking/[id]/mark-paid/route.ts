import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { checkAdminAuth } from '@/lib/admin-auth';
import { logAudit } from '@/lib/audit';
import { storeInvoiceForBooking } from '@/lib/buchhaltung/store-invoice';

/**
 * POST /api/admin/booking/[id]/mark-paid
 *
 * Setzt den Zahlungsstatus einer Buchung direkt aus der Buchungs-
 * Detailseite — ohne Umweg ueber /admin/buchhaltung. Quelle der Wahrheit
 * bleibt die `invoices`-Row (gleiche Logik wie der Bezahlt-Haken im
 * Dashboard-Aufgaben-Widget: paidViaInvoice).
 *
 * Body: { paid?: boolean, method?: string, date?: 'YYYY-MM-DD', note?: string }
 *  - paid (Default true): markieren / wieder als offen markieren
 *
 * Beim Markieren wird — falls noch keine `invoices`-Row existiert — eine
 * idempotent angelegt (storeInvoiceForBooking) und dann auf bezahlt gesetzt.
 * Eine `awaiting_payment`-Buchung wird zusaetzlich auf `confirmed` gehoben,
 * damit der Auto-Storno-Cron sie nicht doch noch storniert.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await checkAdminAuth())) {
    return NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 401 });
  }

  const { id } = await params;
  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const setPaid = body.paid !== false; // Default: bezahlt setzen
  const method = typeof body.method === 'string' && body.method.trim() ? body.method.trim() : null;
  const date = typeof body.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.date) ? body.date : null;
  const note = typeof body.note === 'string' && body.note.trim() ? body.note.trim().slice(0, 500) : null;

  const supabase = createServiceClient();

  const { data: booking } = await supabase
    .from('bookings')
    .select(
      'id, customer_email, customer_name, price_total, price_rental, price_accessories, price_haftung, shipping_price, discount_amount, duration_discount, loyalty_discount, coupon_code, payment_intent_id, status, is_test, created_at',
    )
    .eq('id', id)
    .maybeSingle();

  if (!booking) {
    return NextResponse.json({ error: 'Buchung nicht gefunden.' }, { status: 404 });
  }

  const paidAt = date ? `${date}T12:00:00Z` : new Date().toISOString();

  if (setPaid) {
    if (Number(booking.price_total ?? 0) <= 0) {
      return NextResponse.json(
        { error: 'Buchung hat keinen fakturierbaren Betrag (Gesamt = 0).' },
        { status: 400 },
      );
    }

    // Steuermodus + Rate fuer die Net/Brutto-Aufteilung der ggf. neuen Rechnung
    const { data: taxRows } = await supabase
      .from('admin_settings')
      .select('key, value')
      .in('key', ['tax_mode', 'tax_rate']);
    const tx: Record<string, string> = {};
    for (const r of taxRows ?? []) tx[r.key] = r.value as string;
    const taxMode = (tx['tax_mode'] as 'kleinunternehmer' | 'regelbesteuerung') || 'kleinunternehmer';
    const taxRate = parseFloat(tx['tax_rate'] || '19');

    // Rechnung idempotent sicherstellen, dann per booking_id aufloesen.
    await storeInvoiceForBooking(supabase, booking, { taxMode, taxRate });
    const { data: invoices } = await supabase
      .from('invoices')
      .select('id, payment_status')
      .eq('booking_id', id);

    if (!invoices || invoices.length === 0) {
      return NextResponse.json(
        { error: 'Rechnung konnte nicht angelegt werden.' },
        { status: 500 },
      );
    }

    for (const inv of invoices) {
      if (inv.payment_status === 'paid') continue;
      await supabase
        .from('invoices')
        .update({
          status: 'paid',
          payment_status: 'paid',
          payment_method: method || 'bank_transfer',
          payment_notes: note,
          paid_at: paidAt,
        })
        .eq('id', inv.id);
      await supabase
        .from('dunning_notices')
        .update({ status: 'paid' })
        .eq('invoice_id', inv.id)
        .in('status', ['draft', 'sent']);
    }

    // awaiting_payment → confirmed, damit der Auto-Storno-Cron nicht zuschlaegt.
    let statusChanged = false;
    if (String(booking.status) === 'awaiting_payment') {
      const { data: upd } = await supabase
        .from('bookings')
        .update({ status: 'confirmed' })
        .eq('id', id)
        .eq('status', 'awaiting_payment')
        .select('id')
        .maybeSingle();
      statusChanged = !!upd;
    }

    await logAudit({
      action: 'booking.mark_paid',
      entityType: 'booking',
      entityId: id,
      entityLabel: id,
      changes: { method: method || 'bank_transfer', date, note, statusChanged },
      request: req,
    });

    return NextResponse.json({ ok: true, paid: true, statusChanged });
  }

  // ── Als unbezahlt markieren (Korrektur) ──────────────────────────────
  const { data: invoices } = await supabase
    .from('invoices')
    .select('id')
    .eq('booking_id', id);
  for (const inv of invoices ?? []) {
    await supabase
      .from('invoices')
      .update({ status: 'open', payment_status: 'open', paid_at: null })
      .eq('id', inv.id);
  }

  // Hinweis: eine echte Stripe-Zahlung kann hier nicht zurueckgesetzt werden
  // (stripe_transactions bleibt matched → Dashboard zeigt weiterhin bezahlt).
  const { data: stripeTx } = await supabase
    .from('stripe_transactions')
    .select('id')
    .eq('booking_id', id)
    .in('match_status', ['matched', 'manual'])
    .limit(1);
  const stripeMatched = (stripeTx?.length ?? 0) > 0;

  await logAudit({
    action: 'booking.mark_unpaid',
    entityType: 'booking',
    entityId: id,
    entityLabel: id,
    changes: { note, stripeMatched },
    request: req,
  });

  return NextResponse.json({ ok: true, paid: false, stripeMatched });
}
