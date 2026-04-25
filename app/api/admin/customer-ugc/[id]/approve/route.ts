import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { logAudit } from '@/lib/audit';
import {
  loadUgcSettings,
  createUgcCoupon,
  sendUgcApprovedEmail,
} from '@/lib/customer-ugc';

export const runtime = 'nodejs';

type Params = Promise<{ id: string }>;

/**
 * POST /api/admin/customer-ugc/[id]/approve
 * Status auf 'approved' setzen, Gutschein erzeugen, E-Mail verschicken.
 */
export async function POST(req: NextRequest, { params }: { params: Params }) {
  const { id } = await params;
  const supabase = createServiceClient();

  const { data: submission, error: loadErr } = await supabase
    .from('customer_ugc_submissions')
    .select('id, status, customer_email, customer_name, booking_id, reward_coupon_code')
    .eq('id', id)
    .maybeSingle();

  if (loadErr || !submission) {
    return NextResponse.json({ error: 'Einreichung nicht gefunden.' }, { status: 404 });
  }

  if (submission.status !== 'pending') {
    return NextResponse.json(
      { error: `Einreichung hat Status "${submission.status}" — Freigabe nicht möglich.` },
      { status: 400 },
    );
  }

  const settings = await loadUgcSettings(supabase);

  let couponCode = submission.reward_coupon_code;

  if (!couponCode && submission.customer_email) {
    couponCode = await createUgcCoupon(supabase, {
      prefix: 'UGC',
      submissionId: id,
      targetEmail: submission.customer_email,
      discountPercent: settings.approve_discount_percent,
      minOrderValue: settings.approve_min_order_value,
      validityDays: settings.approve_validity_days,
      description: `Dankeschön für Kundenmaterial (Buchung ${submission.booking_id})`,
    });
  }

  // Atomarer Status-Wechsel: nur wenn noch 'pending', sonst hat ein paralleler Klick
  // schon umgestellt und wir wuerden einen zweiten Coupon ausstellen.
  const { data: updateRows, error: updateErr } = await supabase
    .from('customer_ugc_submissions')
    .update({
      status: 'approved',
      reward_coupon_code: couponCode,
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('status', 'pending')
    .select('id');

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }
  if (!updateRows || updateRows.length === 0) {
    // Status hat sich zwischen unserem Read und Update geaendert (paralleler Klick).
    return NextResponse.json(
      { error: 'Einreichung wurde parallel bearbeitet — bitte Liste neu laden.' },
      { status: 409 },
    );
  }

  if (couponCode && submission.customer_email) {
    try {
      await sendUgcApprovedEmail({
        to: submission.customer_email,
        name: submission.customer_name ?? 'Kamera-Fan',
        code: couponCode,
        discountPercent: settings.approve_discount_percent,
        validityDays: settings.approve_validity_days,
        minOrderValue: settings.approve_min_order_value,
      });
    } catch (e) {
      console.error('[ugc-approve] E-Mail-Fehler:', e);
    }
  }

  await logAudit({
    action: 'ugc.approve',
    entityType: 'customer_ugc',
    entityId: id,
    changes: { couponCode },
    request: req,
  });

  return NextResponse.json({ success: true, couponCode });
}
