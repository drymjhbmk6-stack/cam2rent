import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { checkAdminAuth } from '@/lib/admin-auth';
import { logAudit } from '@/lib/audit';
import type Stripe from 'stripe';
import { getStripe } from '@/lib/stripe';
import { getStripeSecretKey, isTestMode } from '@/lib/env-mode';
import { getBerlinDayStartFromDateString, getBerlinDayEndFromDateString } from '@/lib/timezone';

export async function POST(req: NextRequest) {
  if (!(await checkAdminAuth())) {
    return NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 401 });
  }

  const body = await req.json();
  const { from, to } = body;

  if (!from || !to) {
    return NextResponse.json({ error: 'from und to erforderlich.' }, { status: 400 });
  }

  if (!(await getStripeSecretKey())) {
    return NextResponse.json({ error: 'Stripe API-Key nicht konfiguriert.' }, { status: 500 });
  }

  const stripe = await getStripe();
  const testMode = await isTestMode();
  const supabase = createServiceClient();

  // PaymentIntents von Stripe laden — Berlin-TZ-bewusste Tagesgrenzen,
  // sonst wird ein Stripe-Zahlungs-Sync z.B. am Monatswechsel um Stunden
  // verschoben (Stripe arbeitet mit Unix-Timestamps, also UTC).
  const fromIso = getBerlinDayStartFromDateString(from) ?? `${from}T00:00:00Z`;
  const toIso = getBerlinDayEndFromDateString(to) ?? `${to}T23:59:59Z`;
  const fromTs = Math.floor(new Date(fromIso).getTime() / 1000);
  const toTs = Math.floor(new Date(toIso).getTime() / 1000);

  let synced = 0;
  let hasMore = true;
  let startingAfter: string | undefined;

  while (hasMore) {
    const params: Stripe.PaymentIntentListParams = {
      created: { gte: fromTs, lte: toTs },
      limit: 100,
    };
    if (startingAfter) params.starting_after = startingAfter;

    const paymentIntents = await stripe.paymentIntents.list(params);

    for (const pi of paymentIntents.data) {
      if (pi.status !== 'succeeded') continue;

      const amount = pi.amount / 100; // Cent → Euro

      // Gebühren aus Charge laden
      let fee = 0;
      let net = amount;
      let chargeId: string | null = null;

      if (pi.latest_charge && typeof pi.latest_charge === 'string') {
        try {
          const charge = await stripe.charges.retrieve(pi.latest_charge, {
            expand: ['balance_transaction'],
          });
          chargeId = charge.id;
          const bt = charge.balance_transaction;
          if (bt && typeof bt !== 'string') {
            fee = bt.fee / 100;
            net = bt.net / 100;
          }
        } catch {
          // Charge nicht gefunden — kein Fehler
        }
      }

      // Stripe-Source-Felder, die bei jedem Sync aktualisiert werden duerfen.
      const stripeFields = {
        stripe_payment_intent_id: pi.id,
        stripe_charge_id: chargeId,
        amount,
        fee,
        net,
        currency: pi.currency?.toUpperCase() || 'EUR',
        status: pi.status,
        payment_method: typeof pi.payment_method === 'string' ? pi.payment_method : null,
        stripe_created_at: new Date(pi.created * 1000).toISOString(),
        synced_at: new Date().toISOString(),
        is_test: testMode,
      };

      // Existierende Row pruefen: user-gesetzte States (manual / refunded) muessen
      // erhalten bleiben — vorher hat der Sync bei jedem Lauf `booking_id` +
      // `match_status` blind ueberschrieben und damit manuelle Verknuepfungen
      // sowie Erstattungs-Markierungen ausgeloescht.
      const { data: existing } = await supabase
        .from('stripe_transactions')
        .select('id, match_status')
        .eq('stripe_payment_intent_id', pi.id)
        .maybeSingle();

      const userSet =
        existing && (existing.match_status === 'manual' || existing.match_status === 'refunded');

      if (userSet && existing) {
        // Nur Stripe-Source-Felder refreshen, Link/Status NICHT antasten.
        const { error } = await supabase
          .from('stripe_transactions')
          .update(stripeFields)
          .eq('id', existing.id);
        if (!error) synced++;
      } else {
        // Auto-Match — zwei Stufen + Doppelzahlungs-Schutz:
        //  Stufe 1: exakter Lookup ueber bookings.payment_intent_id (Stripe-Webhook
        //           hat den richtigen PI eingetragen). Standard-Pfad.
        //  Stufe 2: Fallback per Stripe-Receipt-Email + Betrag — gilt nur fuer
        //           Buchungen, deren payment_intent_id noch auf PENDING-/AWAITING-/
        //           MANUAL-UNPAID-Praefix steht oder leer ist (= Webhook lief nicht
        //           durch oder Buchung wurde noch nicht bezahlt-flagged). Eindeutig
        //           → matchen + bookings.payment_intent_id korrigieren.
        //  Schutz:  Findet einer der Lookups eine Buchung, die bereits durch eine
        //           ANDERE stripe_transactions-Row (match_status matched/manual)
        //           bedient ist, wird der aktuelle PI als unmatched gelassen +
        //           reconciliation_note "Moegliche Doppelzahlung" gesetzt. So
        //           erkennt der Admin den Erstattungs-Fall ohne falsche Verknuepfung.
        let booking: { id: string } | null = null;
        let matchSource: 'pi' | 'email_amount' | null = null;
        let duplicateNote: string | null = null;

        // Stufe 1: PI-Lookup
        const { data: pmDirect } = await supabase
          .from('bookings')
          .select('id')
          .eq('payment_intent_id', pi.id)
          .maybeSingle();
        if (pmDirect?.id) {
          booking = pmDirect;
          matchSource = 'pi';
        }

        // Stufe 2: Email + Betrag (nur wenn Stufe 1 nichts gefunden hat)
        if (!booking) {
          const receiptEmail = (pi.receipt_email ?? '').toString().trim().toLowerCase();
          if (receiptEmail) {
            const { data: candidates } = await supabase
              .from('bookings')
              .select('id, payment_intent_id, customer_email, price_total')
              .ilike('customer_email', receiptEmail)
              .gte('price_total', amount - 0.5)
              .lte('price_total', amount + 0.5)
              .neq('status', 'cancelled');
            const eligible = (candidates ?? []).filter((b) => {
              const piId = (b.payment_intent_id ?? '').toString();
              // Buchung darf noch keine "echte" Stripe-PI haben — sonst wuerden
              // wir Doppelzahlungen faelschlich zuordnen.
              return !piId || /^(PENDING|AWAITING|MANUAL-UNPAID)/i.test(piId);
            });
            if (eligible.length === 1) {
              booking = { id: eligible[0].id };
              matchSource = 'email_amount';
            } else if (eligible.length > 1) {
              duplicateNote = `Auto-Match abgebrochen: ${eligible.length} offene Buchungen mit Email "${receiptEmail}" und Betrag ${amount.toFixed(2)} EUR gefunden — bitte manuell zuordnen.`;
            }
          }
        }

        // Doppelzahlungs-Schutz: gibt es bereits eine ANDERE verknuepfte
        // Stripe-Tx fuer diese Buchung?
        if (booking) {
          const { data: otherTxs } = await supabase
            .from('stripe_transactions')
            .select('stripe_payment_intent_id, match_status')
            .eq('booking_id', booking.id)
            .neq('stripe_payment_intent_id', pi.id)
            .in('match_status', ['matched', 'manual']);
          if (otherTxs && otherTxs.length > 0) {
            duplicateNote = `Moegliche Doppelzahlung: Buchung wurde bereits ueber ${otherTxs[0].stripe_payment_intent_id} bezahlt — pruefe Erstattung.`;
            booking = null;
            matchSource = null;
          }
        }

        // Wenn Auto-Match per Email-Fallback erfolgte: bookings.payment_intent_id
        // korrigieren (war PENDING/AWAITING/MANUAL-UNPAID/leer). Sonst greift
        // der naechste Webhook-/Refund-Pfad nicht.
        if (booking && matchSource === 'email_amount') {
          await supabase
            .from('bookings')
            .update({ payment_intent_id: pi.id })
            .eq('id', booking.id);
        }

        // reconciliation_note nur setzen wenn Duplikats-Verdacht UND keine
        // User-Notiz schon vorhanden ist (sonst kein Ueberschreiben).
        let noteToWrite: string | null | undefined = undefined;
        if (duplicateNote) {
          try {
            const { data: existingRow } = await supabase
              .from('stripe_transactions')
              .select('reconciliation_note')
              .eq('stripe_payment_intent_id', pi.id)
              .maybeSingle();
            if (!existingRow?.reconciliation_note) {
              noteToWrite = duplicateNote;
            }
          } catch {
            // reconciliation_note-Spalte fehlt (Migration ausstehend) —
            // ohne Notiz weitermachen, der Match-Status alleine ist nuetzlich.
            noteToWrite = undefined;
          }
        }

        const baseUpsertRow: Record<string, unknown> = {
          ...stripeFields,
          booking_id: booking?.id || null,
          match_status: booking?.id ? 'matched' : 'unmatched',
        };
        const upsertRowWithNote =
          noteToWrite !== undefined ? { ...baseUpsertRow, reconciliation_note: noteToWrite } : baseUpsertRow;

        let { error } = await supabase
          .from('stripe_transactions')
          .upsert(upsertRowWithNote, { onConflict: 'stripe_payment_intent_id' });
        // Defensiver Retry ohne reconciliation_note, falls Migration ausstehend
        if (
          error &&
          noteToWrite !== undefined &&
          /reconciliation_note|column|schema cache|PGRST/i.test(error.message)
        ) {
          const retry = await supabase
            .from('stripe_transactions')
            .upsert(baseUpsertRow, { onConflict: 'stripe_payment_intent_id' });
          error = retry.error;
        }

        if (!error) synced++;
      }
    }

    hasMore = paymentIntents.has_more;
    if (paymentIntents.data.length > 0) {
      startingAfter = paymentIntents.data[paymentIntents.data.length - 1].id;
    } else {
      hasMore = false;
    }
  }

  await logAudit({
    action: 'stripe.sync_run',
    entityType: 'stripe_transaction',
    changes: { from, to, synced },
    request: req,
  });

  return NextResponse.json({ synced });
}
