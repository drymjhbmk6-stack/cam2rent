import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { checkAdminAuth } from '@/lib/admin-auth';
import { getBerlinDayStartFromDateString, getBerlinDayEndFromDateString } from '@/lib/timezone';

export async function GET(req: NextRequest) {
  if (!(await checkAdminAuth())) {
    return NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 401 });
  }

  const from = req.nextUrl.searchParams.get('from');
  const to = req.nextUrl.searchParams.get('to');
  const fromIso = from ? (getBerlinDayStartFromDateString(from) ?? `${from}T00:00:00Z`) : null;
  const toIso = to ? (getBerlinDayEndFromDateString(to) ?? `${to}T23:59:59Z`) : null;

  const supabase = createServiceClient();

  const txCols = 'id, stripe_payment_intent_id, stripe_created_at, booking_id, amount, fee, net, match_status, reconciliation_note';
  const buildTxQuery = (cols: string) => {
    let q = supabase
      .from('stripe_transactions')
      .select(cols)
      .order('stripe_created_at', { ascending: false });
    if (fromIso) q = q.gte('stripe_created_at', fromIso);
    if (toIso) q = q.lte('stripe_created_at', toIso);
    return q;
  };

  let { data, error } = await buildTxQuery(txCols);
  if (error && /reconciliation_note|column|schema cache|PGRST/i.test(error.message)) {
    // Migration supabase-bookings-refund.sql noch nicht durch.
    ({ data, error } = await buildTxQuery(txCols.replace(', reconciliation_note', '')));
  }

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // .select(<string-variable>) verliert die PostgREST-Typinferenz → Cast.
  type TxRow = {
    id: string; stripe_payment_intent_id: string; stripe_created_at: string;
    booking_id: string | null; amount: number; fee: number; net: number;
    match_status: string; reconciliation_note?: string | null;
  };
  type TxRowOut = TxRow & {
    duplicate_of_booking_id?: string | null;
    duplicate_of_tx_id?: string | null;
  };
  const transactions = (data ?? []) as unknown as TxRow[];
  const matched = transactions.filter(t => t.match_status === 'matched' || t.match_status === 'manual').length;
  const unmatchedStripe = transactions.filter(t => t.match_status === 'unmatched').length;
  const totalFees = transactions.reduce((sum, t) => sum + (t.fee || 0), 0);

  // ── Doppelzahlungs-Detection ─────────────────────────────────────────────
  // Pro unmatched-Transaktion pruefen, ob im selben/angrenzenden Zeitraum eine
  // verknuepfte Transaktion mit gleichem Betrag (cent-exakt) zur gleichen
  // Buchung existiert. Wenn ja → die unmatched Tx ist sehr wahrscheinlich eine
  // Doppelzahlung dieser Buchung (Kunde hat zweimal bezahlt). Die UI zeigt
  // dann einen Quick-Action-Button „Als Doppelzahlung erfassen".
  // Detection ist defensiv: nur bei klarer Eindeutigkeit (genau eine matched
  // Tx mit gleichem Betrag, derselbe Tag ±3 Tage).
  const unmatched = transactions.filter(t => t.match_status === 'unmatched');
  const linked = transactions.filter(t => t.booking_id && (t.match_status === 'matched' || t.match_status === 'manual'));
  const duplicateMap = new Map<string, { booking_id: string; tx_id: string }>();
  for (const orphan of unmatched) {
    const orphanTime = new Date(orphan.stripe_created_at).getTime();
    const sameAmount = linked.filter((l) => {
      if (Math.abs(Number(l.amount ?? 0) - Number(orphan.amount ?? 0)) > 0.005) return false;
      const linkedTime = new Date(l.stripe_created_at).getTime();
      const diffDays = Math.abs(linkedTime - orphanTime) / (24 * 60 * 60 * 1000);
      return diffDays <= 3;
    });
    if (sameAmount.length === 1 && sameAmount[0].booking_id) {
      duplicateMap.set(orphan.id, {
        booking_id: sameAmount[0].booking_id,
        tx_id: sameAmount[0].id,
      });
    }
  }
  const transactionsOut: TxRowOut[] = transactions.map((t) => {
    const dup = duplicateMap.get(t.id);
    if (!dup) return t;
    return { ...t, duplicate_of_booking_id: dup.booking_id, duplicate_of_tx_id: dup.tx_id };
  });

  // Buchungen ohne Stripe prüfen
  let unmatchedBooking = 0;
  if (fromIso && toIso) {
    const { data: bookings } = await supabase
      .from('bookings')
      .select('id, payment_intent_id')
      .neq('status', 'cancelled')
      .gte('created_at', fromIso)
      .lte('created_at', toIso);

    const stripeIds = new Set(transactions.map(t => t.stripe_payment_intent_id));
    unmatchedBooking = (bookings || []).filter(b => b.payment_intent_id && !stripeIds.has(b.payment_intent_id)).length;
  }

  return NextResponse.json({
    transactions: transactionsOut,
    summary: {
      total: transactions.length,
      matched,
      unmatched_stripe: unmatchedStripe,
      unmatched_booking: unmatchedBooking,
      total_fees: totalFees,
      duplicates: duplicateMap.size,
    },
  });
}
