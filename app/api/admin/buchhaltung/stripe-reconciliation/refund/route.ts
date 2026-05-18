import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { checkAdminAuth } from '@/lib/admin-auth';
import { logAudit } from '@/lib/audit';

/**
 * POST /api/admin/buchhaltung/stripe-reconciliation/refund
 *
 * Erfasst eine Rückerstattung / Fehlbuchung zu einer Stripe-Transaktion.
 *
 * Body: { transaction_id, mode: 'full' | 'partial', amount?: number, note: string }
 *
 * Zwei Pfade:
 *  - Transaktion ist mit einer Buchung verknüpft (matched/manual):
 *    Die Erstattung landet als `bookings.refund_amount` (+ Audit in
 *    `bookings.refund_note`). EÜR + DATEV ziehen das vom Einkommen ab.
 *    `mode='full'` → komplette Buchungseinnahme wird erstattet (Netto 0).
 *  - Transaktion ist KEINER Buchung zugeordnet (unmatched):
 *    `match_status='refunded'` + `reconciliation_note`. Der Betrag zählt
 *    ohnehin nicht als Einnahme (EÜR/DATEV sind buchungsbasiert) — die
 *    Markierung dokumentiert die Fehlbuchung und räumt das
 *    "Nicht zugeordnet"-Postfach auf. Die Stripe-Gebühr bleibt als Ausgabe
 *    (der Gebühren-Import filtert nicht nach match_status).
 */
export async function POST(req: NextRequest) {
  if (!(await checkAdminAuth())) {
    return NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const { transaction_id, mode, amount, note } = body as {
    transaction_id?: string;
    mode?: string;
    amount?: number;
    note?: string;
  };

  if (!transaction_id) {
    return NextResponse.json({ error: 'transaction_id erforderlich.' }, { status: 400 });
  }
  if (mode !== 'full' && mode !== 'partial') {
    return NextResponse.json({ error: "mode muss 'full' oder 'partial' sein." }, { status: 400 });
  }
  const cleanNote = String(note ?? '').trim().slice(0, 1000);
  if (cleanNote.length < 3) {
    return NextResponse.json({ error: 'Kommentar erforderlich (mind. 3 Zeichen).' }, { status: 400 });
  }
  let partialAmt = 0;
  if (mode === 'partial') {
    partialAmt = Math.round(Number(amount) * 100) / 100;
    if (!(partialAmt > 0)) {
      return NextResponse.json({ error: 'Erstattungsbetrag muss größer als 0 sein.' }, { status: 400 });
    }
  }

  const supabase = createServiceClient();

  const { data: tx } = await supabase
    .from('stripe_transactions')
    .select('id, booking_id, amount, match_status')
    .eq('id', transaction_id)
    .maybeSingle();

  if (!tx) {
    return NextResponse.json({ error: 'Transaktion nicht gefunden.' }, { status: 404 });
  }

  const stamp = new Date().toLocaleString('de-DE', { timeZone: 'Europe/Berlin' });

  // ── Pfad A: verknüpfte Buchung → Erstattung auf die Buchung ───────────────
  if (tx.booking_id) {
    const { data: booking } = await supabase
      .from('bookings')
      .select('id, price_rental, price_accessories, price_haftung, shipping_price, refund_amount, refund_note')
      .eq('id', tx.booking_id)
      .maybeSingle();

    if (!booking) {
      return NextResponse.json({ error: 'Verknüpfte Buchung nicht gefunden.' }, { status: 404 });
    }

    const income =
      Number(booking.price_rental ?? 0) +
      Number(booking.price_accessories ?? 0) +
      Number(booking.price_haftung ?? 0) +
      Number(booking.shipping_price ?? 0);
    const existing = Number(booking.refund_amount ?? 0);
    const delta = mode === 'full' ? Math.max(0, income - existing) : partialAmt;
    const newRefund = Math.min(income, Math.round((existing + delta) * 100) / 100);

    const line = `[${stamp}] ${mode === 'full' ? 'Volle Erstattung' : 'Teilerstattung'} ${delta.toFixed(2)} EUR (Stripe ${tx.id}): ${cleanNote}`;
    const appendedNote = booking.refund_note ? `${booking.refund_note}\n${line}` : line;

    const { error } = await supabase
      .from('bookings')
      .update({ refund_amount: newRefund, refund_note: appendedNote })
      .eq('id', booking.id);

    if (error) {
      if (/refund_amount|refund_note|column|schema cache|PGRST/i.test(error.message)) {
        return NextResponse.json(
          { error: 'Migration ausstehend: supabase/supabase-bookings-refund.sql ausführen.' },
          { status: 503 },
        );
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Kommentar best-effort auch an der Transaktion vermerken.
    const noteRes = await supabase
      .from('stripe_transactions')
      .update({ reconciliation_note: cleanNote })
      .eq('id', tx.id);
    if (noteRes.error) {
      console.warn('[refund] reconciliation_note konnte nicht gesetzt werden (Migration?):', noteRes.error.message);
    }

    await logAudit({
      action: 'stripe.refund',
      entityType: 'booking',
      entityId: booking.id,
      changes: { transaction_id: tx.id, mode, delta, refund_amount: newRefund, note: cleanNote },
      request: req,
    });

    return NextResponse.json({ ok: true, target: 'booking', booking_id: booking.id, refund_amount: newRefund });
  }

  // ── Pfad B: keine Buchung → als Fehlbuchung/Erstattet markieren ───────────
  const { error } = await supabase
    .from('stripe_transactions')
    .update({ match_status: 'refunded', reconciliation_note: cleanNote })
    .eq('id', tx.id);

  if (error) {
    if (/reconciliation_note|column|schema cache|PGRST/i.test(error.message)) {
      // Spalte fehlt (Migration nicht durch) → nur Status setzen.
      const { error: e2 } = await supabase
        .from('stripe_transactions')
        .update({ match_status: 'refunded' })
        .eq('id', tx.id);
      if (e2) {
        return NextResponse.json({ error: e2.message }, { status: 500 });
      }
    } else {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  await logAudit({
    action: 'stripe.refund',
    entityType: 'stripe_transaction',
    entityId: tx.id,
    changes: { mode, amount: mode === 'partial' ? partialAmt : Number(tx.amount ?? 0), note: cleanNote },
    request: req,
  });

  return NextResponse.json({ ok: true, target: 'transaction' });
}
