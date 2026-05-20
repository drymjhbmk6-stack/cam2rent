import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { checkAdminAuth } from '@/lib/admin-auth';
import { logAudit } from '@/lib/audit';

/**
 * POST /api/admin/buchhaltung/stripe-reconciliation/mark-duplicate
 *
 * Markiert eine unverknuepfte Stripe-Transaktion als Doppelzahlung einer
 * bereits verknuepften Buchung:
 *   - stripe_transactions.booking_id  = <original_booking_id>
 *   - stripe_transactions.match_status = 'refunded'
 *   - reconciliation_note = "Doppelzahlung von Buchung X — Kunde hat zweimal bezahlt"
 *
 * KEIN Einkommens-Abzug: die Buchung hatte den korrekten Rechnungsbetrag,
 * die zweite Zahlung ist Ueberschuss und wird (idealerweise im Stripe-
 * Dashboard) erstattet — der Geldfluss ist netto null und beruehrt EÜR/DATEV
 * nicht. `bookings.refund_amount` wird daher NICHT geaendert; eine kurze
 * Audit-Zeile wandert in `bookings.refund_note`.
 *
 * Body: { transaction_id: string, original_booking_id: string, custom_note?: string }
 */
export async function POST(req: NextRequest) {
  if (!(await checkAdminAuth())) {
    return NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const { transaction_id, original_booking_id, custom_note } = body as {
    transaction_id?: string;
    original_booking_id?: string;
    custom_note?: string;
  };

  if (!transaction_id || !original_booking_id) {
    return NextResponse.json(
      { error: 'transaction_id und original_booking_id erforderlich.' },
      { status: 400 },
    );
  }

  const supabase = createServiceClient();

  // Pruefen: gibt es die Tx? Ist sie wirklich noch unmatched?
  const { data: tx } = await supabase
    .from('stripe_transactions')
    .select('id, stripe_payment_intent_id, amount, match_status, booking_id')
    .eq('id', transaction_id)
    .maybeSingle();

  if (!tx) {
    return NextResponse.json({ error: 'Transaktion nicht gefunden.' }, { status: 404 });
  }
  if (tx.match_status === 'matched' || tx.match_status === 'manual') {
    return NextResponse.json(
      { error: 'Transaktion ist bereits einer Buchung zugeordnet.' },
      { status: 409 },
    );
  }

  // Pruefen: Original-Buchung existiert?
  const { data: booking } = await supabase
    .from('bookings')
    .select('id, refund_note')
    .eq('id', original_booking_id)
    .maybeSingle();

  if (!booking) {
    return NextResponse.json(
      { error: 'Original-Buchung nicht gefunden.' },
      { status: 404 },
    );
  }

  const note = typeof custom_note === 'string' && custom_note.trim()
    ? custom_note.trim().slice(0, 500)
    : `Doppelzahlung von Buchung ${original_booking_id} — Kunde hat zweimal bezahlt`;

  // 1) Tx als Doppelzahlung markieren (verknuepft + als refunded).
  let updateRes = await supabase
    .from('stripe_transactions')
    .update({
      booking_id: original_booking_id,
      match_status: 'refunded',
      reconciliation_note: note,
    })
    .eq('id', transaction_id);

  if (updateRes.error && /reconciliation_note|column|schema cache|PGRST/i.test(updateRes.error.message)) {
    // Migration ausstehend — ohne reconciliation_note retry.
    updateRes = await supabase
      .from('stripe_transactions')
      .update({
        booking_id: original_booking_id,
        match_status: 'refunded',
      })
      .eq('id', transaction_id);
  }
  if (updateRes.error) {
    return NextResponse.json({ error: updateRes.error.message }, { status: 500 });
  }

  // 2) Audit-Zeile in bookings.refund_note (best-effort).
  const stamp = new Date().toLocaleString('de-DE', { timeZone: 'Europe/Berlin' });
  const line = `[${stamp}] Doppelzahlung markiert (Stripe ${tx.stripe_payment_intent_id} · ${Number(tx.amount ?? 0).toFixed(2)} EUR): ${note}`;
  const appendedNote = booking.refund_note ? `${booking.refund_note}\n${line}` : line;
  const noteRes = await supabase
    .from('bookings')
    .update({ refund_note: appendedNote })
    .eq('id', booking.id);
  if (noteRes.error && !/refund_note|column|schema cache|PGRST/i.test(noteRes.error.message)) {
    console.warn('[mark-duplicate] refund_note konnte nicht aktualisiert werden:', noteRes.error.message);
  }

  await logAudit({
    action: 'stripe.mark_duplicate',
    entityType: 'booking',
    entityId: booking.id,
    changes: {
      transaction_id: tx.id,
      stripe_payment_intent_id: tx.stripe_payment_intent_id,
      amount: Number(tx.amount ?? 0),
      note,
    },
    request: req,
  });

  return NextResponse.json({
    ok: true,
    booking_id: booking.id,
    transaction_id: tx.id,
  });
}
