import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { logAudit } from '@/lib/audit';
import {
  loadUgcSettings,
  createUgcCoupon,
  sendUgcFeaturedEmail,
} from '@/lib/customer-ugc';

export const runtime = 'nodejs';

type Params = Promise<{ id: string }>;

/**
 * POST /api/admin/customer-ugc/[id]/feature
 * Body: { channel: 'social' | 'blog' | 'website' | 'other', reference?: string }
 *
 * Markiert das Material als "veroeffentlicht" und vergibt einen Bonus-Gutschein.
 * Nur moeglich aus Status 'approved'.
 */
export async function POST(req: NextRequest, { params }: { params: Params }) {
  const { id } = await params;

  const body = await req.json();
  const channel = String(body?.channel ?? 'other');
  const reference = String(body?.reference ?? '').trim().slice(0, 500);

  if (!['social', 'blog', 'website', 'other'].includes(channel)) {
    return NextResponse.json({ error: 'Ungültiger Kanal.' }, { status: 400 });
  }

  const supabase = createServiceClient();

  const { data: submission } = await supabase
    .from('customer_ugc_submissions')
    .select('id, status, customer_email, customer_name, booking_id, bonus_coupon_code')
    .eq('id', id)
    .maybeSingle();

  if (!submission) {
    return NextResponse.json({ error: 'Einreichung nicht gefunden.' }, { status: 404 });
  }

  if (submission.status !== 'approved' && submission.status !== 'featured') {
    return NextResponse.json(
      {
        error: `Feature ist nur nach Freigabe möglich (Status: "${submission.status}").`,
      },
      { status: 400 },
    );
  }

  const settings = await loadUgcSettings(supabase);

  let bonusCode = submission.bonus_coupon_code;
  if (!bonusCode && submission.customer_email) {
    bonusCode = await createUgcCoupon(supabase, {
      prefix: 'BONUS',
      submissionId: id,
      targetEmail: submission.customer_email,
      discountPercent: settings.feature_discount_percent,
      minOrderValue: settings.feature_min_order_value,
      validityDays: settings.feature_validity_days,
      description: `Feature-Bonus für Kundenmaterial (Buchung ${submission.booking_id})`,
    });
  }

  const { error: updateErr } = await supabase
    .from('customer_ugc_submissions')
    .update({
      status: 'featured',
      bonus_coupon_code: bonusCode,
      featured_at: new Date().toISOString(),
      featured_channel: channel,
      featured_reference: reference || null,
    })
    .eq('id', id);

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  if (bonusCode && submission.customer_email) {
    try {
      await sendUgcFeaturedEmail({
        to: submission.customer_email,
        name: submission.customer_name ?? 'Kamera-Fan',
        code: bonusCode,
        discountPercent: settings.feature_discount_percent,
        validityDays: settings.feature_validity_days,
        minOrderValue: settings.feature_min_order_value,
        channel,
      });
    } catch (e) {
      console.error('[ugc-feature] E-Mail-Fehler:', e);
    }
  }

  await logAudit({
    action: 'ugc.feature',
    entityType: 'customer_ugc',
    entityId: id,
    changes: { channel, reference, bonusCode },
    request: req,
  });

  return NextResponse.json({ success: true, bonusCode });
}
