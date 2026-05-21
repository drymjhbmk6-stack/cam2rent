import { createServiceClient } from '@/lib/supabase';
import type Stripe from 'stripe';
import { getStripe } from '@/lib/stripe';
import { getStripeSecretKey, isTestMode } from '@/lib/env-mode';
import { getBerlinDayStartFromDateString, getBerlinDayEndFromDateString } from '@/lib/timezone';

/**
 * Stripe-Reconciliation-Sync — geteilte Kernlogik fuer den manuellen
 * Admin-Button (`/api/admin/buchhaltung/stripe-reconciliation/sync`) und den
 * stuendlichen Cron (`/api/cron/stripe-sync`).
 *
 * Laedt alle erfolgreichen PaymentIntents im Zeitraum [from, to] (Datum-Strings
 * YYYY-MM-DD, Berlin-TZ-bewusst) und matcht sie gegen `bookings`. User-gesetzte
 * States (`manual`/`refunded`) bleiben unangetastet.
 *
 * Wirft, wenn kein Stripe-Key konfiguriert ist.
 */
export async function runStripeSync({
  from,
  to,
}: {
  from: string;
  to: string;
}): Promise<{ synced: number }> {
  if (!(await getStripeSecretKey())) {
    throw new Error('Stripe API-Key nicht konfiguriert.');
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
        // ── Auto-Match-Kaskade ─────────────────────────────────────────────
        // Vier Stufen + Doppelzahlungs-Schutz. Sobald eine Stufe trifft → fertig.
        //  1) bookings.payment_intent_id exact                 — Standard-Pfad
        //  2) intent.metadata.pre_booking_id exact             — checkout-intent schreibt
        //                                                        die geplante Buchungs-ID rein
        //  3) pi.receipt_email + Betrag ±0.50 EUR              — nur fuer Buchungen mit
        //                                                        PENDING/AWAITING/MANUAL-UNPAID-
        //                                                        Praefix oder leerer PI
        //                                                        (= Webhook lief nicht durch).
        //                                                        Bei Treffer: bookings.payment_intent_id
        //                                                        wird auf den echten PI korrigiert.
        //  4) metadata.user_id + Betrag cent-exakt + 7d-Fenster — sehr defensiv (nur eindeutig).
        //
        // Doppelzahlungs-Schutz: findet einer der Lookups eine Buchung, die bereits
        // durch eine ANDERE verknuepfte stripe_transactions-Row bedient ist, wird
        // dieser PI als unmatched gelassen + reconciliation_note "Moegliche
        // Doppelzahlung" gesetzt. Die UI-Detection im GET-Endpoint erkennt das
        // zusaetzlich und bietet den Quick-Button "Als Doppelzahlung erfassen".
        let booking: { id: string } | null = null;
        let matchSource: 'pi' | 'pre_booking_id' | 'email_amount' | 'metadata_user' | null = null;
        let duplicateNote: string | null = null;

        // Helper: bereits-verknuepft-Check (existiert eine andere matched/manual
        // stripe_transactions-Row fuer diese Buchung?)
        async function hasOtherLink(bookingId: string): Promise<{ pi: string } | null> {
          const { data: other } = await supabase
            .from('stripe_transactions')
            .select('stripe_payment_intent_id')
            .eq('booking_id', bookingId)
            .neq('stripe_payment_intent_id', pi.id)
            .in('match_status', ['matched', 'manual'])
            .limit(1)
            .maybeSingle();
          return other?.stripe_payment_intent_id ? { pi: other.stripe_payment_intent_id } : null;
        }

        // Stufe 1: PI-Lookup
        {
          const { data: b } = await supabase
            .from('bookings')
            .select('id')
            .eq('payment_intent_id', pi.id)
            .maybeSingle();
          if (b?.id) {
            booking = b;
            matchSource = 'pi';
          }
        }

        // Stufe 2: Metadata pre_booking_id
        if (!booking) {
          const preBookingId = typeof pi.metadata?.pre_booking_id === 'string'
            ? pi.metadata.pre_booking_id.trim()
            : '';
          if (preBookingId) {
            const { data: b } = await supabase
              .from('bookings')
              .select('id')
              .eq('id', preBookingId)
              .maybeSingle();
            if (b?.id) {
              const other = await hasOtherLink(b.id);
              if (!other) {
                booking = b;
                matchSource = 'pre_booking_id';
              } else {
                duplicateNote = `Moegliche Doppelzahlung: Buchung ${b.id} wurde bereits ueber ${other.pi} bezahlt — pruefe Erstattung.`;
              }
            }
          }
        }

        // Stufe 3: Email + Betrag (nur Buchungen mit PENDING/AWAITING/MANUAL-UNPAID PI)
        if (!booking && !duplicateNote) {
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

        // Stufe 4: Heuristik metadata.user_id + Betrag cent-exakt + 7d-Fenster
        if (!booking && !duplicateNote) {
          const userId = typeof pi.metadata?.user_id === 'string'
            ? pi.metadata.user_id.trim()
            : '';
          if (userId) {
            const intentCreatedMs = pi.created * 1000;
            const fromMs = intentCreatedMs - 7 * 24 * 60 * 60 * 1000;
            const toMs = intentCreatedMs + 7 * 24 * 60 * 60 * 1000;
            const { data: candidates } = await supabase
              .from('bookings')
              .select('id, price_total, created_at')
              .eq('user_id', userId)
              .gte('created_at', new Date(fromMs).toISOString())
              .lte('created_at', new Date(toMs).toISOString())
              .limit(20);

            const exactAmount = (candidates ?? []).filter(
              (b) => Math.abs(Number(b.price_total ?? 0) - amount) < 0.01,
            );
            if (exactAmount.length === 1) {
              const other = await hasOtherLink(exactAmount[0].id);
              if (!other) {
                booking = { id: exactAmount[0].id };
                matchSource = 'metadata_user';
              } else {
                duplicateNote = `Moegliche Doppelzahlung: Buchung ${exactAmount[0].id} wurde bereits ueber ${other.pi} bezahlt — pruefe Erstattung.`;
              }
            }
          }
        }

        // Doppelzahlungs-Schutz auch fuer den email_amount-Pfad: wenn die
        // gefundene Buchung bereits eine andere verknuepfte Tx hat → abbrechen.
        if (booking && matchSource === 'email_amount') {
          const other = await hasOtherLink(booking.id);
          if (other) {
            duplicateNote = `Moegliche Doppelzahlung: Buchung wurde bereits ueber ${other.pi} bezahlt — pruefe Erstattung.`;
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

  return { synced };
}
