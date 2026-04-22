import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { checkAdminAuth } from '@/lib/admin-auth';
import { getStripe } from '@/lib/stripe';
import { buildPaymentLinkEmail } from '@/lib/payment-link-email';
import { logAudit } from '@/lib/audit';

/**
 * POST /api/admin/booking/[id]/resend-payment-link
 *
 * Sendet die Zahlungs-Link-E-Mail erneut an den Kunden.
 * Body: { to?: string }  (optional — default: booking.customer_email)
 *
 * Voraussetzung: Buchung hat `stripe_payment_link_id` (wurde bereits
 * via /approve-booking oder manuell freigegeben). Bei fehlendem PL
 * 400 — der Admin muss die Buchung erst freigeben.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await checkAdminAuth())) {
    return NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 401 });
  }

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const to = typeof body?.to === 'string' && body.to.includes('@') ? body.to : null;

  const supabase = createServiceClient();

  const { data: booking } = await supabase
    .from('bookings')
    .select('id, customer_name, customer_email, product_name, days, rental_from, rental_to, price_total, delivery_mode, stripe_payment_link_id')
    .eq('id', id)
    .maybeSingle();

  if (!booking) {
    return NextResponse.json({ error: 'Buchung nicht gefunden.' }, { status: 404 });
  }

  if (!booking.stripe_payment_link_id) {
    return NextResponse.json(
      { error: 'Diese Buchung hat keinen Zahlungs-Link. Bitte zuerst freigeben.' },
      { status: 400 },
    );
  }

  const recipient = to ?? booking.customer_email;
  if (!recipient) {
    return NextResponse.json({ error: 'Keine Empfänger-E-Mail.' }, { status: 400 });
  }

  // URL vom Stripe PL holen (nicht aus notes — robuster gegen manuelle Edits)
  let paymentUrl: string;
  let isActive: boolean;
  try {
    const stripe = await getStripe();
    const pl = await stripe.paymentLinks.retrieve(booking.stripe_payment_link_id);
    paymentUrl = pl.url;
    isActive = pl.active ?? false;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `Stripe-Fehler: ${msg}` }, { status: 502 });
  }

  if (!isActive) {
    return NextResponse.json(
      { error: 'Der Zahlungs-Link ist nicht mehr aktiv (wurde deaktiviert oder bereits bezahlt).' },
      { status: 400 },
    );
  }

  const deliveryMode: 'versand' | 'abholung' = booking.delivery_mode === 'abholung' ? 'abholung' : 'versand';
  const { subject, html } = await buildPaymentLinkEmail({
    bookingId: booking.id,
    customerName: booking.customer_name,
    productName: String(booking.product_name ?? ''),
    days: booking.days ?? 1,
    rentalFrom: String(booking.rental_from ?? ''),
    rentalTo: String(booking.rental_to ?? ''),
    priceTotal: Number(booking.price_total ?? 0),
    deliveryMode,
    paymentUrl,
  });

  try {
    const { sendAndLog } = await import('@/lib/email');
    await sendAndLog({
      to: recipient,
      subject,
      html,
      bookingId: booking.id,
      emailType: 'payment_link',
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `E-Mail-Versand fehlgeschlagen: ${msg}` }, { status: 502 });
  }

  await logAudit({
    action: 'booking.resend_payment_link',
    entityType: 'booking',
    entityId: booking.id,
    entityLabel: String(booking.product_name ?? ''),
    changes: { recipient },
    request: req,
  });

  return NextResponse.json({ ok: true, paymentUrl });
}
