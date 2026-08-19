import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { checkAdminAuth } from '@/lib/admin-auth';
import { getStripe } from '@/lib/stripe';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/booking/[id]/stripe-fee
 *
 * Liefert die tatsaechliche Stripe-Transaktionsgebuehr der Buchungszahlung
 * (live via Stripe API, gleiches Muster wie `lib/buchhaltung/stripe-sync.ts`).
 * Stripe erstattet seine Gebuehr bei einem Refund NICHT an den Haendler
 * zurueck — ein Vollrefund kostet also zusaetzlich zum Umsatzausfall die
 * Gebuehr. Wird vom Storno-Dialog fuer die Option "Voll, abzgl.
 * Stripe-Gebuehr" genutzt, damit der Admin diese Gebuehr beim Kulanz-Storno
 * einbehalten kann, ohne sie manuell nachzuschlagen.
 *
 * Faellt bei fehlgeschlagenem Live-Call auf den gecachten Wert aus dem
 * Stripe-Abgleich (`stripe_transactions.fee`) zurueck, falls vorhanden.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await checkAdminAuth())) {
    return NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 401 });
  }

  const { id } = await params;
  const supabase = createServiceClient();

  const { data: booking } = await supabase
    .from('bookings')
    .select('id, payment_intent_id')
    .eq('id', id)
    .maybeSingle();

  const pi = booking?.payment_intent_id as string | null | undefined;
  if (!pi || !pi.startsWith('pi_')) {
    return NextResponse.json({ available: false, fee: 0 });
  }

  // 1. Live von Stripe (autoritativ) — spiegelt lib/buchhaltung/stripe-sync.ts
  try {
    const stripe = await getStripe();
    const intent = await stripe.paymentIntents.retrieve(pi);
    if (intent.latest_charge && typeof intent.latest_charge === 'string') {
      const charge = await stripe.charges.retrieve(intent.latest_charge, {
        expand: ['balance_transaction'],
      });
      const bt = charge.balance_transaction;
      if (bt && typeof bt !== 'string') {
        return NextResponse.json({ available: true, fee: bt.fee / 100, source: 'stripe' });
      }
    }
  } catch (err) {
    console.error('[stripe-fee] Live-Lookup fehlgeschlagen fuer', pi, err);
  }

  // 2. Fallback: gecachter Wert aus dem Stripe-Abgleich (falls dort schon
  // synchronisiert) — besser als gar kein Wert.
  const { data: tx } = await supabase
    .from('stripe_transactions')
    .select('fee')
    .eq('stripe_payment_intent_id', pi)
    .not('fee', 'is', null)
    .order('stripe_created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (tx && typeof tx.fee === 'number' && tx.fee > 0) {
    return NextResponse.json({ available: true, fee: tx.fee, source: 'cached' });
  }

  return NextResponse.json({ available: false, fee: 0 });
}
