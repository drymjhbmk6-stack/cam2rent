import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { logAudit } from '@/lib/audit';
import { createDamageCharge, type RepairInvoiceAttachment } from '@/lib/schaden-rechnung';
import { detectFileType } from '@/lib/file-type-check';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * POST /api/admin/damage/invoice
 * Erstellt eine Schadensersatz-Forderung (Zahlungsaufforderung, KEINE
 * Ausgangsrechnung) + Stripe-Zahlungslink für eine bestehende Schadensmeldung.
 * Die Betriebseinnahme fließt über die bookings-Zeile in die EÜR.
 *
 * FormData:
 *   - reportId: string
 *   - amount: string (Bruttobetrag der Reparaturkosten)
 *   - notify_customer: 'true' | 'false'  (Mail nur bei true)
 *   - repair_invoice?: File (PDF/Bild, optional — Kopie der Reparaturrechnung)
 */
export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const reportId = String(form.get('reportId') ?? '').trim();
    const amount = Math.round((Number(form.get('amount')) || 0) * 100) / 100;
    const notifyCustomer = ['true', '1', 'on', 'yes'].includes(
      String(form.get('notify_customer') ?? '').toLowerCase(),
    );

    if (!reportId) {
      return NextResponse.json({ error: 'reportId erforderlich.' }, { status: 400 });
    }
    if (amount <= 0) {
      return NextResponse.json({ error: 'Betrag muss größer 0 sein.' }, { status: 400 });
    }

    // Optionale Kopie der Reparaturrechnung (Punkt 3: liegt dem Kunden bei).
    let repairInvoice: RepairInvoiceAttachment | null = null;
    const file = form.get('repair_invoice');
    if (file instanceof File && file.size > 0) {
      if (file.size > 10 * 1024 * 1024) {
        return NextResponse.json({ error: 'Reparaturrechnung ist zu groß (max 10 MB).' }, { status: 400 });
      }
      const buffer = Buffer.from(await file.arrayBuffer());
      const detected = detectFileType(buffer);
      if (!detected || !['pdf', 'jpeg', 'png', 'webp'].includes(detected)) {
        return NextResponse.json(
          { error: 'Reparaturrechnung muss ein PDF oder Bild (JPG/PNG/WebP) sein.' },
          { status: 400 },
        );
      }
      const ext = detected === 'jpeg' ? 'jpg' : detected;
      repairInvoice = { filename: `Reparaturrechnung.${ext}`, content: buffer };
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
      .select('id, customer_name, customer_email, user_id, shipping_address')
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

    const result = await createDamageCharge({
      sourceBookingId: booking.id,
      customerName: booking.customer_name || '',
      customerEmail: booking.customer_email,
      customerAddress: (booking.shipping_address as string) || undefined,
      userId: booking.user_id ?? null,
      amount,
      description: report.admin_notes || '',
      notifyCustomer,
      repairInvoice,
    });

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: result.status ?? 500 });
    }

    // Nachvollziehbarkeit (Punkt 4): Referenz an die Schadensmeldung hängen.
    const dateStr = new Date().toISOString().slice(0, 10);
    const noteLine = `Schadensersatz-Forderung ${result.bookingId} über ${amount.toFixed(2).replace('.', ',')} € erstellt am ${dateStr}${result.emailSent ? ' (Kunde per E-Mail informiert)' : ''}${repairInvoice ? ' · Reparaturrechnung beigelegt' : ''}.`;
    const newNotes = report.admin_notes ? `${report.admin_notes}\n${noteLine}` : noteLine;
    const upd: Record<string, unknown> = { admin_notes: newNotes };
    if (report.damage_amount == null) upd.damage_amount = amount;
    await supabase.from('damage_reports').update(upd).eq('id', reportId);

    await logAudit({
      action: 'damage.invoice',
      entityType: 'damage',
      entityId: reportId,
      changes: {
        charge_booking_id: result.bookingId,
        amount,
        customer_notified: result.emailSent,
        repair_invoice_attached: !!repairInvoice,
      },
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
    return NextResponse.json({ error: 'Fehler beim Erstellen der Schadensersatz-Forderung.' }, { status: 500 });
  }
}
