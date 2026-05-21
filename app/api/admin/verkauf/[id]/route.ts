import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { checkAdminAuth } from '@/lib/admin-auth';
import { logAudit } from '@/lib/audit';
import { getStripe } from '@/lib/stripe';
import { dispatchSaleInvoice } from '@/lib/verkauf';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * POST /api/admin/verkauf/[id]
 * Body: { action: 'resend' | 'cancel' | 'mark_paid' }
 *  - resend:    Rechnung + Zahlungslink erneut an den Kunden schicken
 *  - cancel:    Verkauf stornieren (Zahlungslink deaktivieren)
 *  - mark_paid: Verkauf manuell als bezahlt markieren (z.B. Barzahlung)
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await checkAdminAuth())) {
    return NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 401 });
  }
  const { id } = await params;
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Ungültiger Request-Body.' }, { status: 400 });
  }
  const action = String(body.action ?? '');

  const supabase = createServiceClient();
  const { data: booking } = await supabase
    .from('bookings')
    .select('id, booking_type, status, stripe_payment_link_id, customer_email')
    .eq('id', id)
    .maybeSingle();

  if (!booking || booking.booking_type !== 'kauf') {
    return NextResponse.json({ error: 'Verkauf nicht gefunden.' }, { status: 404 });
  }

  // ── Rechnung + Zahlungslink erneut senden ───────────────────────────────
  if (action === 'resend') {
    if (booking.status !== 'awaiting_payment') {
      return NextResponse.json({ error: 'Verkauf ist nicht mehr offen.' }, { status: 409 });
    }
    try {
      await dispatchSaleInvoice(supabase, id);
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : 'Versand fehlgeschlagen.' },
        { status: 500 },
      );
    }
    await logAudit({ action: 'verkauf.resend', entityType: 'booking', entityId: id, request: req });
    return NextResponse.json({ ok: true });
  }

  // ── Stornieren ──────────────────────────────────────────────────────────
  if (action === 'cancel') {
    if (booking.status === 'cancelled') {
      return NextResponse.json({ ok: true, already: true });
    }
    await supabase.from('bookings').update({ status: 'cancelled' }).eq('id', id);
    await supabase
      .from('invoices')
      .update({ status: 'cancelled', payment_status: 'cancelled' })
      .eq('booking_id', id);
    if (booking.stripe_payment_link_id) {
      try {
        const stripe = await getStripe();
        await stripe.paymentLinks.update(booking.stripe_payment_link_id, { active: false });
      } catch (err) {
        console.warn('[verkauf] Zahlungslink-Deaktivierung fehlgeschlagen:', err);
      }
    }
    await logAudit({ action: 'verkauf.cancel', entityType: 'booking', entityId: id, request: req });
    return NextResponse.json({ ok: true });
  }

  // ── Manuell als bezahlt markieren ───────────────────────────────────────
  if (action === 'mark_paid') {
    if (booking.status === 'confirmed') {
      return NextResponse.json({ ok: true, already: true });
    }
    const { data: updated } = await supabase
      .from('bookings')
      .update({ status: 'confirmed' })
      .eq('id', id)
      .eq('status', 'awaiting_payment')
      .select('id')
      .maybeSingle();
    if (!updated) {
      return NextResponse.json({ error: 'Verkauf ist nicht mehr offen.' }, { status: 409 });
    }
    await supabase
      .from('invoices')
      .update({ status: 'paid', payment_status: 'paid', paid_at: new Date().toISOString() })
      .eq('booking_id', id);
    if (booking.stripe_payment_link_id) {
      try {
        const stripe = await getStripe();
        await stripe.paymentLinks.update(booking.stripe_payment_link_id, { active: false });
      } catch { /* best-effort */ }
    }
    await logAudit({ action: 'verkauf.mark_paid', entityType: 'booking', entityId: id, request: req });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: 'Unbekannte Aktion.' }, { status: 400 });
}
