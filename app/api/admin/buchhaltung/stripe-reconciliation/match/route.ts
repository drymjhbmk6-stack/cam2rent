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
