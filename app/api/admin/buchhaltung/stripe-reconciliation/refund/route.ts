import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { checkAdminAuth } from '@/lib/admin-auth';
import { logAudit } from '@/lib/audit';

/**
 * POST /api/admin/buchhaltung/stripe-reconciliation/refund
 *
 * Erfasst eine Rückerstattung / Fehlbuchung zu einer Stripe-Transaktion.
 *
 * Body: {
 *   transaction_id: string,
 *   scope: 'full' | 'partial',
 *   amount?: number,            // bei scope='partial' der einnahmemindernde Gesamtbetrag
 *   reduces_income: boolean,    // false = Stripe-Überzahlung/Fehlbuchung korrigiert (KEIN Abzug)
 *   note: string,
 * }
 *
 * Zwei Pfade:
 *  - Transaktion ist mit einer Buchung verknüpft (matched/manual):
 *    `bookings.refund_amount` wird **absolut** gesetzt (selbstheilend, idempotent):
 *      - reduces_income=false → 0  (Stripe hat zu viel eingezogen, der
 *        Buchungs-/Rechnungsbetrag war bereits korrekt → kein Einkommen-Abzug,
 *        die 3,95 € rein/raus über Stripe sind ein Nullsummen-Vorgang)
 *      - reduces_income=true, scope='full'    → kompletter Buchungsbetrag (Netto 0)
 *      - reduces_income=true, scope='partial' → der eingegebene Betrag (gedeckelt)
 *    Audit-Zeile an `bookings.refund_note`, Kommentar an
 *    `stripe_transactions.reconciliation_note`. EÜR + DATEV ziehen
 *    `refund_amount` vom Einkommen ab.
 *  - Transaktion ist KEINER Buchung zugeordnet (unmatched):
 *    `match_status='refunded'` + `reconciliation_note`. Kein Einkommens-Effekt
 *    (war nie Einnahme — EÜR/DATEV sind buchungsbasiert). Stripe-Gebühr bleibt
 *    als Ausgabe (import-fees filtert nicht nach match_status).
 */
export async function POST(req: NextRequest) {
  if (!(await checkAdminAuth())) {
    return NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const { transaction_id, scope, amount, reduces_income, note } = body as {
    transaction_id?: string;
    scope?: string;
    amount?: number;
    reduces_income?: boolean;
    note?: string;
  };

  if (!transaction_id) {
    return NextResponse.json({ error: 'transaction_id erforderlich.' }, { status: 400 });
  }
  if (scope !== 'full' && scope !== 'partial') {
    return NextResponse.json({ error: "scope muss 'full' oder 'partial' sein." }, { status: 400 });
  }
  const cleanNote = String(note ?? '').trim().slice(0, 1000);
  if (cleanNote.length < 3) {
    return NextResponse.json({ error: 'Kommentar erforderlich (mind. 3 Zeichen).' }, { status: 400 });
  }
  const reducesIncome = reduces_income === true;
  let partialAmt = 0;
  if (reducesIncome && scope === 'partial') {
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

  // ── Pfad A: verknüpfte Buchung ────────────────────────────────────────────
  if (tx.booking_id) {
    const { data: booking } = await supabase
      .from('bookings')
      .select('id, price_rental, price_accessories, price_haftung, shipping_price, discount_amount, duration_discount, loyalty_discount, refund_note')
      .eq('id', tx.booking_id)
      .maybeSingle();

    if (!booking) {
      return NextResponse.json({ error: 'Verknüpfte Buchung nicht gefunden.' }, { status: 404 });
    }

    // Realisierter Rechnungsbetrag der Buchung (= das, was die EÜR ohne
    // refund_amount ohnehin als Einnahme zählt).
    const bookingTotal = Math.max(
      0,
      Math.round(
        (Number(booking.price_rental ?? 0) +
          Number(booking.price_accessories ?? 0) +
          Number(booking.price_haftung ?? 0) +
          Number(booking.shipping_price ?? 0) -
          Number(booking.discount_amount ?? 0) -
          Number(booking.duration_discount ?? 0) -
          Number(booking.loyalty_discount ?? 0)) * 100,
      ) / 100,
    );

    // refund_amount wird ABSOLUT gesetzt (idempotent, selbstheilend).
    let newRefund: number;
    let kindLabel: string;
    if (!reducesIncome) {
      newRefund = 0;
      kindLabel = 'Stripe-Überzahlung / Fehlbuchung korrigiert — kein Einnahme-Abzug';
    } else if (scope === 'full') {
      newRefund = bookingTotal;
      kindLabel = `Volle Erstattung — Einnahme auf 0 (${bookingTotal.toFixed(2)} EUR)`;
    } else {
      newRefund = Math.min(bookingTotal, partialAmt);
      kindLabel = `Teilerstattung — Einnahme −${newRefund.toFixed(2)} EUR`;
    }

    const line = `[${stamp}] ${kindLabel} (Stripe ${tx.id}): ${cleanNote}`;
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
      changes: { transaction_id: tx.id, scope, reduces_income: reducesIncome, refund_amount: newRefund, note: cleanNote },
      request: req,
    });

    return NextResponse.json({ ok: true, target: 'booking', booking_id: booking.id, refund_amount: newRefund, booking_total: bookingTotal });
  }

  // ── Pfad B: keine Buchung → als Fehlbuchung/Erstattet markieren ───────────
  const { error } = await supabase
    .from('stripe_transactions')
    .update({ match_status: 'refunded', reconciliation_note: cleanNote })
    .eq('id', tx.id);

  if (error) {
    if (/reconciliation_note|column|schema cache|PGRST/i.test(error.message)) {
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
    changes: { scope, amount: Number(tx.amount ?? 0), note: cleanNote },
    request: req,
  });

  return NextResponse.json({ ok: true, target: 'transaction' });
}
