import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { checkAdminAuth } from '@/lib/admin-auth';
import { logAudit } from '@/lib/audit';
import { isTestMode } from '@/lib/env-mode';
import { getStripe } from '@/lib/stripe';
import { getBerlinDayStartFromDateString, getBerlinDayEndFromDateString } from '@/lib/timezone';

/**
 * POST /api/admin/buchhaltung/stripe-reconciliation/import-fees
 * Importiert Stripe-Zahlungsgebühren als Ausgaben (idempotent via source_type + source_id).
 *
 * Für jede Transaktion werden über stripe.refunds.list() alle Rückerstattungen
 * geladen (expand: balance_transaction). Die Gebühren-Gutschrift (negativer fee
 * auf dem Refund-Balancetransfer) wird vom Bruttobetrag abgezogen:
 *   z.B. 0,87 € − 0,36 € = 0,51 € effektive Gebühr.
 *
 * PayPal-Split: Zahlt der Kunde über Stripe per PayPal, enthält die von Stripe
 * abgezogene Gesamtgebühr zwei Anteile — den Stripe-Anteil (`stripe_fee`) und die
 * PayPal-Durchleitungsgebühr (`payment_method_passthrough_fee`). Diese stehen
 * einzeln in `balance_transaction.fee_details[]`. Wir legen dann ZWEI Ausgaben an:
 * eine mit Anbieter „Stripe" und eine mit Anbieter „PayPal". Reine Kartenzahlungen
 * (keine Durchleitungsgebühr) erzeugen weiterhin genau EINEN Stripe-Eintrag.
 */
export async function POST(req: NextRequest) {
  if (!(await checkAdminAuth())) {
    return NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 401 });
  }

  const body = await req.json();
  const { from, to } = body;

  if (!from || !to) {
    return NextResponse.json({ error: 'from und to erforderlich.' }, { status: 400 });
  }

  const supabase = createServiceClient();
  const testMode = await isTestMode();
  let imported = 0;
  let updated = 0;
  let paypalImported = 0;

  // Idempotenter Insert einer einzelnen Gebühren-Ausgabe (Stripe- oder PayPal-Anteil).
  // Gibt zurück, ob eingefügt ('inserted'), Beschreibung geheilt ('healed') oder
  // bereits vorhanden/übersprungen ('skip').
  async function upsertFeeExpense(opts: {
    sourceId: string;
    vendor: string;
    description: string;
    autoPrefix: string;
    amount: number;
    expenseDate: string;
    hasBookingId: boolean;
    isTest: boolean;
  }): Promise<'inserted' | 'healed' | 'skip'> {
    if (opts.amount <= 0) return 'skip';

    const { data: existing } = await supabase
      .from('expenses')
      .select('id, description')
      .eq('source_type', 'stripe_fee')
      .eq('source_id', opts.sourceId)
      .maybeSingle();

    if (existing) {
      // Selbstheilung: nur auto-generierte Beschreibungen aktualisieren,
      // manuell umbenannte Einträge bleiben unangetastet.
      const isAuto = (existing.description || '').startsWith(opts.autoPrefix);
      if (opts.hasBookingId && isAuto && existing.description !== opts.description) {
        const { error: updErr } = await supabase
          .from('expenses')
          .update({ description: opts.description })
          .eq('id', existing.id);
        if (!updErr) return 'healed';
      }
      return 'skip';
    }

    const { error } = await supabase.from('expenses').insert({
      expense_date: opts.expenseDate,
      category: 'stripe_fees',
      description: opts.description,
      vendor: opts.vendor,
      net_amount: opts.amount,
      tax_amount: 0,
      gross_amount: opts.amount,
      source_type: 'stripe_fee',
      source_id: opts.sourceId,
      // is_test der gematchten Buchung (nicht pauschal der globale Modus),
      // damit die Gebuehr in der richtigen Test/Live-Welt landet.
      is_test: opts.isTest,
    });
    return error ? 'skip' : 'inserted';
  }

  // Zahlungsgebühren aus stripe_transactions laden — Berlin-TZ-bewusst
  const fromIso = getBerlinDayStartFromDateString(from) ?? `${from}T00:00:00Z`;
  const toIso = getBerlinDayEndFromDateString(to) ?? `${to}T23:59:59Z`;
  const { data: transactions } = await supabase
    .from('stripe_transactions')
    .select('id, stripe_payment_intent_id, stripe_charge_id, fee, stripe_created_at, booking_id, match_status, is_test')
    .gt('fee', 0)
    .gte('stripe_created_at', fromIso)
    .lte('stripe_created_at', toIso);

  // is_test der gematchten Buchungen bulk laden — die Gebuehren-Ausgabe soll
  // in die is_test-Welt der Buchung fallen, und Transaktionen der fremden Welt
  // werden uebersprungen.
  const bookingIds = Array.from(
    new Set(
      (transactions || [])
        .map((t: { booking_id: string | null }) => t.booking_id)
        .filter((id: string | null): id is string => !!id),
    ),
  );
  const bookingIsTest = new Map<string, boolean>();
  if (bookingIds.length > 0) {
    const { data: bRows } = await supabase
      .from('bookings')
      .select('id, is_test')
      .in('id', bookingIds);
    for (const b of bRows || []) bookingIsTest.set(b.id as string, !!b.is_test);
  }

  for (const tx of transactions || []) {
    // is_test bevorzugt aus der gematchten Buchung, sonst aus der Transaktion,
    // sonst globaler Modus. Transaktionen der fremden Test/Live-Welt ueberspringen.
    const txIsTest =
      tx.booking_id && bookingIsTest.has(tx.booking_id)
        ? bookingIsTest.get(tx.booking_id)!
        : typeof tx.is_test === 'boolean'
          ? tx.is_test
          : testMode;
    if (txIsTest !== testMode) continue;

    const piShort = `${tx.stripe_payment_intent_id.slice(0, 20)}...`;
    const expenseDate = tx.stripe_created_at ? tx.stripe_created_at.split('T')[0] : from;

    // Beschreibungen: Buchungsnummer bevorzugen (lesbar), sonst PaymentIntent-ID
    const stripeDescription = tx.booking_id
      ? `Stripe-Gebühren von der Bestellung ${tx.booking_id}`
      : `Stripe-Gebühr für ${piShort}`;
    const paypalDescription = tx.booking_id
      ? `PayPal-Gebühren von der Bestellung ${tx.booking_id}`
      : `PayPal-Gebühr für ${piShort}`;
    const paypalSourceId = `${tx.id}:paypal`;

    // Idempotenz-Gate: ist der Stripe-Anteil schon importiert, war die Transaktion
    // bereits verarbeitet → nur Beschreibungen heilen, keine neuen Stripe-Calls.
    const { data: existing } = await supabase
      .from('expenses')
      .select('id, description')
      .eq('source_type', 'stripe_fee')
      .eq('source_id', tx.id)
      .maybeSingle();

    if (existing) {
      // Selbstheilung Stripe-Anteil
      const isAutoDescription = (existing.description || '').startsWith('Stripe-Gebühr');
      if (tx.booking_id && isAutoDescription && existing.description !== stripeDescription) {
        const { error: updErr } = await supabase
          .from('expenses')
          .update({ description: stripeDescription })
          .eq('id', existing.id);
        if (!updErr) updated++;
      }
      // Selbstheilung PayPal-Anteil (falls vorhanden)
      const { data: existingPaypal } = await supabase
        .from('expenses')
        .select('id, description')
        .eq('source_type', 'stripe_fee')
        .eq('source_id', paypalSourceId)
        .maybeSingle();
      if (existingPaypal) {
        const isAutoPaypal = (existingPaypal.description || '').startsWith('PayPal-Gebühr');
        if (tx.booking_id && isAutoPaypal && existingPaypal.description !== paypalDescription) {
          const { error: updErr } = await supabase
            .from('expenses')
            .update({ description: paypalDescription })
            .eq('id', existingPaypal.id);
          if (!updErr) updated++;
        }
      }
      continue;
    }

    // ── Gebühren-Aufschlüsselung aus Stripe ermitteln ──────────────────────────
    // Standard: gesamte Gebühr = Stripe-Anteil, kein PayPal-Anteil (Kartenzahlung).
    // Bei PayPal-über-Stripe trennt `balance_transaction.fee_details[]` den
    // Stripe-Anteil (`stripe_fee`) von der Durchleitungsgebühr
    // (`payment_method_passthrough_fee`, = PayPal-Gebühr).
    let stripeFeeGross = tx.fee;
    let paypalFeeGross = 0;
    let stripeRefundCredit = 0; // <= 0
    let paypalRefundCredit = 0; // <= 0
    let splitOk = false;

    try {
      const stripe = await getStripe();

      // Charge mit Balancetransfer laden → fee_details für den Brutto-Split
      const chargeId = typeof tx.stripe_charge_id === 'string' ? tx.stripe_charge_id : null;
      if (chargeId) {
        const charge = await stripe.charges.retrieve(chargeId, {
          expand: ['balance_transaction'],
        });
        const bt = charge.balance_transaction;
        if (bt && typeof bt === 'object' && Array.isArray(bt.fee_details)) {
          let sFee = 0;
          let pFee = 0;
          for (const fd of bt.fee_details) {
            const amt = Number(fd.amount || 0) / 100;
            if (fd.type === 'payment_method_passthrough_fee') pFee += amt;
            else sFee += amt;
          }
          // Nur splitten, wenn ein Durchleitungsanteil existiert UND die Summe
          // der Gesamtgebühr entspricht (Sanity gegen Teil-Daten).
          if (pFee > 0 && Math.abs(sFee + pFee - tx.fee) < 0.02) {
            stripeFeeGross = sFee;
            paypalFeeGross = pFee;
            splitOk = true;
          }
        }
      }

      // Rückerstattungen laden (Balance-Transaktion hängt an der Refund-ID)
      const refunds = await stripe.refunds.list({
        payment_intent: tx.stripe_payment_intent_id,
        limit: 10,
        expand: ['data.balance_transaction'],
      });

      for (const refund of refunds.data) {
        const bt = refund.balance_transaction;
        if (!(bt && typeof bt === 'object' && 'fee' in bt)) continue;

        if (splitOk && Array.isArray(bt.fee_details)) {
          // Gutschrift pro Gebühren-Typ zurückrechnen (fee-Werte sind negativ).
          for (const fd of bt.fee_details) {
            const amt = Number(fd.amount || 0) / 100;
            if (fd.type === 'payment_method_passthrough_fee') paypalRefundCredit += amt;
            else stripeRefundCredit += amt;
          }
        } else {
          // Kein Split (Karte) oder keine Detail-Aufschlüsselung → alles Stripe.
          stripeRefundCredit += (bt as { fee: number }).fee / 100;
        }
      }
    } catch (err) {
      // Bei Stripe-API-Fehler: Bruttobetrag als ein Stripe-Eintrag, kein Split.
      console.error('[import-fees] Stripe-API-Fehler für', tx.stripe_payment_intent_id, err);
      stripeFeeGross = tx.fee;
      paypalFeeGross = 0;
      stripeRefundCredit = 0;
      paypalRefundCredit = 0;
      splitOk = false;
    }

    const effectiveStripeFee = Math.max(0, stripeFeeGross + Math.min(0, stripeRefundCredit));
    const effectivePaypalFee = Math.max(0, paypalFeeGross + Math.min(0, paypalRefundCredit));

    // Stripe-Anteil verbuchen
    const stripeResult = await upsertFeeExpense({
      sourceId: tx.id,
      vendor: 'Stripe',
      description: stripeDescription,
      autoPrefix: 'Stripe-Gebühr',
      amount: effectiveStripeFee,
      expenseDate,
      hasBookingId: !!tx.booking_id,
      isTest: txIsTest,
    });
    if (stripeResult === 'inserted') imported++;
    else if (stripeResult === 'healed') updated++;

    // PayPal-Anteil verbuchen (nur wenn Durchleitungsgebühr vorhanden)
    if (splitOk && effectivePaypalFee > 0) {
      const paypalResult = await upsertFeeExpense({
        sourceId: paypalSourceId,
        vendor: 'PayPal',
        description: paypalDescription,
        autoPrefix: 'PayPal-Gebühr',
        amount: effectivePaypalFee,
        expenseDate,
        hasBookingId: !!tx.booking_id,
        isTest: txIsTest,
      });
      if (paypalResult === 'inserted') paypalImported++;
      else if (paypalResult === 'healed') updated++;
    }
  }

  await logAudit({
    action: 'stripe.import_fees',
    entityType: 'expense',
    changes: {
      from,
      to,
      imported,
      paypalImported,
      updated,
      paymentFees: (transactions || []).length,
    },
    request: req,
  });

  return NextResponse.json({
    imported,
    paypalImported,
    updated,
    total: (transactions || []).length,
  });
}
