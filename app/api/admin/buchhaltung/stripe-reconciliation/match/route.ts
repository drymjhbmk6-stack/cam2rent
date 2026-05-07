import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { checkAdminAuth } from '@/lib/admin-auth';
import { logAudit } from '@/lib/audit';

export async function POST(req: NextRequest) {
  if (!(await checkAdminAuth())) {
    return NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 401 });
  }

  const body = await req.json();
  const { transaction_id, booking_id } = body;

  if (!transaction_id || !booking_id) {
    return NextResponse.json({ error: 'transaction_id und booking_id erforderlich.' }, { status: 400 });
  }

  const supabase = createServiceClient();

  // Sweep 8 M2: Validate booking exists — sonst koennte ein Mitarbeiter
  // mit `finanzen`-Permission einen Stripe-Refund auf eine fremde Buchungs-
  // ID matchen und dadurch USt-VA-Reports verzerren.
  const { data: existingBooking } = await supabase
    .from('bookings')
    .select('id')
    .eq('id', booking_id)
    .maybeSingle();
  if (!existingBooking) {
    return NextResponse.json({ error: 'Buchung nicht gefunden.' }, { status: 404 });
  }

  const { error } = await supabase
    .from('stripe_transactions')
    .update({
      booking_id,
      match_status: 'manual',
    })
    .eq('id', transaction_id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await logAudit({
    action: 'stripe.manual_match',
    entityType: 'stripe_transaction',
    entityId: transaction_id,
    changes: { booking_id },
    request: req,
  });

  return NextResponse.json({ ok: true });
}
