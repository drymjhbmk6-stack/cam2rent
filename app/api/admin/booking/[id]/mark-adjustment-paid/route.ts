import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { getCurrentAdminUser } from '@/lib/admin-auth';
import { logAudit } from '@/lib/audit';

/**
 * POST /api/admin/booking/[id]/mark-adjustment-paid
 *
 * Schliesst eine offene Nachzahlung aus der Bestellbearbeitung von Hand
 * (`bookings.adjustment_status` → 'paid'). Damit verschwindet die Aufgabe
 * "Nachzahlung prüfen" aus dem Dashboard.
 *
 * Warum es den Knopf braucht: Der Status wurde bisher AUSSCHLIESSLICH vom
 * Stripe-Webhook gesetzt. Lief der nicht durch (Event nicht abonniert,
 * Zustellfehler) oder hat der Kunde gar nicht über den Zahlungslink bezahlt
 * (Überweisung, bar, Zahlungslink war fehlgeschlagen), blieb die Aufgabe
 * dauerhaft stehen — ohne jeden Weg, sie abzuhaken.
 *
 * Body: { paid?: boolean }   // false = Korrektur, zurück auf "offen"
 *
 * Reine Markierung — kein Stripe-Charge, keine E-Mail, kein Refund.
 * Permission via Prefix /api/admin/booking → tagesgeschaeft (Middleware).
 */

const OPEN_STATES = ['pending_payment', 'payment_link_failed'];

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentAdminUser();
  if (!user) {
    return NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 401 });
  }

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const paid = body?.paid !== false;

  const supabase = createServiceClient();

  const { data: booking, error: loadErr } = await supabase
    .from('bookings')
    .select('id, adjustment_status, adjustment_amount')
    .eq('id', id)
    .maybeSingle();

  if (loadErr && /adjustment_status|column|schema cache|PGRST(204|205)|42703/i.test(loadErr.message)) {
    return NextResponse.json(
      { error: 'Migration ausstehend (supabase-bookings-edit-adjustment.sql).' },
      { status: 503 },
    );
  }
  if (!booking) {
    return NextResponse.json({ error: 'Buchung nicht gefunden.' }, { status: 404 });
  }

  const current = (booking.adjustment_status as string | null) ?? null;

  if (paid) {
    if (current === 'paid') {
      // Schon erledigt — idempotent, damit ein Doppelklick keinen Fehler zeigt.
      return NextResponse.json({ success: true, adjustment_status: 'paid', unchanged: true });
    }
    if (!current || !OPEN_STATES.includes(current)) {
      return NextResponse.json(
        { error: 'Für diese Buchung ist keine Nachzahlung offen.' },
        { status: 409 },
      );
    }
  } else {
    if (current !== 'paid') {
      return NextResponse.json(
        { error: 'Nur eine als bezahlt markierte Nachzahlung kann wieder geöffnet werden.' },
        { status: 409 },
      );
    }
  }

  const next = paid ? 'paid' : 'pending_payment';

  // Atomarer Guard gegen Race (paralleler Webhook / zweiter Klick).
  const { data: updated, error: updErr } = await supabase
    .from('bookings')
    .update({ adjustment_status: next })
    .eq('id', id)
    .eq('adjustment_status', current)
    .select('id')
    .maybeSingle();

  if (updErr) {
    if (/adjustment_status|column|schema cache|PGRST(204|205)|42703/i.test(updErr.message)) {
      return NextResponse.json(
        { error: 'Migration ausstehend (supabase-bookings-edit-adjustment.sql).' },
        { status: 503 },
      );
    }
    return NextResponse.json({ error: 'Speichern fehlgeschlagen.' }, { status: 500 });
  }
  if (!updated) {
    // Zustand hat sich zwischen Laden und Update geändert (z.B. Webhook war
    // schneller). Kein Fehler für den Admin — das Ziel ist erreicht.
    return NextResponse.json({ success: true, adjustment_status: next, unchanged: true });
  }

  await logAudit({
    action: paid ? 'booking.adjustment_mark_paid' : 'booking.adjustment_mark_open',
    entityType: 'booking',
    entityId: id,
    changes: {
      from: current,
      to: next,
      amount: booking.adjustment_amount ?? null,
    },
    request: req,
  }).catch(() => { /* best-effort */ });

  return NextResponse.json({ success: true, adjustment_status: next });
}
