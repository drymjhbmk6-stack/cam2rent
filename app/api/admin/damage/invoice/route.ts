import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { logAudit } from '@/lib/audit';
import { createDamageInvoice } from '@/lib/schaden-rechnung';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * POST /api/admin/damage/invoice
 * Erstellt eine echte Schaden-Rechnung (mit Rechnungsnummer → Buchhaltung/EÜR)
 * + Stripe-Zahlungslink für eine bestehende Schadensmeldung.
 * Body: { reportId, amount, notify_customer? }
 * Die Kunden-E-Mail geht NUR raus, wenn notify_customer === true.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const reportId = String(body.reportId ?? '').trim();
    const amount = Math.round((Number(body.amount) || 0) * 100) / 100;
    const notifyCustomer = body.notify_customer === true || body.notify_customer === 'true';

    if (!reportId) {
      return NextResponse.json({ error: 'reportId erforderlich.' }, { status: 400 });
    }
    if (amount <= 0) {
      return NextResponse.json({ error: 'Betrag muss größer 0 sein.' }, { status: 400 });
    }

    const supabase = createServiceClient();

    const { data: report, error: repErr } = await supabase
      .from('damage_reports')
      .select('id, booking_id, admin_notes, damage_amount')
      .eq('id', reportId)
      .single();
    if (repErr || !report) {
      return NextResponse.json({ error: 'Schadensmeldung nicht gefunden.' }, { status: 404 });
    }

    const { data: booking, error: bookErr } = await supabase
      .from('bookings')
      .select('id, customer_name, customer_email, user_id')
      .eq('id', report.booking_id)
      .single();
    if (bookErr || !booking) {
      return NextResponse.json({ error: 'Buchung nicht gefunden.' }, { status: 404 });
    }
    if (!booking.customer_email) {
      return NextResponse.json(
        { error: 'Keine E-Mail-Adresse bei der Buchung hinterlegt. Bitte zuerst eintragen.' },
        { status: 422 },
      );
    }

    const result = await createDamageInvoice({
      sourceBookingId: booking.id,
      customerName: booking.customer_name || '',
      customerEmail: booking.customer_email,
      userId: booking.user_id ?? null,
      amount,
      description: report.admin_notes || '',
      notifyCustomer,
    });

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: result.status ?? 500 });
    }

    // Nachvollziehbarkeit: Referenz an die Schadensmeldung hängen +
    // Schadenshöhe übernehmen, falls noch leer.
    const dateStr = new Date().toISOString().slice(0, 10);
    const noteLine = `Schaden-Rechnung ${result.bookingId} über ${amount.toFixed(2).replace('.', ',')} € erstellt am ${dateStr}${result.emailSent ? ' (Kunde per E-Mail informiert)' : ''}.`;
    const newNotes = report.admin_notes ? `${report.admin_notes}\n${noteLine}` : noteLine;
    const upd: Record<string, unknown> = { admin_notes: newNotes };
    if (report.damage_amount == null) upd.damage_amount = amount;
    await supabase.from('damage_reports').update(upd).eq('id', reportId);

    await logAudit({
      action: 'damage.invoice',
      entityType: 'damage',
      entityId: reportId,
      changes: { invoice_booking_id: result.bookingId, amount, customer_notified: result.emailSent },
      request: req,
    });

    return NextResponse.json({
      success: true,
      bookingId: result.bookingId,
      paymentUrl: result.paymentUrl,
      emailSent: result.emailSent,
      emailError: result.emailError,
    });
  } catch (err) {
    console.error('POST /api/admin/damage/invoice error:', err);
    return NextResponse.json({ error: 'Fehler beim Erstellen der Schaden-Rechnung.' }, { status: 500 });
  }
}
